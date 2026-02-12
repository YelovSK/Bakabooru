import { Injectable, signal, computed, inject } from "@angular/core";
import {
  HttpClient,
  HttpHeaders,
  HttpParams,
  HttpRequest,
  HttpEventType,
} from "@angular/common/http";
import { Observable, tap, of, map, filter } from "rxjs";
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
  UserToken,
  PostsAround,
  PostField,
  UserRank,
  ImageSearchResult,
} from "./models";
import { environment } from "@env/environment";
import { StrictEncoder } from "./strict-encoder";
import { StorageService, STORAGE_KEYS } from "../../storage.service";

@Injectable({
  providedIn: "root",
})
export class OxibooruService {
  private baseUrl = environment.apiBaseUrl;
  authHeader = signal<string | null>(null);
  currentUser = signal<string | null>(null);
  isLoggedIn = computed(() => !!this.authHeader());

  // Post metadata cache with a size limit to prevent memory leaks
  private postCache = new Map<number, Post>();
  private readonly MAX_CACHE_SIZE = 200;

  private http = inject(HttpClient);

  private storage = inject(StorageService);

  constructor() {
    this.loadAuth();
  }

  private loadAuth() {
    const username = this.storage.getItem(STORAGE_KEYS.USERNAME);
    const token = this.storage.getItem(STORAGE_KEYS.TOKEN);
    if (username && token) {
      this.setTokenAuth(username, token);
    }
  }

  setBasicAuth(username: string, password: string) {
    const credentials = btoa(`${username}:${password}`);
    this.authHeader.set(`Basic ${credentials}`);
  }

  setTokenAuth(username: string, token: string) {
    const credentials = btoa(`${username}:${token}`);
    this.authHeader.set(`Token ${credentials}`);
    this.currentUser.set(username);
  }

  login(username: string, password: string): Observable<UserToken> {
    this.setBasicAuth(username, password);
    const body = {
      note: "WebUI Login " + new Date().toISOString(),
      enabled: true,
    };
    return this.http
      .post<UserToken>(`${this.baseUrl}/user-token/${username}`, body, {
        headers: this.getHeaders(),
      })
      .pipe(
        tap((tokenResource) => {
          this.storage.setItem(STORAGE_KEYS.USERNAME, username);
          this.storage.setItem(STORAGE_KEYS.TOKEN, tokenResource.token);
          this.setTokenAuth(username, tokenResource.token);
        }),
      );
  }

  register(
    username: string,
    password: string,
    rank?: UserRank,
  ): Observable<User> {
    const body = {
      name: username,
      password: password,
      rank: rank ?? "regular",
    };

    return this.http.post<User>(`${this.baseUrl}/users`, body, {
      headers: this.getHeaders(),
    });
  }

  logout() {
    this.authHeader.set(null);
    this.currentUser.set(null);
    this.storage.removeItem(STORAGE_KEYS.USERNAME);
    this.storage.removeItem(STORAGE_KEYS.TOKEN);
    this.postCache.clear();
  }

