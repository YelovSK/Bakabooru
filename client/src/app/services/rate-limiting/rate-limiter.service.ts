import { Injectable, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';

/**
 * Simple backoff status for an API.
 */
export interface BackoffStatus {
    /** Whether the API is currently in backoff */
    inBackoff: boolean;
    /** Milliseconds until backoff ends (0 if not in backoff) */
    waitMs: number;
    /** Current backoff level (increases on consecutive 429s) */
    backoffLevel: number;
}

const STORAGE_KEY_PREFIX = 'rate_limiter_';
const DEFAULT_BACKOFF_MS = 10000; // 10 seconds base backoff
const MAX_BACKOFF_MS = 300000; // 5 minutes max
const BACKOFF_MULTIPLIER = 2;

/**
 * Simple rate limiter that reacts to 429 errors with exponential backoff.
 * No pre-emptive token counting - just send requests and handle 429s.
 */
@Injectable({
    providedIn: 'root',
})
export class RateLimiterService {
    /** Backoff state per API */
    private backoffState = new Map<string, { until: number; level: number }>();

    /** Signal for UI status display */
    private statusSignal = signal<Record<string, BackoffStatus>>({});

    /** Computed signal for easy access */
    readonly statuses = computed(() => this.statusSignal());

    constructor() {
        // Load persisted state
        this.loadState();

        // Update status every second for live countdown
        interval(1000)
            .pipe(takeUntilDestroyed())
            .subscribe(() => this.refreshStatuses());
    }

    /**
     * Call this when you receive a 429 error.
     * Increases backoff level and sets the backoff timer.
     */
    reportRateLimitHit(apiId: string): void {
        const existing = this.backoffState.get(apiId) ?? { until: 0, level: 0 };
        const newLevel = existing.level + 1;
        const backoffMs = Math.min(
            DEFAULT_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, newLevel - 1),
            MAX_BACKOFF_MS
        );

        this.backoffState.set(apiId, {
            until: Date.now() + backoffMs,
            level: newLevel,
        });

        this.saveState();
        this.refreshStatuses();

        console.log(`RateLimiter: ${apiId} hit 429, backing off for ${backoffMs / 1000}s (level ${newLevel})`);
    }

    /**
     * Call this when a request succeeds.
     * Gradually reduces backoff level.
     */
    reportSuccess(apiId: string): void {
        const existing = this.backoffState.get(apiId);
        if (existing && existing.level > 0) {
            this.backoffState.set(apiId, {
                until: existing.until,
                level: Math.max(0, existing.level - 1),
            });
            this.saveState();
            this.refreshStatuses();
        }
    }

    /**
     * Gets the current backoff status for an API.
     */
    getStatus(apiId: string): BackoffStatus {
        const now = Date.now();
        const state = this.backoffState.get(apiId);

        if (!state || state.until <= now) {
            return { inBackoff: false, waitMs: 0, backoffLevel: state?.level ?? 0 };
        }

        return {
            inBackoff: true,
            waitMs: state.until - now,
            backoffLevel: state.level,
        };
    }

    /**
     * Checks if an API is currently in backoff.
     */
    isInBackoff(apiId: string): boolean {
        return this.getStatus(apiId).inBackoff;
    }

    /**
     * Resets backoff state for an API.
     */
    reset(apiId: string): void {
        this.backoffState.delete(apiId);
        this.saveState();
        this.refreshStatuses();
    }

    /**
     * Resets all backoff states.
     */
    resetAll(): void {
        this.backoffState.clear();
        this.saveState();
        this.refreshStatuses();
    }

    private refreshStatuses(): void {
        const updated: Record<string, BackoffStatus> = {};
        this.backoffState.forEach((_, apiId) => {
            updated[apiId] = this.getStatus(apiId);
        });
        this.statusSignal.set(updated);
    }

    private loadState(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_PREFIX + 'state');
            if (stored) {
                const parsed = JSON.parse(stored) as Record<string, { until: number; level: number }>;
                const now = Date.now();

                for (const [apiId, state] of Object.entries(parsed)) {
                    // Only restore if backoff hasn't expired
                    if (state.until > now || state.level > 0) {
                        this.backoffState.set(apiId, state);
                    }
                }
            }
        } catch {
            // Ignore parse errors
        }
        this.refreshStatuses();
    }

    private saveState(): void {
        const obj: Record<string, { until: number; level: number }> = {};
        this.backoffState.forEach((state, apiId) => {
            obj[apiId] = state;
        });
        localStorage.setItem(STORAGE_KEY_PREFIX + 'state', JSON.stringify(obj));
    }
}
