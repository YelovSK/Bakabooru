import type { AutoTaggingResult } from '../auto-tagging/models';

/**
 * Status of a cached tagging result.
 */
export type CacheStatus = 'pending' | 'success' | 'no-results' | 'error';

/**
 * Key used to identify cached entries.
 * Based on file metadata for fast lookup.
 */
export interface CacheKey {
    fileName: string;
    fileSize: number;
    lastModified: number;
}

/**
 * A cached tagging result entry.
 */
export interface CacheEntry {
    /** Stringified CacheKey */
    key: string;
    /** Status of the tagging attempt */
    status: CacheStatus;
    /** Tagging results if status is 'success' */
    results: AutoTaggingResult[] | null;
    /** List of provider IDs that have been attempted */
    attemptedProviders: string[];
    /** Error message if status is 'error' */
    errorMessage?: string;
    /** Timestamp when this entry was created */
    timestamp: number;
    /** Optional expiration timestamp */
    expiresAt?: number;
}

/**
 * State for tracking tagging progress.
 */
export type TaggingState =
    | 'idle'
    | 'queued'
    | 'tagging'
    | 'success'
    | 'no-results'
    | 'error'
    | 'applied';

/**
 * Entry for tracking tagging state of an item.
 */
export interface TaggingStateEntry {
    state: TaggingState;
    providersAttempted: string[];
    providersRemaining: string[];
    lastError?: string;
    lastAttempt?: number;
}
