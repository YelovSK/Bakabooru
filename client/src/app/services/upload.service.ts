import {
  Injectable,
  signal,
  inject,
  WritableSignal,
  DestroyRef,
} from "@angular/core";
import { BakabooruService } from "./api/bakabooru/bakabooru.service";
import { ToastService } from "./toast.service";
import { Safety, Post, ImageSearchResult } from "@models";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  of,
  catchError,
  tap,
  switchMap,
  filter,
  forkJoin,
  map,
  from,
  mergeMap,
  Observable,
} from "rxjs";

import { AutoTaggingService } from "./auto-tagging/auto-tagging.service";
import { AutoTaggingResult, TaggingStatus } from "./auto-tagging/models";

export type UploadStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadStatus;
  progress: number;
  tags: string[];
  sources: string[];
  safety: Safety;
  error?: string;
  post?: Post | null;
  duplicateOf?: Post | null;
  checkingDuplicate?: boolean;
  toastId?: number;

  // Auto-tagging fields
  taggingStatus: WritableSignal<TaggingStatus>;
  autoTags: WritableSignal<AutoTaggingResult[]>;
}

@Injectable({
  providedIn: "root",
})
export class UploadService {
  uploadQueue = signal<UploadItem[]>([]);
  readonly bakabooru = inject(BakabooruService);
  private toast = inject(ToastService);
  private autoTagging = inject(AutoTaggingService);
  private destroyRef = inject(DestroyRef);

  private findItem(id: string): UploadItem | undefined {
    return this.uploadQueue().find((i) => i.id === id);
  }

  private patchItem(id: string, changes: Partial<UploadItem>): void {
    this.uploadQueue.update((q) =>
      q.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  private cleanup() {
    this.uploadQueue().forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  }

  addFiles(files: File[]) {
    const currentQueue = this.uploadQueue();

    // Filter out files that are already in the queue (by name and size)
    const uniqueFiles = files.filter((file) =>
      !currentQueue.some((item) =>
        item.file.name === file.name && item.file.size === file.size
      )
    );

    if (uniqueFiles.length === 0) return;

    const newItems: UploadItem[] = uniqueFiles.map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "pending" as UploadStatus,
      progress: 0,
      tags: [],
      sources: [],
      safety: "safe",
      taggingStatus: signal<TaggingStatus>("idle"),
      autoTags: signal<AutoTaggingResult[]>([]),
    }));

