/**
 * Centralized deduplication service with TTL, bounded LRU cache,
 * and optional SQLite persistence for crash recovery.
 *
 * Replaces per-module Map/Set dedup patterns with a single service
 * that prevents unbounded memory growth and survives restarts.
 */

import { Database } from 'bun:sqlite';
import { createLogger } from './logger';

const log = createLogger('dedup');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DedupNamespaceConfig {
    /** Maximum number of entries before LRU eviction. Default: 1000 */
    maxSize?: number;
    /** Time-to-live per entry in milliseconds. Default: 5 minutes */
    ttlMs?: number;
    /** Persist entries to SQLite for crash recovery. Default: false */
    persist?: boolean;
}

export interface DedupMetrics {
    size: number;
    hits: number;
    misses: number;
    evictions: number;
}

// ---------------------------------------------------------------------------
// Internal LRU-with-TTL map (set-oriented: value is always `true`)
// ---------------------------------------------------------------------------

class DedupCache {
    private readonly maxSize: number;
    private readonly ttlMs: number;
    private readonly map = new Map<string, number>(); // key -> expiresAt
    private _hits = 0;
    private _misses = 0;
    private _evictions = 0;

    constructor(maxSize: number, ttlMs: number) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }

    /** Returns true if the key has been seen and has not expired. */
    has(key: string): boolean {
        const expiresAt = this.map.get(key);
        if (expiresAt === undefined) {
            this._misses++;
            return false;
        }
        if (Date.now() > expiresAt) {
            this.map.delete(key);
            this._misses++;
            return false;
        }
        // Promote to most-recently-used
        this.map.delete(key);
        this.map.set(key, expiresAt);
        this._hits++;
        return true;
    }

    /** Mark a key as seen. Returns true if it was already present (duplicate). */
    add(key: string): boolean {
        const existing = this.has(key);
        // Delete + re-insert to move to end
        this.map.delete(key);
        // Evict LRU if at capacity
        if (this.map.size >= this.maxSize) {
            const oldest = this.map.keys().next().value;
            if (oldest !== undefined) {
                this.map.delete(oldest);
                this._evictions++;
            }
        }
        this.map.set(key, Date.now() + this.ttlMs);
        return existing;
    }

    /** Remove a specific key. */
    delete(key: string): boolean {
        return this.map.delete(key);
    }

    /** Clear all entries. */
    clear(): void {
        this.map.clear();
    }

    /** Number of entries (including potentially expired). */
    get size(): number {
        return this.map.size;
    }

    /** Remove expired entries. Returns count of removed items. */
    prune(): number {
        const now = Date.now();
        let count = 0;
        for (const [key, expiresAt] of this.map) {
            if (now > expiresAt) {
                this.map.delete(key);
                count++;
            }
        }
        return count;
    }

    /** Return all non-expired keys (for persistence snapshots). */
    keys(): string[] {
        const now = Date.now();
        const result: string[] = [];
        for (const [key, expiresAt] of this.map) {
            if (now <= expiresAt) result.push(key);
        }
        return result;
    }

    get metrics(): DedupMetrics {
        return {
            size: this.map.size,
            hits: this._hits,
            misses: this._misses,
            evictions: this._evictions,
        };
    }
}

// ---------------------------------------------------------------------------
// DedupService
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SIZE = 1000;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PRUNE_INTERVAL_MS = 60_000; // prune expired entries every 60s
const PERSIST_INTERVAL_MS = 30_000; // flush dirty namespaces to DB every 30s

export class DedupService {
    private static instance: DedupService | null = null;

    private namespaces = new Map<string, { cache: DedupCache; config: Required<DedupNamespaceConfig>; dirty: boolean }>();
    private db: Database | null = null;
    private pruneTimer: ReturnType<typeof setInterval> | null = null;
    private persistTimer: ReturnType<typeof setInterval> | null = null;

    constructor(db?: Database) {
        this.db = db ?? null;
        if (this.db) {
            this.ensureTable();
        }
    }

    /**
     * Initialize the global singleton. Call once at server startup.
     * Subsequent calls to `DedupService.global()` return this instance.
     */
    static init(db?: Database): DedupService {
        if (!DedupService.instance) {
            DedupService.instance = new DedupService(db);
        }
        return DedupService.instance;
    }

    /**
     * Get the global singleton. Falls back to a no-persistence instance
     * if `init()` has not been called (e.g. in tests).
     */
    static global(): DedupService {
        if (!DedupService.instance) {
            DedupService.instance = new DedupService();
        }
        return DedupService.instance;
    }

    /**
     * Reset the global singleton (for testing only).
     */
    static resetGlobal(): void {
        if (DedupService.instance) {
            DedupService.instance.stop();
            DedupService.instance = null;
        }
    }

    /**
     * Start background pruning and persistence timers.
     * Call this once after constructing the service.
     */
    start(): void {
        if (this.pruneTimer) return;
        this.pruneTimer = setInterval(() => this.pruneAll(), PRUNE_INTERVAL_MS);
        if (this.db) {
            this.persistTimer = setInterval(() => this.persistAll(), PERSIST_INTERVAL_MS);
        }
    }

