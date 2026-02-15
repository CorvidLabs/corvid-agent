/**
 * LRU cache with configurable TTL for memory lookups.
 *
 * Reduces repeated SQLite queries for hot keys by caching recently
 * accessed memory values in-process.
 */

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export interface LRUCacheOptions {
    /** Maximum number of entries. Default: 256 */
    maxSize?: number;
    /** Time-to-live in milliseconds. Default: 5 minutes */
    ttlMs?: number;
}

export class LRUCache<T> {
    private readonly maxSize: number;
    private readonly ttlMs: number;
    private readonly map = new Map<string, CacheEntry<T>>();

    constructor(opts: LRUCacheOptions = {}) {
        this.maxSize = opts.maxSize ?? 256;
        this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
    }

    /** Get a value if present and not expired. Returns undefined on miss. */
    get(key: string): T | undefined {
        const entry = this.map.get(key);
        if (!entry) return undefined;

        if (Date.now() > entry.expiresAt) {
            this.map.delete(key);
            return undefined;
        }

        // Move to end (most-recently-used)
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }

    /** Set a value with the configured TTL. */
    set(key: string, value: T): void {
        // Delete first to ensure insertion order is correct
        this.map.delete(key);

        // Evict oldest entry if at capacity
        if (this.map.size >= this.maxSize) {
            const oldest = this.map.keys().next().value;
            if (oldest !== undefined) {
                this.map.delete(oldest);
            }
        }

        this.map.set(key, {
            value,
            expiresAt: Date.now() + this.ttlMs,
        });
    }

    /** Remove a specific key. */
    delete(key: string): boolean {
        return this.map.delete(key);
    }

    /** Remove all entries matching a prefix. */
    invalidatePrefix(prefix: string): number {
        let count = 0;
        for (const key of [...this.map.keys()]) {
            if (key.startsWith(prefix)) {
                this.map.delete(key);
                count++;
            }
        }
        return count;
    }

    /** Remove all entries. */
    clear(): void {
        this.map.clear();
    }

    /** Number of entries currently in cache (including expired). */
    get size(): number {
        return this.map.size;
    }

    /** Remove expired entries and return count of removed items. */
    prune(): number {
        const now = Date.now();
        let count = 0;
        for (const [key, entry] of this.map) {
            if (now > entry.expiresAt) {
                this.map.delete(key);
                count++;
            }
        }
        return count;
    }
}
