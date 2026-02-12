import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";
import { SaucenaoResponse } from "./models";

@Injectable({
  providedIn: "root",
})
export class SaucenaoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = "/saucenao";

  /**
   * Performs a reverse image search using SauceNAO.
   * @param file The image file to search
   * @param apiKey SauceNAO API key
   * @param numResults Number of results to return
   * @param db Specific database to search (999 for all)
   */
  search(
    file: File,
    apiKey: string,
    numResults = 15,
    db = 999,
    dbs?: number[],
  ): Observable<SaucenaoResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const params: Record<string, string | number> = {
      output_type: 2,
      numres: numResults,
      api_key: apiKey,
    };

    params["db"] = db;

    return this.http
      .post<SaucenaoResponse>(`${this.baseUrl}/search.php`, formData, {
        params,
      })
      .pipe(
        catchError((error: HttpErrorResponse) => {
          console.error(`SaucenaoService: HTTP ${error.status}`, error.message);
          // Re-throw with status preserved for proper retry handling
          return throwError(() => ({ status: error.status, message: error.message }));
        }),
      );
  }
}
