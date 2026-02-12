import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Observable, from, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

import type { AutoTaggingResult } from '../auto-tagging/models';
import type { CacheEntry, CacheStatus } from './models';

const DB_NAME = 'tagging-cache';
const DB_VERSION = 1;
const STORE_NAME = 'entries';
const FINGERPRINT_SIZE = 4096; // Use first 4KB for fingerprinting

interface TaggingCacheDB extends DBSchema {
    entries: {
        key: string;
        value: CacheEntry;
        indexes: {
            'by-timestamp': number;
            'by-status': CacheStatus;
        };
    };
}

/**
 * Service for caching tagging results in IndexedDB.
 * Prevents redundant API calls when retrying or re-running tagging.
 */
@Injectable({
    providedIn: 'root',
})
export class TaggingCacheService {
    private dbPromise: Promise<IDBPDatabase<TaggingCacheDB>> | null = null;

    private getDb(): Promise<IDBPDatabase<TaggingCacheDB>> {
        if (!this.dbPromise) {
            this.dbPromise = openDB<TaggingCacheDB>(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                    store.createIndex('by-timestamp', 'timestamp');
                    store.createIndex('by-status', 'status');
                },
            });
        }
        return this.dbPromise;
    }

    /**
     * Generates a content-based fingerprint from file size and first 4KB.
     * This ensures the same image content produces the same key regardless of filename.
     */
    async getFileFingerprint(file: File): Promise<string> {
        const size = file.size;
        const chunkSize = Math.min(FINGERPRINT_SIZE, size);
        const chunk = file.slice(0, chunkSize);
        const buffer = await chunk.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Simple hash: XOR all bytes in groups of 4 to create a 32-bit fingerprint
        let hash = 0;
        for (let i = 0; i < bytes.length; i++) {
            hash = ((hash << 5) - hash + bytes[i]) | 0;
        }

        return `${size}_${(hash >>> 0).toString(16)}`;
    }

    /**
     * Synchronous cache key for backwards compatibility - uses file metadata.
     * Prefer getFileFingerprint for content-based lookup.
     */
    getCacheKey(file: File): string {
        return `${file.name}_${file.size}_${file.lastModified}`;
    }

    /**
     * Gets a cache entry for a file using content fingerprint.
     */
    get(file: File): Observable<CacheEntry | null> {
        return from(this.getFileFingerprint(file)).pipe(
            switchMap((key) => this.getByKey(key)),
            catchError((err) => {
                console.error('TaggingCacheService: Failed to get entry', err);
                return of(null);
            }),
        );
    }

    /**
     * Gets a cache entry by key.
     */
    getByKey(key: string): Observable<CacheEntry | null> {
        return from(this.getDb()).pipe(
            switchMap((db) => db.get(STORE_NAME, key)),
            map((entry) => entry ?? null),
            catchError((err) => {
                console.error('TaggingCacheService: Failed to get entry by key', err);
                return of(null);
            }),
        );
    }

    /**
     * Stores a cache entry for a file using content fingerprint.
     */
    set(file: File, entry: Omit<CacheEntry, 'key'>): Observable<void> {
        return from(this.getFileFingerprint(file)).pipe(
            switchMap((key) => {
                const fullEntry: CacheEntry = { ...entry, key };
                return from(this.getDb()).pipe(
                    switchMap((db) => db.put(STORE_NAME, fullEntry)),
                );
            }),
            map(() => undefined),
            catchError((err) => {
                console.error('TaggingCacheService: Failed to set entry', err);
                return of(undefined);
            }),
        );
    }

    /**
     * Checks if a cache entry exists for a file.
     */
    has(file: File): Observable<boolean> {
        return this.get(file).pipe(map((entry) => entry !== null));
    }

    /**
     * Updates the status and results of an existing cache entry.
     */
    updateStatus(
        file: File,
        status: CacheStatus,
        results?: AutoTaggingResult[],
        errorMessage?: string,
    ): Observable<void> {
        return this.get(file).pipe(
            switchMap((existing) => {
                if (!existing) {
                    // Create new entry
                    return this.set(file, {
                        status,
                        results: results ?? null,
                        attemptedProviders: [],
                        errorMessage,
                        timestamp: Date.now(),
                    });
                }
                // Update existing
                return this.set(file, {
                    ...existing,
                    status,
                    results: results ?? existing.results,
                    errorMessage: errorMessage ?? existing.errorMessage,
                    timestamp: Date.now(),
                });
            }),
        );
    }

    /**
     * Marks a provider as attempted for a file.
     */
    markProviderAttempted(file: File, providerId: string): Observable<void> {
        return this.get(file).pipe(
            switchMap((existing) => {
                const attemptedProviders = existing?.attemptedProviders ?? [];
                if (!attemptedProviders.includes(providerId)) {
                    attemptedProviders.push(providerId);
                }
                return this.set(file, {
                    status: existing?.status ?? 'pending',
                    results: existing?.results ?? null,
                    attemptedProviders,
                    errorMessage: existing?.errorMessage,
                    timestamp: Date.now(),
                });
            }),
        );
    }

    /**
     * Checks if a provider has been attempted for a file.
     */
    hasProviderBeenAttempted(file: File, providerId: string): Observable<boolean> {
        return this.get(file).pipe(
            map((entry) => entry?.attemptedProviders.includes(providerId) ?? false),
        );
    }

    /**
     * Deletes a cache entry for a file.
     */
    delete(file: File): Observable<void> {
        return from(this.getFileFingerprint(file)).pipe(
            switchMap((key) => from(this.getDb()).pipe(
                switchMap((db) => db.delete(STORE_NAME, key)),
            )),
            map(() => undefined),
            catchError((err) => {
                console.error('TaggingCacheService: Failed to delete entry', err);
                return of(undefined);
            }),
        );
    }

    /**
     * Clears all cache entries.
     */
    clear(): Observable<void> {
        return from(this.getDb()).pipe(
            switchMap((db) => db.clear(STORE_NAME)),
            catchError((err) => {
                console.error('TaggingCacheService: Failed to clear cache', err);
                return of(undefined);
            }),
        );
    }

    /**
     * Clears expired cache entries.
     */
    clearExpired(): Observable<number> {
        const now = Date.now();
        return from(this.getDb()).pipe(
            switchMap(async (db) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                let deletedCount = 0;

                let cursor = await store.openCursor();
                while (cursor) {
                    if (cursor.value.expiresAt && cursor.value.expiresAt < now) {
                        await cursor.delete();
                        deletedCount++;
                    }
                    cursor = await cursor.continue();
                }

                await tx.done;
                return deletedCount;
            }),
            catchError((err) => {
                console.error('TaggingCacheService: Failed to clear expired entries', err);
                return of(0);
            }),
        );
    }

    /**
     * Gets all entries with a specific status.
     */
    getByStatus(status: CacheStatus): Observable<CacheEntry[]> {
        return from(this.getDb()).pipe(
            switchMap((db) => db.getAllFromIndex(STORE_NAME, 'by-status', status)),
            catchError((err) => {
                console.error('TaggingCacheService: Failed to get entries by status', err);
                return of([]);
            }),
        );
    }

    /**
     * Gets the count of entries by status.
     */
    getCountByStatus(status: CacheStatus): Observable<number> {
        return from(this.getDb()).pipe(
            switchMap((db) => db.countFromIndex(STORE_NAME, 'by-status', status)),
            catchError((err) => {
                console.error('TaggingCacheService: Failed to count entries by status', err);
                return of(0);
            }),
        );
    }

    /**
     * Gets total count of all entries.
     */
    getTotalCount(): Observable<number> {
        return from(this.getDb()).pipe(
            switchMap((db) => db.count(STORE_NAME)),
            catchError((err) => {
                console.error('TaggingCacheService: Failed to count entries', err);
                return of(0);
            }),
        );
    }
}