  // Reusable headers - HttpHeaders is immutable so this is safe to cache
  private readonly defaultHeaders = new HttpHeaders({
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  private getHeaders(): HttpHeaders {
    return this.defaultHeaders;
  }

  private addToCache(post: Post) {
    if (this.postCache.size >= this.MAX_CACHE_SIZE) {
      // Remove the oldest key (first item in the Map)
      const firstKey = this.postCache.keys().next().value;
      if (firstKey !== undefined) {
        this.postCache.delete(firstKey);
      }
    }
    this.postCache.set(post.id, post);
  }

  // Global Info
  getGlobalInfo(): Observable<GlobalInfo> {
    return this.http.get<GlobalInfo>(`${this.baseUrl}/info`, {
      headers: this.getHeaders(),
    });
  }

  // Posts
  getPosts(
    query = "",
    offset = 0,
    limit = 100,
    fields: PostField[] = ["id", "thumbnailUrl", "type", "score"],
  ): Observable<PagedSearchResult<Post>> {
    const params = new HttpParams({ encoder: new StrictEncoder() })
      .set("query", query)
      .set("offset", offset.toString())
      .set("fields", fields.join(","))
      .set("limit", limit.toString());

    return this.http.get<PagedSearchResult<Post>>(`${this.baseUrl}/posts`, {
      headers: this.getHeaders(),
      params,
    });
  }

  getPost(id: number): Observable<Post> {
    if (this.postCache.has(id)) {
      return of(this.postCache.get(id)!);
    }
    // tap only runs on success, so 500/404 errors will NOT be cached
    return this.http
      .get<Post>(`${this.baseUrl}/post/${id}`, { headers: this.getHeaders() })
      .pipe(tap((post) => this.addToCache(post)));
  }

  getPostsAround(
    id: number,
    query = "",
    fields: PostField[] = ["id"],
  ): Observable<PostsAround> {
    const params = new HttpParams({ encoder: new StrictEncoder() })
      .set("query", query)
      .set("fields", fields.join(","));

    return this.http.get<PostsAround>(`${this.baseUrl}/post/${id}/around/`, {
      headers: this.getHeaders(),
      params,
    });
  }

  uploadFile(file: File): Observable<{ progress: number; token?: string }> {
    const formData = new FormData();
    formData.append("content", file);

    const headers = new HttpHeaders({ Accept: "application/json" });

    const req = new HttpRequest("POST", `${this.baseUrl}/uploads/`, formData, {
      headers,
      reportProgress: true,
    });

    return this.http.request<{ token: string }>(req).pipe(
      map((event) => {
        switch (event.type) {
          case HttpEventType.UploadProgress: {
            const progress = Math.round(
              (100 * event.loaded) / (event.total ?? 1),
            );
            return { progress };
          }
          case HttpEventType.Response:
            return { progress: 100, token: event.body?.token };
          default:
            return { progress: 0 };
        }
      }),
      filter((res) => res.progress > 0 || !!res.token),
    );
  }

  reverseSearch(file: File): Observable<ImageSearchResult> {
    const formData = new FormData();
    formData.append("content", file);

    const headers = new HttpHeaders({ Accept: "application/json" });

    return this.http.post<ImageSearchResult>(
      `${this.baseUrl}/posts/reverse-search`,
      formData,
      { headers },
    );
  }

  createPost(
    contentToken: string,
    safety: "safe" | "sketchy" | "unsafe",
    tags: string[] = [],
    source?: string,
  ): Observable<Post> {
    const payload: Record<string, unknown> = { contentToken, safety, tags };
    if (source) {
      payload['source'] = source;
    }

    const headers = new HttpHeaders({ Accept: "application/json" });

    return this.http.post<Post>(`${this.baseUrl}/posts/`, payload, { headers });
  }

  updatePost(
    id: number,
    metadata: Partial<Post>,
    content?: File,
    thumbnail?: File,
  ): Observable<Post> {
    if (!content && !thumbnail) {
      return this.http
        .put<Post>(`${this.baseUrl}/post/${id}`, metadata, {
          headers: this.getHeaders(),
        })
        .pipe(tap((post) => this.addToCache(post)));
    }

    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    if (content) formData.append("content", content);
    if (thumbnail) formData.append("thumbnail", thumbnail);

    const headers = new HttpHeaders({ Accept: "application/json" });

    return this.http
      .put<Post>(`${this.baseUrl}/post/${id}`, formData, { headers })
      .pipe(tap((post) => this.addToCache(post)));
  }

  deletePost(id: number, version: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/post/${id}`, {
        headers: this.getHeaders(),
        body: { version },
      })
      .pipe(tap(() => this.postCache.delete(id)));
  }

  ratePost(id: number, score: number): Observable<Post> {
    return this.http
      .put<Post>(
        `${this.baseUrl}/post/${id}/score`,
        { score },
        { headers: this.getHeaders() },
      )
      .pipe(tap((post) => this.addToCache(post)));
  }

  favoritePost(id: number): Observable<Post> {
    return this.http
      .post<Post>(
        `${this.baseUrl}/post/${id}/favorite`,
        {},
        { headers: this.getHeaders() },
      )
      .pipe(tap((post) => this.addToCache(post)));
  }

  unfavoritePost(id: number): Observable<Post> {
    return this.http
      .delete<Post>(`${this.baseUrl}/post/${id}/favorite`, {
        headers: this.getHeaders(),
      })
      .pipe(tap((post) => this.addToCache(post)));
  }

  // Tags
  getTags(
    query = "",
    offset = 0,
    limit = 100,
  ): Observable<PagedSearchResult<Tag>> {
    const params = new HttpParams({ encoder: new StrictEncoder() })
      .set("query", query)
      .set("offset", offset.toString())
      .set("limit", limit.toString());
    return this.http.get<PagedSearchResult<Tag>>(`${this.baseUrl}/tags`, {
      headers: this.getHeaders(),
      params,
    });
  }

  getTag(name: string): Observable<Tag> {
    return this.http.get<Tag>(`${this.baseUrl}/tag/${name}`, {
      headers: this.getHeaders(),
    });
  }

  createTag(tag: Partial<Tag>): Observable<Tag> {
    return this.http.post<Tag>(`${this.baseUrl}/tags`, tag, {
      headers: this.getHeaders(),
    });
  }

  updateTag(name: string, tag: Partial<Tag>): Observable<Tag> {
    return this.http.put<Tag>(`${this.baseUrl}/tag/${name}`, tag, {
      headers: this.getHeaders(),
    });
  }

  deleteTag(name: string, version: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/tag/${name}`, {
      headers: this.getHeaders(),
      body: { version },
    });
  }

  mergeTags(
    source: string,
    sourceVersion: string,
    target: string,
    targetVersion: string,
  ): Observable<Tag> {
    const body = {
      remove: source,
      removeVersion: sourceVersion,
      mergeTo: target,
      mergeToVersion: targetVersion,
    };
    return this.http.post<Tag>(`${this.baseUrl}/tag-merge`, body, {
      headers: this.getHeaders(),
    });
  }

  // Tag Categories
  getTagCategories(): Observable<UnpagedSearchResult<TagCategory>> {
    return this.http.get<UnpagedSearchResult<TagCategory>>(
      `${this.baseUrl}/tag-categories`,
      {
        headers: this.getHeaders(),
      },
    );
  }

  createTagCategory(category: Partial<TagCategory>): Observable<TagCategory> {
    return this.http.post<TagCategory>(
      `${this.baseUrl}/tag-categories`,
      category,
      { headers: this.getHeaders() },
    );
  }

  updateTagCategory(
    name: string,
    category: Partial<TagCategory>,
  ): Observable<TagCategory> {
    return this.http.put<TagCategory>(
      `${this.baseUrl}/tag-category/${name}`,
      category,
      { headers: this.getHeaders() },
    );
  }

  deleteTagCategory(name: string, version: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/tag-category/${name}`, {
      headers: this.getHeaders(),
      body: { version },
    });
  }

  // Comments
  getComments(
    query = "",
    offset = 0,
    limit = 100,
  ): Observable<PagedSearchResult<Comment>> {
    const params = new HttpParams()
      .set("query", query)
      .set("offset", offset.toString())
      .set("limit", limit.toString());
    return this.http.get<PagedSearchResult<Comment>>(
      `${this.baseUrl}/comments`,
      {
        headers: this.getHeaders(),
        params,
      },
    );
  }

  createComment(postId: number, text: string): Observable<Comment> {
    return this.http.post<Comment>(
      `${this.baseUrl}/comments`,
      { postId, text },
      { headers: this.getHeaders() },
    );
  }

  updateComment(
    id: number,
    version: string,
    text: string,
  ): Observable<Comment> {
    return this.http.put<Comment>(
      `${this.baseUrl}/comment/${id}`,
      { version, text },
      { headers: this.getHeaders() },
    );
  }

  deleteComment(id: number, version: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/comment/${id}`, {
      headers: this.getHeaders(),
      body: { version },
    });
  }