    /**
     * Stop background timers and flush any dirty state.
     */
    stop(): void {
        if (this.pruneTimer) {
            clearInterval(this.pruneTimer);
            this.pruneTimer = null;
        }
        if (this.persistTimer) {
            clearInterval(this.persistTimer);
            this.persistTimer = null;
        }
        // Final flush
        if (this.db) {
            this.persistAll();
        }
    }

    /**
     * Register a dedup namespace with its configuration.
     * If the namespace uses persistence, restores keys from SQLite.
     */
    register(namespace: string, config: DedupNamespaceConfig = {}): void {
        if (this.namespaces.has(namespace)) return;

        const resolved: Required<DedupNamespaceConfig> = {
            maxSize: config.maxSize ?? DEFAULT_MAX_SIZE,
            ttlMs: config.ttlMs ?? DEFAULT_TTL_MS,
            persist: config.persist ?? false,
        };

        const cache = new DedupCache(resolved.maxSize, resolved.ttlMs);
        this.namespaces.set(namespace, { cache, config: resolved, dirty: false });

        // Restore from DB if persistence is enabled
        if (resolved.persist && this.db) {
            this.restoreNamespace(namespace, cache);
        }
    }

    /**
     * Check if a key has been seen in the given namespace.
     * Auto-registers the namespace with defaults if not already registered.
     */
    has(namespace: string, key: string): boolean {
        const ns = this.getOrRegister(namespace);
        return ns.cache.has(key);
    }

    /**
     * Mark a key as seen. Returns true if it was already present (duplicate).
     * This is the primary dedup API — equivalent to "check-and-set".
     */
    isDuplicate(namespace: string, key: string): boolean {
        const ns = this.getOrRegister(namespace);
        const wasDuplicate = ns.cache.add(key);
        if (!wasDuplicate) ns.dirty = true;
        return wasDuplicate;
    }

    /**
     * Mark a key as seen without checking for duplicates.
     */
    markSeen(namespace: string, key: string): void {
        const ns = this.getOrRegister(namespace);
        ns.cache.add(key);
        ns.dirty = true;
    }

    /**
     * Remove a key from the namespace.
     */
    delete(namespace: string, key: string): boolean {
        const ns = this.namespaces.get(namespace);
        if (!ns) return false;
        const deleted = ns.cache.delete(key);
        if (deleted) ns.dirty = true;
        return deleted;
    }

    /**
     * Clear all entries in a namespace.
     */
    clear(namespace: string): void {
        const ns = this.namespaces.get(namespace);
        if (!ns) return;
        ns.cache.clear();
        ns.dirty = true;
    }

    /**
     * Get metrics for a namespace.
     */
    metrics(namespace: string): DedupMetrics | null {
        const ns = this.namespaces.get(namespace);
        if (!ns) return null;
        return ns.cache.metrics;
    }

    /**
     * Get metrics for all namespaces.
     */
    allMetrics(): Record<string, DedupMetrics> {
        const result: Record<string, DedupMetrics> = {};
        for (const [name, ns] of this.namespaces) {
            result[name] = ns.cache.metrics;
        }
        return result;
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private getOrRegister(namespace: string): { cache: DedupCache; config: Required<DedupNamespaceConfig>; dirty: boolean } {
        let ns = this.namespaces.get(namespace);
        if (!ns) {
            this.register(namespace);
            ns = this.namespaces.get(namespace)!;
        }
        return ns;
    }

    private pruneAll(): void {
        for (const [, ns] of this.namespaces) {
            ns.cache.prune();
        }
    }

    private ensureTable(): void {
        if (!this.db) return;
        this.db.run(`
            CREATE TABLE IF NOT EXISTS dedup_state (
                namespace TEXT NOT NULL,
                key       TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                PRIMARY KEY (namespace, key)
            )
        `);
        // Clean up expired rows on startup
        this.db.run(`DELETE FROM dedup_state WHERE expires_at < ?`, [Date.now()]);
    }

    private restoreNamespace(namespace: string, cache: DedupCache): void {
        if (!this.db) return;
        try {
            const rows = this.db.query(
                `SELECT key FROM dedup_state WHERE namespace = ? AND expires_at > ?`
            ).all(namespace, Date.now()) as { key: string }[];
            for (const row of rows) {
                cache.add(row.key);
            }
            if (rows.length > 0) {
                log.info('Restored dedup state from DB', { namespace, count: rows.length });
            }
        } catch (err) {
            log.error('Failed to restore dedup state', { namespace, error: String(err) });
        }
    }

    private persistAll(): void {
        if (!this.db) return;
        for (const [namespace, ns] of this.namespaces) {
            if (!ns.config.persist || !ns.dirty) continue;
            try {
                // Delete old keys for this namespace, then insert current ones
                this.db.run(`DELETE FROM dedup_state WHERE namespace = ?`, [namespace]);
                const keys = ns.cache.keys();
                if (keys.length > 0) {
                    const insert = this.db.prepare(
                        `INSERT INTO dedup_state (namespace, key, expires_at) VALUES (?, ?, ?)`
                    );
                    const expiresAt = Date.now() + ns.config.ttlMs;
                    for (const key of keys) {
                        insert.run(namespace, key, expiresAt);
                    }
                }
                ns.dirty = false;
            } catch (err) {
                log.error('Failed to persist dedup state', { namespace, error: String(err) });
            }
        }
    }
}
