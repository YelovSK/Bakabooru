import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, catchError, of } from "rxjs";
import { DanbooruPost } from "./models";

@Injectable({
  providedIn: "root",
})
export class DanbooruService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = "/danbooru";

  /**
   * Fetches a post by its ID from Danbooru.
   * @param postId The Danbooru post ID
   * @param credentials Optional credentials for authentication
   */
  getPost(
    postId: number,
    credentials?: { username: string; apiKey: string },
  ): Observable<DanbooruPost | null> {
    let headers = new HttpHeaders();
    if (credentials?.username && credentials?.apiKey) {
      const auth = btoa(`${credentials.username}:${credentials.apiKey}`);
      headers = headers.set("Authorization", `Basic ${auth}`);
    }

    return this.http
      .get<DanbooruPost>(`${this.baseUrl}/posts/${postId}.json`, { headers })
      .pipe(
        catchError((error) => {
          console.error("DanbooruService: Failed to fetch post", error);
          return of(null);
        }),
      );
  }

  /**
   * Extracts and categorizes tags from a Danbooru post.
   */
  getTags(post: DanbooruPost): { name: string; category: string }[] {
    const categorizedTags: { name: string; category: string }[] = [];

    const processTags = (str: string, category: string) => {
      if (!str) return;
      str
        .split(" ")
        .filter((t) => t.length > 0)
        .forEach((name) => categorizedTags.push({ name, category }));
    };

    processTags(post.tag_string_general, "general");
    processTags(post.tag_string_character, "character");
    processTags(post.tag_string_copyright, "copyright");
    processTags(post.tag_string_artist, "artist");
    processTags(post.tag_string_meta, "meta");

    return categorizedTags;
  }

  /**
   * Extracts the safety rating from a Danbooru post.
   */
  getSafety(post: DanbooruPost): 'safe' | 'sketchy' | 'unsafe' {
    switch (post.rating) {
      case 'g':
      case 's':
        return 'safe';
      case 'q':
        return 'sketchy';
      case 'e':
        return 'unsafe';
      default:
        return 'safe'; // Default to safe if unknown
    }
  }
}
