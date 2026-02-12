import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Response from the WD Tagger API.
 */
export interface WdTaggerResponse {
    ratings: {
        general: number;
        sensitive: number;
        questionable: number;
        explicit: number;
    };
    general: Record<string, number>;
    characters: Record<string, number>;
}

/**
 * Service for interacting with the WD Tagger API.
 * This connects to a Docker container running wd-hydrus-tagger or similar.
 */
@Injectable({
    providedIn: 'root',
})
export class WdTaggerService {
    private readonly baseUrl = '/wd-tagger';

    private http = inject(HttpClient);

    /**
     * Sends an image to the tagger and returns predictions.
     */
    predict(file: File): Observable<WdTaggerResponse> {
        const formData = new FormData();
        formData.append('image', file);

        return this.http.post<WdTaggerResponse>(`${this.baseUrl}/predict`, formData);
    }
}
