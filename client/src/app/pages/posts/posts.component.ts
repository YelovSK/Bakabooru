import { Component, inject, input, signal, computed, ChangeDetectionStrategy, DestroyRef, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BakabooruService } from '@services/api/bakabooru/bakabooru.service';
import { toSignal, toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, Router } from '@angular/router';
import { Subject, switchMap, of, map, catchError, combineLatest, startWith, scan, fromEvent, debounceTime } from 'rxjs';
import { HotkeysService } from '@services/hotkeys.service';
import { environment } from '@env/environment';
import { BakabooruPostListDto, BakabooruTagDto } from '@models';
import { AutocompleteComponent } from '@shared/components/autocomplete/autocomplete.component';
import { FormSliderInputComponent } from '@shared/components/form-slider-input/form-slider-input.component';
import { PaginatorComponent } from '@shared/components/paginator/paginator.component';
import { escapeTagName } from '@shared/utils/utils';
import { StorageService, STORAGE_KEYS } from '@services/storage.service';
import { AppLinks } from '@app/app.paths';

interface PostsState {
    data: BakabooruPostListDto | null;
    isLoading: boolean;
    error: unknown;
}

// Type for the loading state that retains previous data
interface LoadingState extends PostsState {
    isLoading: true;
    data: BakabooruPostListDto; // Required to retain previous data
}

