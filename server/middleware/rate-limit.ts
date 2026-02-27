/**
 * HTTP rate limiting middleware — sliding-window per-IP rate limiter.
 *
 * Configuration via environment variables:
 * - RATE_LIMIT_GET: max GET/HEAD/OPTIONS requests per minute per IP (default: 600)
 * - RATE_LIMIT_MUTATION: max POST/PUT/DELETE requests per minute per IP (default: 60)
 *
 * Uses a sliding window algorithm: each IP tracks timestamps of recent requests,
 * expired entries are pruned on access. Returns 429 with Retry-After header when
 * the limit is exceeded.
 *
 * When a SQLite database is attached via `setDb()`, rate-limit counters are
 * persisted to `rate_limit_state` so they survive server restarts.
 *
 * Stale entries are periodically swept to prevent unbounded memory/storage growth.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('RateLimit');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
    /** Max read (GET/HEAD/OPTIONS) requests per window per IP. */
    maxGet: number;
    /** Max mutation (POST/PUT/DELETE) requests per window per IP. */
    maxMutation: number;
    /** Sliding window size in milliseconds. */
    windowMs: number;
}

export function loadRateLimitConfig(): RateLimitConfig {
    const maxGet = parseInt(process.env.RATE_LIMIT_GET ?? '600', 10);
    const maxMutation = parseInt(process.env.RATE_LIMIT_MUTATION ?? '60', 10);
    return {
        maxGet: Number.isFinite(maxGet) && maxGet > 0 ? maxGet : 240,
        maxMutation: Number.isFinite(maxMutation) && maxMutation > 0 ? maxMutation : 60,
        windowMs: 60_000, // 1 minute sliding window
    };
}

// ---------------------------------------------------------------------------
// Sliding-window tracker
// ---------------------------------------------------------------------------

/** Timestamps of recent requests for a single key+bucket. */
interface BucketEntry {
    /** Sorted array of request timestamps (ms). */
    timestamps: number[];
}

/**
 * Per-key rate limiter using a sliding-window algorithm.
 *
 * Keys can be wallet addresses (preferred trust boundary) or IP addresses
 * (fallback). Maintains two buckets per key: "read" (GET/HEAD/OPTIONS)
 * and "mutation" (POST/PUT/DELETE). Each bucket independently tracks
 * request timestamps within the configured window.
 *
 * Optionally backed by SQLite for persistence across restarts.
 * Call `setDb(db)` after migrations to enable persistence.
 */
export class RateLimiter {
    readonly config: RateLimitConfig;
    /** Map<key, { read: BucketEntry, mutation: BucketEntry }> */
    private readonly clients: Map<string, { read: BucketEntry; mutation: BucketEntry }> = new Map();
    /** Periodic sweep interval handle. */
    private sweepTimer: ReturnType<typeof setInterval> | null = null;
    /** Optional SQLite database for persistence. */
    private db: Database | null = null;

    constructor(config: RateLimitConfig) {
        this.config = config;

        // Sweep stale entries every 5 minutes to bound memory
        this.sweepTimer = setInterval(() => this.sweep(), 5 * 60_000);
        // Allow the timer to be unref'd so it doesn't keep the process alive
        if (this.sweepTimer && typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
            (this.sweepTimer as NodeJS.Timeout).unref();
        }
    }

    /**
     * Attach a database for persistent rate limiting.
     * Loads existing state from SQLite and purges expired windows.
     * Call after migrations have run.
     */
    setDb(db: Database): void {
        this.db = db;
        this.loadFromDb();
        this.purgeExpiredWindows();
    }

    /**
     * Check whether a request from the given key should be allowed.
     * The key is typically a wallet address or IP address.
     *
     * @returns null if allowed, or a Response (429) if rate-limited.
     */
    check(key: string, method: string): Response | null {
        const now = Date.now();
        const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
        const bucketKey = isRead ? 'read' : 'mutation';
        const limit = isRead ? this.config.maxGet : this.config.maxMutation;

        let entry = this.clients.get(key);
        if (!entry) {
            entry = {
                read: { timestamps: [] },
                mutation: { timestamps: [] },
            };
            this.clients.set(key, entry);
        }

        const bucket = entry[bucketKey];
        const windowStart = now - this.config.windowMs;

        // Prune expired timestamps
        const firstValid = bucket.timestamps.findIndex((t) => t > windowStart);
        if (firstValid > 0) {
            bucket.timestamps.splice(0, firstValid);
        } else if (firstValid === -1) {
            bucket.timestamps.length = 0;
        }

        if (bucket.timestamps.length >= limit) {
            // Calculate when the oldest request in the window expires
            const oldestInWindow = bucket.timestamps[0];
            const retryAfterSec = Math.ceil((oldestInWindow + this.config.windowMs - now) / 1000);
            const retryAfter = Math.max(retryAfterSec, 1);

            log.warn('Rate limit exceeded', { key, method, bucket: bucketKey, limit, retryAfter });

            return new Response(
                JSON.stringify({
                    error: 'Too many requests',
                    retryAfter,
                }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': String(retryAfter),
                    },
                },
            );
        }