    this.uploadQueue.update((q) => [...q, ...newItems]);
  }

  removeItem(id: string) {
    const item = this.uploadQueue().find((i) => i.id === id);
    if (!item) return;

    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    if (item.toastId !== undefined) {
      this.toast.remove(item.toastId);
    }
    this.uploadQueue.update((q) => q.filter((i) => i.id !== id));
  }

  updateItem(updatedItem: UploadItem) {
    this.uploadQueue.update((q) =>
      q.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
    );
  }

  clearCompleted() {
    this.uploadQueue.update((q) => {
      q.forEach((item) => {
        if (item.status === "completed" && item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      return q.filter((item) => item.status !== "completed");
    });
  }

  clearDuplicates() {
    this.uploadQueue.update((q) => {
      q.forEach((item) => {
        if (item.duplicateOf && item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      return q.filter((item) => !item.duplicateOf);
    });
  }

  hasDuplicates(): boolean {
    return this.uploadQueue().some((item) => item.duplicateOf);
  }

  clearAll() {
    this.uploadQueue.update((q) => {
      q.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      return [];
    });
  }

  autoTagAll() {
    const itemsToTag = this.uploadQueue().filter((item) =>
      item.status === "pending" ||
      item.status === "failed" ||
      item.status === "cancelled"
    );

    from(itemsToTag)
      .pipe(
        mergeMap((item: UploadItem) => this.triggerAutoTagging(item.id), 2),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  uploadAll() {
    this.uploadQueue.update((q) =>
      q.map((item) =>
        item.status === "failed" || item.status === "cancelled"
          ? { ...item, status: "pending" as UploadStatus, error: undefined }
          : item,
      ),
    );
    this.processQueue();
  }

  private processQueue() {
    const queue = this.uploadQueue();

    const nextItem = queue.find((i) => i.status === "pending");
    if (nextItem) {
      this.startUpload(nextItem.id);
      // Try to start another one if we still have slots
      this.processQueue();
    }
  }

  checkDuplicates() {
    const itemsToCheck = this.uploadQueue().filter((item) =>
      item.status === "pending" ||
      item.status === "failed" ||
      item.status === "cancelled"
    );

    from(itemsToCheck)
      .pipe(
        mergeMap((item: UploadItem) => this.checkDuplicate(item.id), 2),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  startUpload(id: string) {
    const item = this.findItem(id);
    if (!item) return;

    const toastId = this.toast.show(
      `Uploading ${item.file.name}...`,
      "info",
      0,
    );
    this.patchItem(id, { status: "uploading", progress: 0, toastId });

    this.bakabooru
      .uploadFile(item.file)
      .pipe(
        switchMap((res) => {
          // Upload completed
          if (res.token) {
            this.patchItem(id, { status: "processing", progress: 100 });
            this.toast.update(toastId, {
              message: `Processing ${item.file.name}...`,
              progress: 100,
            });

            return this.createPostWithTags(item, res.token);
            // Update still in progress
          } else {
            const progress = Math.round(res.progress);
            this.patchItem(id, { progress });
            this.toast.update(toastId, { progress });
            return of(null);
          }
        }),
        filter(
          (res): res is Post =>
            res !== null && "id" in res,
        ),
        tap((post) => {
          this.patchItem(id, { status: "completed", post });
          this.toast.update(toastId, {
            message: `Uploaded ${item.file.name}`,
            type: "success",
            duration: 5000,
            progress: undefined,
          });
          this.processQueue();
        }),
        catchError((err) => {
          const errorMsg =
            err.error?.description || err.message || "Upload failed";
          this.patchItem(id, { status: "failed", error: errorMsg });
          this.toast.update(toastId, {
            message: `Upload failed: ${item.file.name}`,
            type: "error",
            duration: 5000,
            progress: undefined,
          });
          this.processQueue();
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private createPostWithTags(item: UploadItem, token: string) {
    const allTagNames = this.collectAllTags(item);
    const allSources = this.collectAllSources(item);

    return this.bakabooru
      .createPost(token, item.safety, Array.from(allTagNames), allSources.join('\n'))
      .pipe(
        switchMap((post) => {
          const categorizedTags = this.collectCategorizedTags(item);
          if (categorizedTags.length === 0) return of(post);

          return this.updateTagCategories(categorizedTags).pipe(map(() => post));
        }),
      );
  }

  private collectAllTags(item: UploadItem): Set<string> {
    const allTagNames = new Set(item.tags);
    for (const result of item.autoTags()) {
      for (const ct of result.categorizedTags) {
        allTagNames.add(ct.name);
      }
    }
    return allTagNames;
  }

  private collectAllSources(item: UploadItem): string[] {
    const sourcesSet = new Set(item.sources);
    for (const result of item.autoTags()) {
      if (result.sources) {
        for (const source of result.sources) {
          sourcesSet.add(source);
        }
      }
    }
    return Array.from(sourcesSet);
  }

  private collectCategorizedTags(item: UploadItem): { name: string; category: string }[] {
    const categorizedTags: { name: string; category: string }[] = [];
    for (const result of item.autoTags()) {
      for (const ct of result.categorizedTags) {
        if (ct.category && ct.category !== "general") {
          categorizedTags.push({ name: ct.name, category: ct.category });
        }
      }
    }
    return categorizedTags;
  }

  private updateTagCategories(categorizedTags: { name: string; category: string }[]) {
    const updateTasks = categorizedTags.map((ct) =>
      this.bakabooru.getTag(ct.name).pipe(
        switchMap((tag) =>
          this.bakabooru.updateTag(ct.name, {
            category: ct.category,
            version: tag.version,
          }),
        ),
        catchError((err) => {
          console.error(`Failed to update tag ${ct.name}`, err);
          return of(null);
        }),
      ),
    );
    return forkJoin(updateTasks);
  }

  checkDuplicate(id: string): Observable<void> {
    const item = this.findItem(id);
    if (!item) {
      return of(undefined);
    }
    if (
      item.status !== "pending" &&
      item.status !== "failed" &&
      item.status !== "cancelled"
    ) {
      return of(undefined);
    }

    this.patchItem(id, { checkingDuplicate: true, duplicateOf: undefined });

    return this.bakabooru
      .reverseSearch(item.file)
      .pipe(
        tap((res: ImageSearchResult) => {
          const duplicate =
            res.exactPost ||
            (res.similarPosts.length > 0 && res.similarPosts[0].distance === 0
              ? res.similarPosts[0].post
              : null);
          this.patchItem(id, { checkingDuplicate: false, duplicateOf: duplicate });
        }),
        catchError(() => {
          this.patchItem(id, { checkingDuplicate: false });
          return of(null);
        }),
        map(() => undefined),
      );
  }

  addTag(id: string, tag: string) {
    const item = this.findItem(id);
    if (!item) return;

    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !item.tags.includes(trimmed)) {
      this.patchItem(id, { tags: [...item.tags, trimmed] });
    }
  }

  removeTag(id: string, tag: string) {
    const item = this.findItem(id);
    if (item) {
      this.patchItem(id, { tags: item.tags.filter((t) => t !== tag) });
    }
  }

  setSafety(id: string, safety: Safety) {
    this.patchItem(id, { safety });
  }

  cancel(id: string) {
    const item = this.findItem(id);
    if (!item || item.status === "completed") return;

    if (item.toastId !== undefined) {
      this.toast.remove(item.toastId);
    }
    this.patchItem(id, { status: "cancelled" });
  }

  retry(id: string) {
    this.patchItem(id, { status: "pending", error: undefined });
    this.processQueue();
  }

  triggerProviderAutoTagging(id: string, providerId: string) {
    const item = this.findItem(id);
    if (!item) return;

    const provider = this.autoTagging.getProviders().find(p => p.id === providerId);
    if (!provider) return;

    item.taggingStatus.set("tagging");

    this.autoTagging
      .queueWith(item.file, provider)
      .pipe(
        tap((entry) => {
          if (entry.status === 'completed' && entry.results) {
            // Update with results from the specific provider
            const result = entry.results.find(r => r.providerId === providerId);
            if (result) {
              item.autoTags.update((tags) => {
                const index = tags.findIndex((t) => t.providerId === providerId);
                if (index >= 0) {
                  const newTags = [...tags];
                  newTags[index] = result;
                  return newTags;
                }
                return [...tags, result];
              });
            }
            item.taggingStatus.set("completed");
          } else if (entry.status === 'failed') {
            item.taggingStatus.set("failed");
          }
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  triggerAutoTagging(id: string): Observable<void> {
    const item = this.findItem(id);
    if (!item || item.taggingStatus() === "tagging") {
      return of(undefined);
    }

    item.taggingStatus.set("tagging");
    return this.autoTagging
      .queue(item.file)
      .pipe(
        tap((entry) => {
          if (entry.status === 'completed' && entry.results) {
            item.autoTags.set(entry.results);
            item.taggingStatus.set("completed");
          } else if (entry.status === 'failed') {
            item.taggingStatus.set("failed");
          }
        }),
        filter(entry => entry.status === 'completed' || entry.status === 'failed'),
        map(() => undefined),
      );
  }

  getRegisteredProviders() {
    return this.autoTagging.getEnabledProviders();
  }

  applyAutoTags(id: string, providerId: string) {
    const item = this.findItem(id);
    if (!item) return;

    const result = item.autoTags().find(r => r.providerId === providerId);
    if (!result) return;

    const currentTags = new Set(item.tags);
    for (const ct of result.categorizedTags) {
      currentTags.add(ct.name.toLowerCase());
    }

    this.patchItem(id, { tags: Array.from(currentTags) });
  }

  applyAutoSources(id: string, providerId: string) {
    const item = this.findItem(id);
    if (!item) return;

    const result = item.autoTags().find(r => r.providerId === providerId);
    if (!result?.sources) return;

    const currentSources = new Set(item.sources);
    for (const source of result.sources) {
      currentSources.add(source);
    }

    this.patchItem(id, { sources: Array.from(currentSources) });
  }

  applyAutoSafety(id: string, providerId: string) {
    const item = this.findItem(id);
    if (!item) return;

    const result = item.autoTags().find(r => r.providerId === providerId);
    if (!result?.safety) return;

    this.patchItem(id, { safety: result.safety });
  }

  setSources(id: string, sources: string[]) {
    this.patchItem(id, { sources });
  }
}