@Component({
    selector: 'app-posts',
    imports: [CommonModule, RouterLink, AutocompleteComponent, FormSliderInputComponent, PaginatorComponent],
    templateUrl: './posts.component.html',
    styleUrl: './posts.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PostsComponent {
    private static readonly MIN_GRID_COLUMNS = 2;
    private static readonly MAX_GRID_COLUMNS = 12;
    private static readonly LEGACY_GRID_SIZES = [100, 150, 200, 250, 300, 400];
    private static readonly GRID_GAP_PX = 8;
    private static readonly DEFAULT_PAGE_SIZE = 50;
    private static readonly MAX_AUTO_PAGE_SIZE = 500;
    private static readonly BOTTOM_PAGINATOR_RESERVE_PX = 150;
    private static readonly BOTTOM_MIN_RESERVE_PX = 24;
    private static readonly DEFAULT_THUMBNAIL_SIZE = 150;

    @ViewChild('gridViewport') private gridViewportRef?: ElementRef<HTMLElement>;
    private gridViewportResizeObserver?: ResizeObserver;

    private readonly bakabooru = inject(BakabooruService);
    private readonly router = inject(Router);
    private readonly storage = inject(StorageService);
    private readonly hotkeys = inject(HotkeysService);
    private readonly destroyRef = inject(DestroyRef);

    readonly appLinks = AppLinks;

    query = input<string | null>('');
    offset = input<string | null>('0');
    limit = input<string | null>(null);

    environment = environment;

    pageSize = signal(
        this.clamp(
            this.storage.getNumber(STORAGE_KEYS.POSTS_PAGE_SIZE) ?? PostsComponent.DEFAULT_PAGE_SIZE,
            PostsComponent.MIN_GRID_COLUMNS,
            PostsComponent.MAX_AUTO_PAGE_SIZE
        )
    );

    readonly thumbnailSizeMin = 90;
    readonly thumbnailSizeMax = 420;
    readonly thumbnailSizeStep = 5;
    thumbnailSize = signal(this.getInitialThumbnailSize());
    resolvedColumns = signal(1);
    gridTemplateColumns = computed(() =>
        `repeat(${this.resolvedColumns()}, minmax(0, 1fr))`
    );

    currentPage = computed(() => {
        const off = Number(this.offset() ?? '0') || 0;
        return Math.floor(off / this.pageSize()) + 1;
    });

    currentSearchValue = signal('');

    private tagQuery$ = new Subject<string>();
    tagSuggestions = toSignal(
        this.tagQuery$.pipe(
            switchMap(word => {
                if (word.length < 1) return of([]);
                return this.bakabooru.getTags(`*${word}* sort:usages`, 0, 15).pipe(
                    map(res => res.results),
                    catchError(() => of([]))
                );
            })
        ),
        { initialValue: [] as BakabooruTagDto[] }
    );

    private postsState$ = combineLatest([
        toObservable(this.query),
        toObservable(this.offset),
        toObservable(this.pageSize)
    ]).pipe(
        switchMap(([q, off, pageSize]) => {
            const offsetNum = Number(off ?? '0') || 0;
            const limitNum = this.clamp(pageSize, 1, PostsComponent.MAX_AUTO_PAGE_SIZE);
            return this.bakabooru.getPosts(q ?? '', offsetNum, limitNum).pipe(
                map(data => ({ data, isLoading: false, error: null } as PostsState)),
                startWith({ isLoading: true, data: null, error: null } as PostsState),
                catchError(error => of({ data: null, isLoading: false, error } as PostsState))
            );
        }),
        scan((acc: PostsState, curr: PostsState): PostsState => {
            // If loading and previous data exists, retain it
            if (curr.isLoading && acc.data) {
                return { ...curr, data: acc.data };
            }
            // If loading and no previous data, use null
            if (curr.isLoading) {
                return { ...curr, data: null };
            }
            return curr;
        }, { data: null, isLoading: true, error: null } as PostsState)
    );

    postsState = toSignal(this.postsState$, {
        initialValue: { data: null, isLoading: true, error: null } as PostsState
    });

    totalItems = signal(0);
    totalPages = computed(() => Math.ceil(this.totalItems() / this.pageSize()));

    constructor() {
        toObservable(this.query)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(q => this.currentSearchValue.set(q ?? ''));

        // Explicitly update totalItems only when we have real data to avoid jumps
        toObservable(this.postsState)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(state => {
                if (state.data) {
                    this.totalItems.set(state.data.totalCount);
                    this.recalculatePageSize();
                }
            });

        this.destroyRef.onDestroy(() => this.gridViewportResizeObserver?.disconnect());
        this.setupHotkeys();
    }

    ngAfterViewInit(): void {
        if (!this.gridViewportRef?.nativeElement) {
            return;
        }

        const viewport = this.gridViewportRef.nativeElement;
        this.gridViewportResizeObserver = new ResizeObserver(() => this.recalculatePageSize());
        this.gridViewportResizeObserver.observe(viewport);

        fromEvent(window, 'resize')
            .pipe(debounceTime(120), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.recalculatePageSize());

        queueMicrotask(() => this.recalculatePageSize());
    }

    private setupHotkeys() {
        this.hotkeys.on('ArrowLeft')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.onPageChange(this.currentPage() - 1));

        this.hotkeys.on('ArrowRight')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.onPageChange(this.currentPage() + 1));
    }

    onQueryChange(word: string) {
        // Strip the leading dash if it exists before querying tags
        const cleanWord = word.startsWith('-') ? word.substring(1) : word;
        this.tagQuery$.next(escapeTagName(cleanWord));
    }

    onSelection(tag: BakabooruTagDto) {
        const value = this.currentSearchValue();
        const parts = value.split(/\s+/);
        // Detect if the user was typing an exclusion
        const lastPart = parts[parts.length - 1] || '';
        const prefix = lastPart.startsWith('-') ? '-' : '';

        parts[parts.length - 1] = prefix + escapeTagName(tag.name);
        const newValue = parts.join(' ').trim() + ' ';

        this.currentSearchValue.set(newValue);
        this.tagQuery$.next('');
    }

    onSearch(q: string) {
        this.router.navigate([], {
            queryParams: { query: q, offset: 0 },
            queryParamsHandling: 'merge',
            replaceUrl: true
        });
    }

    onPageChange(page: number) {
        if (page < 1 || page > this.totalPages()) return;
        this.updateOffset((page - 1) * this.pageSize());
    }

    onThumbnailSizeChange(newSize: number) {
        const normalized = this.normalizeToStep(newSize, this.thumbnailSizeMin, this.thumbnailSizeMax, this.thumbnailSizeStep);
        this.thumbnailSize.set(normalized);
        this.storage.setNumber(STORAGE_KEYS.POSTS_THUMBNAIL_SIZE, normalized);
        this.recalculatePageSize();
    }

    private updateOffset(off: number) {
        this.router.navigate([], {
            queryParams: { offset: off },
            queryParamsHandling: 'merge',
            replaceUrl: true
        });
    }

    getMediaType(contentType: string): 'image' | 'animation' | 'video' {
        if (contentType.startsWith('video/')) return 'video';
        if (contentType === 'image/gif') return 'animation';
        return 'image';
    }

    private getInitialThumbnailSize(): number {
        const storedThumbnailSize = this.storage.getNumber(STORAGE_KEYS.POSTS_THUMBNAIL_SIZE);
        if (storedThumbnailSize !== null && Number.isFinite(storedThumbnailSize)) {
            return this.normalizeToStep(storedThumbnailSize, this.thumbnailSizeMin, this.thumbnailSizeMax, this.thumbnailSizeStep);
        }

        const storedColumns = this.storage.getNumber(STORAGE_KEYS.POSTS_GRID_COLUMNS);
        if (storedColumns !== null && Number.isFinite(storedColumns)) {
            return this.columnsToThumbnailSize(storedColumns);
        }

        const legacyStored = this.storage.getNumber(STORAGE_KEYS.POSTS_GRID_SIZE_INDEX);
        if (legacyStored === null || !Number.isFinite(legacyStored)) {
            return PostsComponent.DEFAULT_THUMBNAIL_SIZE;
        }

        if (Number.isInteger(legacyStored) && legacyStored >= 0 && legacyStored < PostsComponent.LEGACY_GRID_SIZES.length) {
            const legacyPx = PostsComponent.LEGACY_GRID_SIZES[legacyStored];
            return this.legacyGridPixelsToThumbnailSize(legacyPx);
        }

        return this.legacyGridPixelsToThumbnailSize(legacyStored);
    }

    private legacyGridPixelsToThumbnailSize(pixels: number): number {
        if (!Number.isFinite(pixels) || pixels <= 0) {
            return PostsComponent.DEFAULT_THUMBNAIL_SIZE;
        }

        return this.normalizeToStep(pixels, this.thumbnailSizeMin, this.thumbnailSizeMax, this.thumbnailSizeStep);
    }

    private columnsToThumbnailSize(columns: number): number {
        if (!Number.isFinite(columns) || columns <= 0) {
            return PostsComponent.DEFAULT_THUMBNAIL_SIZE;
        }

        const normalizedColumns = this.normalizeToStep(
            columns,
            PostsComponent.MIN_GRID_COLUMNS,
            PostsComponent.MAX_GRID_COLUMNS,
            1
        );
        const estimatedThumbnailSize = Math.round(1200 / normalizedColumns);
        return this.normalizeToStep(estimatedThumbnailSize, this.thumbnailSizeMin, this.thumbnailSizeMax, this.thumbnailSizeStep);
    }

    private normalizeToStep(value: number, min: number, max: number, step: number): number {
        if (!Number.isFinite(value)) {
            return min;
        }

        const clamped = Math.min(max, Math.max(min, value));
        const normalized = Math.round((clamped - min) / step) * step + min;
        return Math.min(max, Math.max(min, normalized));
    }

    private recalculatePageSize(): void {
        const viewport = this.gridViewportRef?.nativeElement;
        if (!viewport) return;

        const width = viewport.clientWidth;
        if (width <= 0) return;

        const requestedThumbnailSize = this.thumbnailSize();
        const effectiveThumbnailSize = Math.min(requestedThumbnailSize, width);
        const columns = Math.max(1, Math.floor((width + PostsComponent.GRID_GAP_PX) / (effectiveThumbnailSize + PostsComponent.GRID_GAP_PX)));
        const tileWidth = (width - PostsComponent.GRID_GAP_PX * (columns - 1)) / columns;
        if (tileWidth <= 0) return;

        this.resolvedColumns.set(columns);

        const viewportTop = viewport.getBoundingClientRect().top;
        const bottomReserve = this.totalItems() > this.pageSize()
            ? PostsComponent.BOTTOM_PAGINATOR_RESERVE_PX
            : PostsComponent.BOTTOM_MIN_RESERVE_PX;
        const availableHeight = Math.max(0, window.innerHeight - viewportTop - bottomReserve);

        const rows = Math.max(1, Math.floor((availableHeight + PostsComponent.GRID_GAP_PX) / (tileWidth + PostsComponent.GRID_GAP_PX)));
        const nextPageSize = this.clamp(rows * columns, columns, PostsComponent.MAX_AUTO_PAGE_SIZE);
        const currentPageSize = this.pageSize();
        if (nextPageSize === currentPageSize) return;

        const currentOffset = Number(this.offset() ?? '0') || 0;
        const currentPage = Math.floor(currentOffset / currentPageSize) + 1;
        const newOffset = (currentPage - 1) * nextPageSize;

        this.pageSize.set(nextPageSize);
        this.storage.setNumber(STORAGE_KEYS.POSTS_PAGE_SIZE, nextPageSize);

        if (newOffset !== currentOffset) {
            this.updateOffset(newOffset);
        }
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }
}
