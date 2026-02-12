import { Injectable, inject, signal, computed } from "@angular/core";
import { Observable, of, Subject, BehaviorSubject } from "rxjs";
import { map, catchError, switchMap, tap, finalize, filter, take } from "rxjs/operators";

import { AutoTaggingResult, TaggingProvider, SettingValue } from "./models";
import { MockTaggingProvider } from "./providers/mock-tagging.provider";
import { SaucenaoTaggingProvider } from "./providers/saucenao-tagging.provider";
import { SaucenaoService } from "../api/saucenao/saucenao.service";
import { DanbooruService } from "../api/danbooru/danbooru.service";
import { GelbooruService } from "../api/gelbooru/gelbooru.service";
import { StorageService, STORAGE_KEYS } from "../storage.service";
import { RateLimiterService, BackoffStatus } from "../rate-limiting/rate-limiter.service";
import { TaggingCacheService } from "../tagging/tagging-cache.service";
import { WdTaggerService } from "../api/wd-tagger/wd-tagger.service";
import { WdTaggerProvider } from "./providers/wd-tagger.provider";

/**
 * Status of a tagging queue entry.
 */
export type TaggingStatus = 'queued' | 'tagging' | 'completed' | 'failed';

/**
 * Entry in the tagging queue.
 */
export interface TaggingEntry {
  id: string;
  file: File;
  provider?: TaggingProvider;
  status: TaggingStatus;
  results?: AutoTaggingResult[];
  error?: string;
  fromCache?: boolean;
}

interface QueueItem {
  id: string;
  file: File;
  provider?: TaggingProvider;
  subject: Subject<TaggingEntry>;
}

@Injectable({
  providedIn: "root",
})
export class AutoTaggingService {
  private providers = signal<TaggingProvider[]>([]);
  private enabledProviders = signal<Set<string>>(new Set());
  private entriesMap = signal<Map<string, TaggingEntry>>(new Map());
  private queueItems: QueueItem[] = [];
  private processing = false;
  private idCounter = 0;
  private isPausedSignal = signal(false);

  /** Whether queue processing is paused */
  readonly isPaused = computed(() => this.isPausedSignal());

  private readonly saucenao = inject(SaucenaoService);
  private readonly danbooru = inject(DanbooruService);
  private readonly gelbooru = inject(GelbooruService);
  private readonly storage = inject(StorageService);
  private readonly rateLimiter = inject(RateLimiterService);
  private readonly cache = inject(TaggingCacheService);
  private readonly wdTagger = inject(WdTaggerService);

  /** All queue entries - consumers can observe this for global status */
  readonly entries = computed(() => this.entriesMap());

  /** Rate limiter statuses for UI display */
  readonly rateLimiterStatuses = this.rateLimiter.statuses;

  constructor() {
    // Register default providers
    this.registerProvider(new MockTaggingProvider());
    this.registerProvider(
      new SaucenaoTaggingProvider(
        this.saucenao,
        this.danbooru,
        this.gelbooru,
        this.rateLimiter,
      ),
    );
    this.registerProvider(new WdTaggerProvider(this.wdTagger));

    // Load enabled state from storage
    this.loadEnabledProviders();
  }

  /**
   * Returns only enabled providers (for UI display in upload/tagging).
   */
  getEnabledProviders(): TaggingProvider[] {
    const enabled = this.enabledProviders();
    return this.providers().filter(p => enabled.has(p.id));
  }

  /**
   * Check if a provider is enabled.
   */
  isProviderEnabled(providerId: string): boolean {
    return this.enabledProviders().has(providerId);
  }

  /**
   * Enable or disable a provider.
   */
  setProviderEnabled(providerId: string, enabled: boolean): void {
    this.enabledProviders.update(set => {
      const newSet = new Set(set);
      if (enabled) {
        newSet.add(providerId);
      } else {
        newSet.delete(providerId);
      }
      return newSet;
    });
    this.saveEnabledProviders();
  }

  /**
   * Queue a file for tagging with all applicable providers.
   * Returns an Observable that emits status updates and completes when done.
   */
  queue(file: File): Observable<TaggingEntry> {
    return this.queueInternal(file);
  }

  /**
   * Queue a file for tagging with a specific provider.
   * Returns an Observable that emits status updates and completes when done.
   */
  queueWith(file: File, provider: TaggingProvider): Observable<TaggingEntry> {
    return this.queueInternal(file, provider);
  }

  private queueInternal(file: File, provider?: TaggingProvider): Observable<TaggingEntry> {
    const id = `tag_${++this.idCounter}_${Date.now()}`;
    const subject = new Subject<TaggingEntry>();

    const entry: TaggingEntry = {
      id,
      file,
      provider,
      status: 'queued',
    };

    // Add to entries map
    this.updateEntry(entry);

    // Emit initial state
    subject.next(entry);

    // Add to queue
    this.queueItems.push({ id, file, provider, subject });

    // Start processing if not already
    this.processQueue();

    return subject.asObservable();
  }

  /**
   * Pause queue processing.
   */
  pause(): void {
    this.isPausedSignal.set(true);
  }

  /**
   * Resume queue processing.
   */
  resume(): void {
    this.isPausedSignal.set(false);
    this.processQueue();
  }

  /**
   * Cancel all pending queue items.
   */
  cancelAll(): void {
    // Complete all pending subjects with failed status
    for (const item of this.queueItems) {
      const entry: TaggingEntry = {
        id: item.id,
        file: item.file,
        provider: item.provider,
        status: 'failed',
        error: 'Cancelled',
      };
      this.updateEntry(entry);
      item.subject.next(entry);
      item.subject.complete();
    }
    this.queueItems = [];
    this.isPausedSignal.set(false);
  }