        bucket.timestamps.push(now);

        // Persist to SQLite if available
        this.persistCheck(key, bucketKey, now);

        return null;
    }

    /** Remove entries with no recent activity (called periodically). */
    private sweep(): void {
        const now = Date.now();
        const windowStart = now - this.config.windowMs;
        let swept = 0;

        for (const [key, entry] of this.clients) {
            const readActive = entry.read.timestamps.some((t) => t > windowStart);
            const mutationActive = entry.mutation.timestamps.some((t) => t > windowStart);
            if (!readActive && !mutationActive) {
                this.clients.delete(key);
                swept++;
            }
        }

        if (swept > 0) {
            log.debug('Swept stale rate-limit entries', { swept, remaining: this.clients.size });
        }

        // Also purge expired SQLite rows
        this.purgeExpiredWindows();
    }

    /** Stop the periodic sweep timer. */
    stop(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
    }

    /** For testing: clear all tracked clients. */
    reset(): void {
        this.clients.clear();
    }

    // ─── SQLite persistence ──────────────────────────────────────────────

    /** Persist a rate-limit check to SQLite. */
    private persistCheck(key: string, bucket: string, timestamp: number): void {
        if (!this.db) return;
        try {
            // Use window_start as the start of the current window (rounded to seconds)
            const windowStart = Math.floor(timestamp / 1000) * 1000;
            this.db.query(
                `INSERT INTO rate_limit_state (key, bucket, window_start, request_count)
                 VALUES (?, ?, ?, 1)
                 ON CONFLICT(key, bucket, window_start) DO UPDATE SET
                    request_count = request_count + 1,
                    updated_at = datetime('now')`
            ).run(key, bucket, windowStart);
        } catch (err) {
            // Persistence failure is non-fatal — in-memory state is still authoritative
            log.debug('Failed to persist rate limit', { key, error: err instanceof Error ? err.message : String(err) });
        }
    }

    /** Load rate-limit state from SQLite on startup. */
    private loadFromDb(): void {
        if (!this.db) return;
        try {
            const now = Date.now();
            const windowStart = now - this.config.windowMs;

            const rows = this.db.query(
                `SELECT key, bucket, window_start, request_count
                 FROM rate_limit_state
                 WHERE window_start >= ?`
            ).all(windowStart) as Array<{
                key: string;
                bucket: string;
                window_start: number;
                request_count: number;
            }>;

            let loaded = 0;
            for (const row of rows) {
                let entry = this.clients.get(row.key);
                if (!entry) {
                    entry = { read: { timestamps: [] }, mutation: { timestamps: [] } };
                    this.clients.set(row.key, entry);
                }
                const bucketEntry = row.bucket === 'read' ? entry.read : entry.mutation;
                // Reconstruct timestamps: spread request_count across the window_start second
                for (let i = 0; i < row.request_count; i++) {
                    bucketEntry.timestamps.push(row.window_start + i);
                }
                loaded += row.request_count;
            }

            if (loaded > 0) {
                log.info('Loaded rate-limit state from SQLite', { entries: loaded, keys: this.clients.size });
            }
        } catch (err) {
            log.warn('Failed to load rate-limit state', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    /** Remove expired windows from SQLite. */
    private purgeExpiredWindows(): void {
        if (!this.db) return;
        try {
            const windowStart = Date.now() - this.config.windowMs;
            const result = this.db.query(
                'DELETE FROM rate_limit_state WHERE window_start < ?'
            ).run(windowStart);
            if (result.changes > 0) {
                log.debug('Purged expired rate-limit windows', { purged: result.changes });
            }
        } catch (err) {
            log.debug('Failed to purge rate-limit windows', { error: err instanceof Error ? err.message : String(err) });
        }
    }
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

/** Paths that bypass rate limiting (monitoring probes, webhooks, etc.). */
const EXEMPT_PATHS = new Set(['/api/health', '/webhooks/github']);

/**
 * Extract the client IP from a Request.
 * Checks X-Forwarded-For first (reverse proxy), then X-Real-IP, falls back to 'unknown'.
 */
export function getClientIp(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
        // X-Forwarded-For can contain multiple IPs; the first is the client
        const first = forwarded.split(',')[0].trim();
        if (first) return first;
    }

    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp.trim();

    return 'unknown';
}

/**
 * Rate-limit check for an incoming HTTP request.
 *
 * When a wallet address is available (from auth context or query param),
 * it is used as the rate limit key instead of IP — the trust boundary
 * is wallet address, not IP.
 *
 * @param walletAddress - Optional wallet address to use as the rate limit key.
 * @returns null if the request is allowed, or a 429 Response if rate-limited.
 */
export function checkRateLimit(req: Request, url: URL, limiter: RateLimiter, walletAddress?: string): Response | null {
    // Exempt specific paths
    if (EXEMPT_PATHS.has(url.pathname)) return null;

    // Don't rate-limit WebSocket upgrades
    if (url.pathname === '/ws') return null;

    // Prefer wallet address as the rate limit key (trust boundary),
    // fall back to IP when no wallet is available
    const key = walletAddress || getClientIp(req);
    return limiter.check(key, req.method);
}
