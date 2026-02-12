import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DuplicatePost {
    id: number;
    libraryId: number;
    relativePath: string;
    md5Hash: string;
    width: number;
    height: number;
    contentType: string;
    sizeBytes: number;
    importDate: string;
    thumbnailUrl: string;
    contentUrl: string;
}

export interface DuplicateGroup {
    id: number;
    type: 'exact' | 'perceptual';
    similarityPercent: number | null;
    detectedDate: string;
    posts: DuplicatePost[];
}

@Injectable({
    providedIn: 'root'
})
export class DuplicateService {
    private apiUrl = `${environment.apiBaseUrl}/duplicates`;

    constructor(private http: HttpClient) { }

    getGroups(): Observable<DuplicateGroup[]> {
        return this.http.get<DuplicateGroup[]>(this.apiUrl);
    }

    keepAll(groupId: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${groupId}/keep-all`, {});
    }

    keepOne(groupId: number, postId: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/${groupId}/keep/${postId}`, {});
    }

    resolveAllExact(): Observable<{ resolved: number }> {
        return this.http.post<{ resolved: number }>(`${this.apiUrl}/resolve-all-exact`, {});
    }
}
