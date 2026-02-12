import { Component, input, output, ChangeDetectionStrategy, computed, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AutoTaggingResult, CategorizedTag } from '@services/auto-tagging/models';
import { ButtonComponent } from '@shared/components/button/button.component';
import type { BackoffStatus } from '@services/rate-limiting/rate-limiter.service';

export type TaggingStatus = 'idle' | 'tagging' | 'completed' | 'failed';

export interface AutoTaggingProvider {
  id: string;
  name: string;
  priority: number;
}

@Component({
  selector: 'app-auto-tagging-results',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './auto-tagging-results.component.html',
  styleUrl: './auto-tagging-results.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AutoTaggingResultsComponent {
  status = input.required<TaggingStatus>();
  results = input.required<AutoTaggingResult[]>();

  /** Optional list of providers for per-provider run buttons */
  providers = input<AutoTaggingProvider[]>([]);

  /** Whether to show per-provider buttons */
  showProviderButtons = input(false);

  /** Optional rate limiter statuses for showing throttle info */
  rateLimiterStatuses = input<Record<string, BackoffStatus>>({});

  /** Emitted when a specific provider button is clicked */
  runProvider = output<string>();

  /** Emitted when "Apply Tags" is clicked for a result (providerId) */
  applyTags = output<string>();

  /** Emitted when "Apply Sources" is clicked for a result (providerId) */
  applySources = output<string>();

  /** Emitted when "Set Safety" is clicked for a result (providerId) */
  applySafety = output<string>();

  /** Internal tracking of which provider is loading */
  private loadingProviderId = signal<string | null>(null);

  constructor() {
    // Clear loading state when status changes to completed/failed
    effect(() => {
      const status = this.status();
      if (status === 'completed' || status === 'failed') {
        this.loadingProviderId.set(null);
      }
    });
  }

  /** Get loading provider info */
  loadingProvider = computed(() => {
    const loadingId = this.loadingProviderId();
    if (!loadingId) return null;
    return this.providers().find(p => p.id === loadingId) || null;
  });

  /** Get results excluding the currently loading provider, sorted by provider priority */
  displayResults = computed(() => {
    const loadingId = this.loadingProviderId();
    const providers = this.providers();
    let results = this.results();

    if (loadingId) {
      results = results.filter(r => r.providerId !== loadingId);
    }

    // Sort by provider priority (higher priority first)
    return [...results].sort((a, b) => {
      const aPriority = providers.find(p => p.id === a.providerId)?.priority ?? 0;
      const bPriority = providers.find(p => p.id === b.providerId)?.priority ?? 0;
      return bPriority - aPriority;
    });
  });

  /** Get active backoff info for display */
  activeBackoff = computed(() => {
    const statuses = this.rateLimiterStatuses();
    for (const [apiId, status] of Object.entries(statuses)) {
      if (status.inBackoff) {
        return { apiId, ...status };
      }
    }
    return null;
  });

  onRunProvider(providerId: string): void {
    this.loadingProviderId.set(providerId);
    this.runProvider.emit(providerId);
  }

  onApplyTags(providerId: string): void {
    this.applyTags.emit(providerId);
  }

  onApplySources(providerId: string): void {
    this.applySources.emit(providerId);
  }

  onApplySafety(providerId: string): void {
    this.applySafety.emit(providerId);
  }

  sortedTags(tags: CategorizedTag[]): CategorizedTag[] {
    return [...tags].sort((a, b) => {
      const aHasCategory = a.category && a.category !== 'general' ? 0 : 1;
      const bHasCategory = b.category && b.category !== 'general' ? 0 : 1;
      return aHasCategory - bHasCategory;
    });
  }
}
