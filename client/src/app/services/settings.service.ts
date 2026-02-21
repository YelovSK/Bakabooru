import { Injectable, inject, signal, computed } from '@angular/core';

import { StorageService, STORAGE_KEYS } from './storage.service';

export interface PostSettings {
  autoPlayVideos: boolean;
  startVideosMuted: boolean;
  enablePostPreviewOnHover: boolean;
  postPreviewDelayMs: number;
}

const DEFAULT_POST_SETTINGS: PostSettings = {
  autoPlayVideos: true,
  startVideosMuted: false,
  enablePostPreviewOnHover: true,
  postPreviewDelayMs: 700,
};

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private readonly storage = inject(StorageService);

  private readonly _postSettings = signal<PostSettings>(this.loadPostSettings());

  /** Reactive post settings */
  readonly postSettings = this._postSettings.asReadonly();

  /** Convenience computed for auto-play videos */
  readonly autoPlayVideos = computed(() => this._postSettings().autoPlayVideos);

  /** Convenience computed for start muted */
  readonly startVideosMuted = computed(() => this._postSettings().startVideosMuted);

  /** Convenience computed for hover preview enabled */
  readonly enablePostPreviewOnHover = computed(() => this._postSettings().enablePostPreviewOnHover);

  /** Convenience computed for hover preview delay */
  readonly postPreviewDelayMs = computed(() => this._postSettings().postPreviewDelayMs);

  private loadPostSettings(): PostSettings {
    const saved = this.storage.getJson<PostSettings>(STORAGE_KEYS.POST_SETTINGS);
    return { ...DEFAULT_POST_SETTINGS, ...saved };
  }

  updatePostSettings(settings: Partial<PostSettings>): void {
    this._postSettings.update(current => {
      const updated = { ...current, ...settings };
      this.storage.setJson(STORAGE_KEYS.POST_SETTINGS, updated);
      return updated;
    });
  }
}
