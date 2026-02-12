import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, catchError, map, of, switchMap } from "rxjs";
import { GelbooruResponse, GelbooruPost, GelbooruTag } from "./models";

@Injectable({
  providedIn: "root",
})
export class GelbooruService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = "/gelbooru";

  // Gelbooru category mapping
  private readonly CATEGORY_MAP: Record<number, string> = {
    0: "general",
    1: "artist",
    3: "copyright",
    4: "character",
    5: "meta",
  };

  /**
   * Fetches a post by its ID from Gelbooru.
   * @param postId The Gelbooru post ID
   * @param credentials Optional credentials for authentication
   */
  getPost(
    postId: number,
    credentials?: { userId: string; apiKey: string },
  ): Observable<GelbooruPost | null> {
    const params: Record<string, string> = {
      page: "dapi",
      s: "post",
      q: "index",
      id: postId.toString(),
      json: "1",
    };

    if (credentials?.userId && credentials?.apiKey) {
      params["user_id"] = credentials.userId;
      params["api_key"] = credentials.apiKey;
    }

    return this.http
      .get<GelbooruResponse>(`${this.baseUrl}/index.php`, { params })
      .pipe(
        map((response) => {
          const posts = response.post || [];
          if (!posts || posts.length === 0) return null;
          return Array.isArray(posts) ? posts[0] : posts;
        }),
        catchError((error) => {
          console.error("GelbooruService: Failed to fetch post", error);
          return of(null);
        }),
      );
  }

  /**
   * Extracts and categorizes tags from a Gelbooru post.
   * This involves an extra API call to fetch tag metadata.
   */
  getTags(
    post: GelbooruPost,
    credentials?: { userId: string; apiKey: string },
  ): Observable<{ name: string; category: string }[]> {
    const tagNames = (post.tags || "")
      .split(" ")
      .filter((tag: string) => tag.length > 0);

    if (tagNames.length === 0) {
      return of([]);
    }

    const params: Record<string, string> = {
      page: "dapi",
      s: "tag",
      q: "index",
      names: tagNames.join(" "),
      json: "1",
    };

    if (credentials?.userId && credentials?.apiKey) {
      params["user_id"] = credentials.userId;
      params["api_key"] = credentials.apiKey;
    }

    return this.http
      .get<GelbooruResponse>(`${this.baseUrl}/index.php`, { params })
      .pipe(
        map((response) => {
          const tags = response.tag || [];
          const tagMap = new Map<string, string>();

          tags.forEach((t) => {
            tagMap.set(t.name, this.CATEGORY_MAP[t.type] || "general");
          });

          return tagNames.map((name) => ({
            name,
            category: tagMap.get(name) || "general",
          }));
        }),
        catchError((error) => {
          console.error(
            "GelbooruService: Failed to fetch tags metadata",
            error,
          );
          // Fallback to all general if metadata fetch fails
          return of(
            tagNames.map((name) => ({
              name,
              category: "general",
            })),
          );
        }),
      );
  }

  /**
   * Extracts the safety rating from a Gelbooru post.
   */
  getSafety(post: GelbooruPost): 'safe' | 'sketchy' | 'unsafe' {
    const rating = post.rating?.toLowerCase();
    switch (rating) {
      case 's':
      case 'safe':
        return 'safe';
      case 'q':
      case 'questionable':
        return 'sketchy';
      case 'e':
      case 'explicit':
        return 'unsafe';
      default:
        return 'safe'; // Default to safe if unknown
    }
  }
}
