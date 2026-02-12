import { Injectable, signal, computed, inject } from "@angular/core";
import {
    HttpClient,
    HttpHeaders,
    HttpParams,
} from "@angular/common/http";
import { Observable, of, forkJoin, switchMap, throwError } from "rxjs";
import { catchError, finalize, map, shareReplay } from "rxjs/operators";
import {
    Post,
    Tag,
    TagCategory,
    User,
    PagedSearchResult,
    UnpagedSearchResult,
    GlobalInfo,
    Comment,
    Pool,
    PostsAround,
    PostField,
    UserRank,
    ImageSearchResult,
} from "../oxibooru/models";
import { environment } from "@env/environment";
import { StrictEncoder } from "../oxibooru/strict-encoder";

export interface Library {
    id: number;
    name: string;
    path: string;
    scanIntervalHours: number;
    postCount: number;
    totalSizeBytes: number;
    lastImportDate: string | null;
}

export interface ManagedTagCategory {
    id: number;
    name: string;
    color: string;
    order: number;
    tagCount: number;
}

export interface ManagedTag {
    id: number;
    name: string;
    categoryId: number | null;
    categoryName: string | null;
    categoryColor: string | null;
    usages: number;
}

interface AuthSessionResponse {
    username: string;
    isAuthenticated: boolean;
}

@Injectable({
    providedIn: "root",
})
export class BakabooruService {
    private baseUrl = environment.apiBaseUrl;
    private authCheckInFlight$: Observable<boolean> | null = null;

    // Kept for compatibility with legacy Oxibooru-based code paths.
    authHeader = signal<string | null>(null);
    currentUser = signal<string | null>(null);
    isLoggedIn = computed(() => !!this.currentUser());
    private authChecked = signal(false);

    private http = inject(HttpClient);

    constructor() { }

    // --- Auth ---
    login(username: string, password: string): Observable<void> {
        return this.http.post<AuthSessionResponse>(`${this.baseUrl}/auth/login`, { username, password }).pipe(
            map(response => {
                this.currentUser.set(response.username);
                this.authChecked.set(true);
                return;
            })
        );
    }

    register(username: string, password: string): Observable<void> {
        return of(void 0);
    }

