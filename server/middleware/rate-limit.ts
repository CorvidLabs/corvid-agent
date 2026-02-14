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

/** Timestamps of recent requests for a single IP+bucket. */
interface BucketEntry {
    /** Sorted array of request timestamps (ms). */
    timestamps: number[];
}

/**
 * Per-IP rate limiter using a sliding-window algorithm.
 *
 * Maintains two buckets per IP: "read" (GET/HEAD/OPTIONS) and "mutation"
 * (POST/PUT/DELETE). Each bucket independently tracks request timestamps
 * within the configured window.
 */
export class RateLimiter {
    private readonly config: RateLimitConfig;
    /** Map<ip, { read: BucketEntry, mutation: BucketEntry }> */
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
     * Check whether a request from the given IP should be allowed.
     *
     * @returns null if allowed, or a Response (429) if rate-limited.
     */
    check(ip: string, method: string): Response | null {
        const now = Date.now();
        const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
        const bucketKey = isRead ? 'read' : 'mutation';
        const limit = isRead ? this.config.maxGet : this.config.maxMutation;

        let entry = this.clients.get(ip);
        if (!entry) {
            entry = {
                read: { timestamps: [] },
                mutation: { timestamps: [] },
            };
            this.clients.set(ip, entry);
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

            log.warn('Rate limit exceeded', { ip, method, bucket: bucketKey, limit, retryAfter });

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

        for (const [ip, entry] of this.clients) {
            const readActive = entry.read.timestamps.some((t) => t > windowStart);
            const mutationActive = entry.mutation.timestamps.some((t) => t > windowStart);
            if (!readActive && !mutationActive) {
                this.clients.delete(ip);
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
function getClientIp(req: Request): string {
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
 * @returns null if the request is allowed, or a 429 Response if rate-limited.
 */
export function checkRateLimit(req: Request, url: URL, limiter: RateLimiter): Response | null {
    // Exempt specific paths
    if (EXEMPT_PATHS.has(url.pathname)) return null;

    // Don't rate-limit WebSocket upgrades
    if (url.pathname === '/ws') return null;

    const ip = getClientIp(req);
    return limiter.check(ip, req.method);
}
