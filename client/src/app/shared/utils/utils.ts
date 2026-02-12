export function escapeTagName(tagName: string): string {
    return tagName.replace(/:/g, '\\:');
}

/** Generate a unique ID, with fallback for non-secure contexts (HTTP) */
export function generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for HTTP contexts
    return 'id-' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}