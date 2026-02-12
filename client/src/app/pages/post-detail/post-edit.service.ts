import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, of, forkJoin, catchError, tap, switchMap, map } from 'rxjs';
import { BakabooruService } from '@services/api/bakabooru/bakabooru.service';
import { AutoTaggingService } from '@services/auto-tagging/auto-tagging.service';
import { ToastService } from '@services/toast.service';
import { Post, Safety } from '@models';
import { AutoTaggingResult, TaggingStatus } from '@services/auto-tagging/models';

export interface PostEditState {
  safety: Safety;
  sources: string[];
  tags: string[];
}

@Injectable()
export class PostEditService {
  private readonly bakabooru = inject(BakabooruService);
  private readonly autoTagging = inject(AutoTaggingService);
  private readonly toast = inject(ToastService);

  private originalPost = signal<Post | null>(null);
  private editState = signal<PostEditState | null>(null);

  isEditing = signal(false);
  isSaving = signal(false);
  taggingStatus = signal<TaggingStatus>('idle');
  autoTags = signal<AutoTaggingResult[]>([]);

  currentState = computed(() => this.editState());

  isDirty = computed(() => {
    const original = this.originalPost();
    const current = this.editState();
    if (!original || !current) return false;

    const originalTags = original.tags.map(t => t.names[0]).sort();
    const currentTags = [...current.tags].sort();
    const originalSources = original.source?.split('\n').filter(s => s.trim()) || [];

    return (
      original.safety !== current.safety ||
      JSON.stringify(originalSources) !== JSON.stringify(current.sources) ||
      JSON.stringify(originalTags) !== JSON.stringify(currentTags)
    );
  });

  startEditing(post: Post) {
    this.originalPost.set(post);
    this.editState.set({
      safety: post.safety,
      sources: post.source?.split('\n').filter(s => s.trim()) || [],
      tags: post.tags.map(t => t.names[0]),
    });
    this.isEditing.set(true);
    this.autoTags.set([]);
    this.taggingStatus.set('idle');
  }

  cancelEditing() {
    this.isEditing.set(false);
    this.editState.set(null);
    this.autoTags.set([]);
    this.taggingStatus.set('idle');
  }

  setSafety(safety: Safety) {
    this.editState.update(state => state ? { ...state, safety } : null);
  }

  setSources(sources: string[]) {
    this.editState.update(state => state ? { ...state, sources } : null);
  }

  setTags(tags: string[]) {
    this.editState.update(state => state ? { ...state, tags } : null);
  }

  addTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return;