  private updateEntry(entry: TaggingEntry): void {
    this.entriesMap.update(map => {
      const newMap = new Map(map);
      newMap.set(entry.id, entry);
      return newMap;
    });
  }

  private processQueue(): void {
    if (this.processing || this.queueItems.length === 0 || this.isPausedSignal()) {
      return;
    }

    this.processing = true;
    const item = this.queueItems.shift()!;

    this.executeTagging(item).subscribe({
      complete: () => {
        this.processing = false;
        this.processQueue();
      },
      error: () => {
        this.processing = false;
        this.processQueue();
      }
    });
  }

  private executeTagging(item: QueueItem): Observable<void> {
    const { id, file, provider, subject } = item;

    // Update status to tagging
    const taggingEntry: TaggingEntry = {
      id,
      file,
      provider,
      status: 'tagging',
    };
    this.updateEntry(taggingEntry);
    subject.next(taggingEntry);

    // Check cache first (only for queue(), not queueWith())
    // When a specific provider is requested, skip cache - user explicitly wants that provider to run
    const cacheCheck$ = provider
      ? of(null)  // Skip cache for specific provider
      : this.cache.get(file);

    return cacheCheck$.pipe(
      switchMap(cached => {
        if (cached?.status === 'success' && cached.results) {
          // Use cached result
          const completedEntry: TaggingEntry = {
            id,
            file,
            provider,
            status: 'completed',
            results: cached.results,
            fromCache: true,
          };
          this.updateEntry(completedEntry);
          subject.next(completedEntry);
          subject.complete();
          return of(undefined);
        }

        // Execute tagging - normalize to array
        const tagging$: Observable<AutoTaggingResult[]> = provider
          ? provider.tag(file).pipe(map(r => [r]))
          : this.runAllProviders(file);

        return tagging$.pipe(
          tap(results => {
            const hasResults = results.some(r => r.categorizedTags.length > 0);

            // Cache the result
            this.cache.set(file, {
              status: hasResults ? 'success' : 'no-results',
              results,
              attemptedProviders: provider ? [provider.id] : this.providers().map(p => p.id),
              timestamp: Date.now(),
            }).subscribe();

            const completedEntry: TaggingEntry = {
              id,
              file,
              provider,
              status: 'completed',
              results,
              fromCache: false,
            };
            this.updateEntry(completedEntry);
            subject.next(completedEntry);
            subject.complete();
          }),
          catchError(error => {
            const failedEntry: TaggingEntry = {
              id,
              file,
              provider,
              status: 'failed',
              error: error?.message || 'Unknown error',
            };
            this.updateEntry(failedEntry);
            subject.next(failedEntry);
            subject.complete();
            return of(undefined);
          }),
          map(() => undefined),
        );
      }),
    );
  }

  private runAllProviders(file: File): Observable<AutoTaggingResult[]> {
    const enabled = this.enabledProviders();
    const applicableProviders = this.providers().filter(
      p => p.canHandle(file) && enabled.has(p.id)
    );
    if (applicableProviders.length === 0) {
      return of([]);
    }

    // Run providers sequentially to respect rate limits
    return applicableProviders.reduce(
      (chain, provider) => chain.pipe(
        switchMap(results => provider.tag(file).pipe(
          map(result => [...results, result]),
          catchError(() => of(results)), // Skip failed provider
        )),
      ),
      of([] as AutoTaggingResult[]),
    );
  }

  // ============ Provider Management (existing API) ============

  /**
   * Registers a new tagging provider.
   */
  registerProvider(provider: TaggingProvider): void {
    const savedSettings = this.loadSettings(provider.id);
    if (savedSettings) {
      provider.updateSettings(savedSettings);
    }

    this.providers.update((ps) => {
      const newProviders = [...ps, provider];
      return newProviders.sort((a, b) => b.priority - a.priority);
    });
  }

  /**
   * Saves settings for a provider.
   */
  saveSettings(providerId: string, settings: Record<string, SettingValue>): void {
    const provider = this.providers().find((p) => p.id === providerId);
    if (provider) {
      provider.updateSettings(settings);
      this.storage.setItem(
        STORAGE_KEYS.AUTO_TAGGING_SETTINGS + providerId,
        JSON.stringify(settings),
      );
    }
  }

  private loadSettings(providerId: string): Record<string, SettingValue> | null {
    const key = STORAGE_KEYS.AUTO_TAGGING_SETTINGS + providerId;
    return this.storage.getJson<Record<string, SettingValue>>(key);
  }

  /**
   * Returns the list of currently registered providers.
   */
  getProviders(): TaggingProvider[] {
    return this.providers();
  }

  private loadEnabledProviders(): void {
    const stored = this.storage.getJson<string[]>(STORAGE_KEYS.AUTO_TAGGING_SETTINGS + 'enabled_providers');
    if (stored) {
      this.enabledProviders.set(new Set(stored));
    } else {
      // Default: enable all providers except mock
      const allIds = this.providers()
        .filter(p => p.id !== 'mock-provider')
        .map(p => p.id);
      this.enabledProviders.set(new Set(allIds));
    }
  }

  private saveEnabledProviders(): void {
    const enabled = Array.from(this.enabledProviders());
    this.storage.setItem(
      STORAGE_KEYS.AUTO_TAGGING_SETTINGS + 'enabled_providers',
      JSON.stringify(enabled),
    );
  }
}