    logout(): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/auth/logout`, {}).pipe(
            map(() => {
                this.currentUser.set(null);
                this.authChecked.set(true);
            })
        );
    }

    ensureAuthState(): Observable<boolean> {
        if (this.authChecked()) {
            return of(this.isLoggedIn());
        }

        if (this.authCheckInFlight$) {
            return this.authCheckInFlight$;
        }

        this.authCheckInFlight$ = this.http.get<AuthSessionResponse>(`${this.baseUrl}/auth/me`).pipe(
            map(response => {
                this.currentUser.set(response.username);
                this.authChecked.set(true);
                return true;
            }),
            catchError(() => {
                this.currentUser.set(null);
                this.authChecked.set(true);
                return of(false);
            }),
            finalize(() => {
                this.authCheckInFlight$ = null;
            }),
            shareReplay(1)
        );

        return this.authCheckInFlight$;
    }

    // --- Libraries (New) ---
    getLibraries(): Observable<Library[]> {
        return this.http.get<Library[]>(`${this.baseUrl}/libraries`);
    }

    createLibrary(name: string, path: string): Observable<Library> {
        return this.http.post<Library>(`${this.baseUrl}/libraries`, { name, path });
    }

    deleteLibrary(id: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/libraries/${id}`);
    }

    renameLibrary(id: number, name: string): Observable<Library> {
        return this.http.patch<Library>(`${this.baseUrl}/libraries/${id}/name`, { name });
    }

    // --- Posts ---
    getPosts(
        query = "",
        offset = 0,
        limit = 100,
        fields: PostField[] = ["id", "thumbnailUrl", "type", "score"],
    ): Observable<PagedSearchResult<Post>> {
        const page = Math.floor(offset / limit) + 1;

        let params = new HttpParams()
            .set("page", page.toString())
            .set("pageSize", limit.toString());

        if (query) {
            params = params.set("tags", query);
        }

        return this.http.get<any>(`${this.baseUrl}/posts`, { params }).pipe(
            map(response => {
                const items = response.items || response.Items || [];
                const results = items.map((dto: any) => this.mapPost(dto));
                return {
                    query,
                    offset,
                    limit,
                    total: response.totalCount || response.TotalCount || 0,
                    results
                };
            })
        );
    }

    // --- Admin & Jobs (New) ---
    getJobs(): Observable<any[]> {
        return this.http.get<any[]>(`${this.baseUrl}/admin/jobs`);
    }

    cancelJob(jobId: string): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/admin/jobs/${jobId}`);
    }

    scanAllLibraries(): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/admin/jobs/scan-all`, {});
    }

    scanLibrary(libraryId: number): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/libraries/${libraryId}/scan`, {});
    }

    private mapPost(dto: any): Post {
        return {
            id: dto.id,
            version: '1',
            creationTime: dto.importDate,
            lastEditTime: dto.importDate,
            safety: 'safe',
            source: '',
            type: this.getTypeFromContentType(dto.contentType),
            checksum: dto.contentHash,
            contentHash: dto.contentHash,
            fileSize: 0, // Not provided by DTO yet
            canvasWidth: dto.width,
            canvasHeight: dto.height,
            contentUrl: dto.contentUrl || `${this.baseUrl}/posts/${dto.id}/content`,
            thumbnailUrl: dto.thumbnailUrl || dto.contentUrl || `${this.baseUrl}/posts/${dto.id}/content`,
            flags: [],
            tags: (dto.tags || []).map((t: any) => ({
                names: [t.name],
                category: t.categoryName || 'general',
                usages: 0
            })),
            relations: [],
            notes: [],
            user: { name: 'System', avatarUrl: '' },
            score: 0,
            ownScore: 0,
            ownFavorite: false,
            tagCount: (dto.tags || []).length,
            favoriteCount: 0,
            commentCount: 0,
            noteCount: 0,
            featureCount: 0,
            relationCount: 0,
            lastFeatureTime: null,
            favoritedBy: [],
            hasCustomThumbnail: false,
            mimeType: dto.contentType,
            comments: [],
            pools: []
        };
    }

    private getTypeFromContentType(contentType: string): any {
        if (contentType.startsWith('video/')) return 'video';
        if (contentType === 'image/gif') return 'animation';
        return 'image';
    }

    getPost(id: number): Observable<Post> {
        return this.http.get<any>(`${this.baseUrl}/posts/${id}`).pipe(
            map(dto => this.mapPost(dto))
        );
    }

    getPostContentUrl(id: number): string {
        return `${this.baseUrl}/posts/${id}/content`;
    }

    // --- Stubs for Compatibility ---
    getGlobalInfo(): Observable<GlobalInfo> {
        return this.http.get<any>(`${this.baseUrl}/system/info`).pipe(
            map(res => ({
                postCount: res.postCount,
                diskUsage: res.totalSizeBytes,
                featuredPost: null,
                featuringTime: null,
                featuringUser: null,
                serverTime: res.serverTime,
                config: {
                    name: "Bakabooru",
                    userNameRegex: ".*",
                    passwordRegex: ".*",
                    tagNameRegex: ".*",
                    tagCategoryNameRegex: ".*",
                    defaultUserRank: "regular",
                    enableSafety: false,
                    contact_email: "",
                    canSendMails: false,
                    privileges: {}
                }
            }))
        );
    }

    getTags(query = "", offset = 0, limit = 100): Observable<PagedSearchResult<Tag>> {
        const page = Math.floor(offset / limit) + 1;
        const params = new HttpParams()
            .set("query", query)
            .set("page", page.toString())
            .set("pageSize", limit.toString());

        return this.http.get<any>(`${this.baseUrl}/tags`, { params }).pipe(
            map(response => {
                const items = response.items || response.Items || [];
                const results = items.map((t: any) => ({
                    names: [t.name],
                    category: t.categoryName || 'general',
                    usages: t.usages || 0,
                    version: '1',
                    implications: [],
                    suggestions: [],
                    creationTime: '',
                    lastEditTime: '',
                    description: ''
                } as Tag));

                return {
                    query,
                    offset,
                    limit,
                    total: response.totalCount || response.TotalCount || 0,
                    results
                };
            })
        );
    }

    getTagCategories(): Observable<UnpagedSearchResult<TagCategory>> {
        return this.http.get<any[]>(`${this.baseUrl}/tagcategories`).pipe(
            map(items => ({
                results: (items || []).map(c => ({
                    version: '1',
                    name: c.name,
                    color: c.color,
                    usages: c.tagCount || 0,
                    order: c.order,
                    default: false
                } as TagCategory))
            }))
        );
    }

    getTag(name: string): Observable<Tag> {
        const normalizedName = name.trim().toLowerCase();
        if (!normalizedName) {
            return throwError(() => new Error("Tag name cannot be empty."));
        }

        return this.getManagedTags(normalizedName, 0, 100).pipe(
            map(result => {
                const existing = result.results.find(t => t.name.toLowerCase() === normalizedName);
                if (!existing) {
                    throw new Error(`Tag "${name}" not found.`);
                }
                return this.mapManagedTagToTag(existing);
            }),
        );
    }

    getPools(): Observable<PagedSearchResult<Pool>> {
        return of({ query: "", offset: 0, limit: 100, total: 0, results: [] });
    }

    getComments(): Observable<PagedSearchResult<Comment>> {
        return of({ query: "", offset: 0, limit: 100, total: 0, results: [] });
    }

    // Add other necessary stubs as empty observables or specific "not implemented" errors if critical

    getPostsAround(id: number, query = ""): Observable<PostsAround> {
        let params = new HttpParams();
        if (query) {
            params = params.set("tags", query);
        }

        return this.http.get<PostsAround>(`${this.baseUrl}/posts/${id}/around`, { params });
    }

    updatePost(id: number, metadata: any): Observable<Post> {
        const desiredTagsRaw = Array.isArray(metadata?.tags) ? metadata.tags as string[] : null;

        // Current backend only supports incremental tag add/remove endpoints.
        if (desiredTagsRaw === null) {
            return this.getPost(id);
        }

        const normalizeTag = (tagName: string) => tagName.trim().toLowerCase();
        const desiredTags = Array.from(
            new Set(
                desiredTagsRaw
                    .map(t => t?.trim())
                    .filter((t): t is string => !!t),
            ),
        );
        const desiredTagLookup = new Set(desiredTags.map(normalizeTag));

        return this.getPost(id).pipe(
            switchMap(post => {
                const currentTags = Array.from(new Set(post.tags.map(t => t.names[0].trim())));
                const currentTagLookup = new Set(currentTags.map(normalizeTag));
                const toAdd = desiredTags.filter(t => !currentTagLookup.has(normalizeTag(t)));
                const toRemove = currentTags.filter(t => !desiredTagLookup.has(normalizeTag(t)));

                const operations: Observable<unknown>[] = [
                    ...toAdd.map(tag => this.addTagToPost(id, tag)),
                    ...toRemove.map(tag => this.removeTagFromPost(id, tag)),
                ];

                if (operations.length === 0) {
                    return this.getPost(id);
                }

                return forkJoin(operations).pipe(switchMap(() => this.getPost(id)));
            }),
        );
    }

    deletePost(id: number, version: string): Observable<void> {
        return of(void 0);
    }

    updateTag(name: string, tag: Partial<Tag>): Observable<Tag> {
        const normalizedName = name.trim().toLowerCase();
        if (!normalizedName) {
            return throwError(() => new Error("Tag name cannot be empty."));
        }

        return this.getManagedTags(normalizedName, 0, 100).pipe(
            switchMap(result => {
                const existing = result.results.find(t => t.name.toLowerCase() === normalizedName);
                if (!existing) {
                    return throwError(() => new Error(`Tag "${name}" not found.`));
                }

                const nextName = tag.names?.[0]?.trim().toLowerCase() || existing.name;
                const categoryName = tag.category?.trim() || null;

                if (categoryName === null || categoryName.toLowerCase() === "general") {
                    return this.updateManagedTag(existing.id, nextName, null).pipe(map(updated => this.mapManagedTagToTag(updated)));
                }

                return this.getManagedTagCategories().pipe(
                    switchMap(categories => {
                        const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
                        if (!category) {
                            return throwError(() => new Error(`Category "${categoryName}" not found.`));
                        }

                        return this.updateManagedTag(existing.id, nextName, category.id).pipe(
                            map(updated => this.mapManagedTagToTag(updated)),
                        );
                    }),
                );
            }),
        );
    }

    ratePost(id: number, score: number): Observable<Post> {
        return of({} as Post);
    }

    favoritePost(id: number): Observable<Post> {
        return of({} as Post);
    }

    unfavoritePost(id: number): Observable<Post> {
        return of({} as Post);
    }

    uploadFile(file: File): Observable<any> {
        // Mock upload progress
        return of({ token: "mock-token", progress: 100 });
    }

    createPost(token: string, safety: string, tags: string[], source: string): Observable<Post> {
        return of({} as Post);
    }

    reverseSearch(file: File): Observable<ImageSearchResult> {
        return of({ exactPost: null, similarPosts: [] });
    }

    // --- Tag Management ---
    getManagedTagCategories(): Observable<ManagedTagCategory[]> {
        return this.http.get<ManagedTagCategory[]>(`${this.baseUrl}/tagcategories`);
    }

    createTagCategory(name: string, color: string, order: number): Observable<ManagedTagCategory> {
        return this.http.post<ManagedTagCategory>(`${this.baseUrl}/tagcategories`, { name, color, order });
    }

    updateTagCategory(id: number, name: string, color: string, order: number): Observable<ManagedTagCategory> {
        return this.http.put<ManagedTagCategory>(`${this.baseUrl}/tagcategories/${id}`, { name, color, order });
    }

    deleteTagCategory(id: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/tagcategories/${id}`);
    }

    getManagedTags(query = "", offset = 0, limit = 200): Observable<PagedSearchResult<ManagedTag>> {
        const page = Math.floor(offset / limit) + 1;
        const params = new HttpParams()
            .set("query", query)
            .set("page", page.toString())
            .set("pageSize", limit.toString());

        return this.http.get<any>(`${this.baseUrl}/tags`, { params }).pipe(
            map(response => ({
                query,
                offset,
                limit,
                total: response.totalCount || response.TotalCount || 0,
                results: (response.items || response.Items || []) as ManagedTag[]
            }))
        );
    }

    createManagedTag(name: string, categoryId: number | null): Observable<ManagedTag> {
        return this.http.post<ManagedTag>(`${this.baseUrl}/tags`, { name, categoryId });
    }

    updateManagedTag(id: number, name: string, categoryId: number | null): Observable<ManagedTag> {
        return this.http.put<ManagedTag>(`${this.baseUrl}/tags/${id}`, { name, categoryId });
    }

    mergeTag(sourceTagId: number, targetTagId: number): Observable<void> {
        return this.http.post<void>(`${this.baseUrl}/tags/${sourceTagId}/merge`, { targetTagId });
    }

    deleteManagedTag(id: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/tags/${id}`);
    }

    private addTagToPost(id: number, tagName: string): Observable<void> {
        const headers = new HttpHeaders({
            "Content-Type": "application/json",
        });
        return this.http.post<void>(`${this.baseUrl}/posts/${id}/tags`, JSON.stringify(tagName), { headers });
    }

    private removeTagFromPost(id: number, tagName: string): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/posts/${id}/tags/${encodeURIComponent(tagName)}`);
    }

    private mapManagedTagToTag(tag: ManagedTag): Tag {
        return {
            names: [tag.name],
            category: tag.categoryName || "general",
            usages: tag.usages || 0,
            version: "1",
            implications: [],
            suggestions: [],
            creationTime: "",
            lastEditTime: "",
            description: "",
        };
    }
}
