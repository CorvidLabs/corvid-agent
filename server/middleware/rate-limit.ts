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
 * Stale IP entries are periodically swept to prevent unbounded memory growth.
 */

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
 */
export class RateLimiter {
    readonly config: RateLimitConfig;
    /** Map<key, { read: BucketEntry, mutation: BucketEntry }> */
    private readonly clients: Map<string, { read: BucketEntry; mutation: BucketEntry }> = new Map();
    /** Periodic sweep interval handle. */
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

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