  // Users
  getUsers(
    query = "",
    offset = 0,
    limit = 100,
  ): Observable<PagedSearchResult<User>> {
    const params = new HttpParams()
      .set("query", query)
      .set("offset", offset.toString())
      .set("limit", limit.toString());
    return this.http.get<PagedSearchResult<User>>(`${this.baseUrl}/users`, {
      headers: this.getHeaders(),
      params,
    });
  }

  getUser(name: string): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/user/${name}`, {
      headers: this.getHeaders(),
    });
  }

  // Pools
  getPools(
    query = "",
    offset = 0,
    limit = 100,
  ): Observable<PagedSearchResult<Pool>> {
    const params = new HttpParams()
      .set("query", query)
      .set("offset", offset.toString())
      .set("limit", limit.toString());
    return this.http.get<PagedSearchResult<Pool>>(`${this.baseUrl}/pools`, {
      headers: this.getHeaders(),
      params,
    });
  }

  getPool(id: number): Observable<Pool> {
    return this.http.get<Pool>(`${this.baseUrl}/pool/${id}`, {
      headers: this.getHeaders(),
    });
  }

  createPool(pool: Partial<Pool>): Observable<Pool> {
    return this.http.post<Pool>(`${this.baseUrl}/pool`, pool, {
      headers: this.getHeaders(),
    });
  }

  updatePool(id: number, pool: Partial<Pool>): Observable<Pool> {
    return this.http.put<Pool>(`${this.baseUrl}/pool/${id}`, pool, {
      headers: this.getHeaders(),
    });
  }

  deletePool(id: number, version: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/pool/${id}`, {
      headers: this.getHeaders(),
      body: { version },
    });
  }
}