    this.editState.update(state => {
      if (!state || state.tags.includes(normalized)) return state;
      return { ...state, tags: [...state.tags, normalized] };
    });
  }

  removeTag(tag: string) {
    this.editState.update(state => {
      if (!state) return state;
      return { ...state, tags: state.tags.filter(t => t !== tag) };
    });
  }

  applyAutoTags(providerId: string) {
    const result = this.autoTags().find(r => r.providerId === providerId);
    if (!result) return;

    this.editState.update(state => {
      if (!state) return state;
      const newTags = new Set(state.tags);
      for (const ct of result.categorizedTags) {
        newTags.add(ct.name.toLowerCase());
      }
      return { ...state, tags: Array.from(newTags) };
    });
  }

  applyAutoSources(providerId: string) {
    const result = this.autoTags().find(r => r.providerId === providerId);
    if (!result?.sources || result.sources.length === 0) return;

    this.editState.update(state => {
      if (!state) return state;
      const newSources = new Set(state.sources);
      for (const source of result.sources!) {
        newSources.add(source);
      }
      return { ...state, sources: Array.from(newSources) };
    });
  }

  applyAutoSafety(providerId: string) {
    const result = this.autoTags().find(r => r.providerId === providerId);
    if (!result?.safety) return;

    this.editState.update(state => {
      if (!state) return state;
      return { ...state, safety: result.safety! };
    });
  }

  triggerAutoTagging(file: File, destroyRef: DestroyRef) {
    if (this.taggingStatus() === 'tagging') return;

    this.taggingStatus.set('tagging');
    this.autoTagging.queue(file)
      .pipe(
        tap(entry => {
          if (entry.status === 'completed' && entry.results) {
            this.autoTags.set(entry.results);
            this.taggingStatus.set('completed');
          } else if (entry.status === 'failed') {
            this.taggingStatus.set('failed');
          }
        }),
        catchError(() => {
          this.taggingStatus.set('failed');
          return of(null);
        }),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe();
  }

  triggerProviderAutoTagging(file: File, providerId: string, destroyRef: DestroyRef) {
    if (this.taggingStatus() === 'tagging') return;

    const provider = this.autoTagging.getProviders().find(p => p.id === providerId);
    if (!provider) return;

    this.taggingStatus.set('tagging');
    this.autoTagging.queueWith(file, provider)
      .pipe(
        tap(entry => {
          if (entry.status === 'completed' && entry.results) {
            const result = entry.results.find(r => r.providerId === providerId);
            if (result) {
              this.autoTags.update(tags => {
                const index = tags.findIndex(t => t.providerId === providerId);
                if (index >= 0) {
                  const newTags = [...tags];
                  newTags[index] = result;
                  return newTags;
                }
                return [...tags, result];
              });
            }
            this.taggingStatus.set('completed');
          } else if (entry.status === 'failed') {
            this.taggingStatus.set('failed');
          }
        }),
        catchError(() => {
          this.taggingStatus.set('failed');
          return of(null);
        }),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe();
  }

  getRegisteredProviders() {
    return this.autoTagging.getEnabledProviders();
  }

  save(destroyRef: DestroyRef): Observable<Post | null> {
    const post = this.originalPost();
    const state = this.editState();
    if (!post || !state) return of(null);

    this.isSaving.set(true);

    const payload: Record<string, unknown> = {
      version: post.version,
    };

    if (post.safety !== state.safety) {
      payload['safety'] = state.safety;
    }

    const originalSources = post.source?.split('\n').filter(s => s.trim()) || [];
    if (JSON.stringify(originalSources) !== JSON.stringify(state.sources)) {
      payload['source'] = state.sources.join('\n');
    }

    const originalTags = post.tags.map(t => t.names[0]).sort();
    const currentTags = [...state.tags].sort();
    if (JSON.stringify(originalTags) !== JSON.stringify(currentTags)) {
      payload['tags'] = state.tags;
    }

    return this.bakabooru.updatePost(post.id, payload as Partial<Post>).pipe(
      switchMap(updatedPost => {
        // Update tag categories from auto-tagging results
        const categorizedTags = this.collectCategorizedTags();
        if (categorizedTags.length === 0) return of(updatedPost);
        return this.updateTagCategories(categorizedTags, destroyRef).pipe(map(() => updatedPost));
      }),
      tap(updatedPost => {
        this.isSaving.set(false);
        this.isEditing.set(false);
        this.originalPost.set(updatedPost);
        this.editState.set(null);
        this.autoTags.set([]);
        this.toast.success('Post updated successfully');
      }),
      catchError(err => {
        this.isSaving.set(false);
        this.toast.error(err.error?.description || 'Failed to update post');
        return of(null);
      }),
      takeUntilDestroyed(destroyRef),
    );
  }

  delete(post: Post): Observable<boolean> {
    if (!post) return of(false);

    return this.bakabooru.deletePost(post.id, post.version).pipe(
      tap(() => {
        this.toast.success('Post deleted');
      }),
      map(() => true),
      catchError(err => {
        this.toast.error(err.error?.description || 'Failed to delete post');
        return of(false);
      }),
    );
  }

  private collectCategorizedTags(): { name: string; category: string }[] {
    const categorizedTags: { name: string; category: string }[] = [];
    for (const result of this.autoTags()) {
      for (const ct of result.categorizedTags) {
        if (ct.category && ct.category !== 'general') {
          categorizedTags.push({ name: ct.name, category: ct.category });
        }
      }
    }
    return categorizedTags;
  }

  private updateTagCategories(
    categorizedTags: { name: string; category: string }[],
    destroyRef: DestroyRef,
  ) {
    const updateTasks = categorizedTags.map(ct =>
      this.bakabooru.getTag(ct.name).pipe(
        switchMap(tag =>
          this.bakabooru.updateTag(ct.name, {
            category: ct.category,
            version: tag.version,
          }),
        ),
        catchError(() => of(null)),
      ),
    );
    return forkJoin(updateTasks).pipe(takeUntilDestroyed(destroyRef));
  }
}
