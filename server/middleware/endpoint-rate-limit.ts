/**
 * Per-endpoint rate limiting with configurable limits, tier support, and
 * standard rate limit response headers.
 *
 * Builds on the existing sliding-window algorithm from rate-limit.ts but adds:
 * - Per-endpoint rules with glob/prefix matching (e.g. 'POST /api/messages')
 * - Tier-based limits (public, user, admin) so authenticated users get higher limits
 * - X-RateLimit-* response headers on every response
 * - Configurable exempt paths (health, docs, webhooks)
 *
 * @see https://github.com/CorvidLabs/corvid-agent/issues/250
 */

import { createLogger } from '../lib/logger';
import { endpointRateLimitRejections } from '../observability/metrics';

const log = createLogger('EndpointRateLimit');

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/** Rate limit for a single tier. */
export interface TierLimit {
    /** Maximum requests allowed within the window. */
    max: number;
    /** Window size in milliseconds. */
    windowMs: number;
}

/** Limits per auth tier for an endpoint rule. */
export interface EndpointTierLimits {
    /** Limit for unauthenticated (public) requests. */
    public?: TierLimit;
    /** Limit for authenticated users (standard API key). */
    user?: TierLimit;
    /** Limit for admin users. */
    admin?: TierLimit;
}

/**
 * A per-endpoint rate limit rule.
 *
 * The pattern is matched as `METHOD /path` where:
 * - `*` matches any method
 * - Paths ending with `/*` match any sub-path (prefix match)
 * - Exact paths match exactly
 *
 * Examples:
 *   "POST /api/messages"      — exact match on POST /api/messages
 *   "GET /api/agents"         — exact match on GET /api/agents
 *   "* /api/tools/*"          — any method under /api/tools/
 */
export interface EndpointRule {
    /** Route pattern: 'METHOD /path' or '* /path/*' */
    pattern: string;
    /** Limits per tier. If a tier is not specified, the default limits apply. */
    tiers: EndpointTierLimits;
}

/** Top-level configuration for the endpoint rate limiter. */
export interface EndpointRateLimitConfig {
    /**
     * Default limits for requests that don't match any endpoint rule.
     * Keyed by tier. If a tier is missing, no rate limit is applied for that tier.
     */
    defaults: EndpointTierLimits;

    /** Per-endpoint rate limit rules, evaluated in order (first match wins). */
    rules: EndpointRule[];

    /**
     * Paths that bypass rate limiting entirely.
     * Supports exact matches and prefix matches (ending with `/*`).
     */
    exemptPaths: string[];
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const ONE_MINUTE = 60_000;

export function loadEndpointRateLimitConfig(): EndpointRateLimitConfig {
    const defaultGetPublic = parseInt(process.env.RATE_LIMIT_GET ?? '600', 10);
    const defaultMutationPublic = parseInt(process.env.RATE_LIMIT_MUTATION ?? '60', 10);

    const safeGet = Number.isFinite(defaultGetPublic) && defaultGetPublic > 0 ? defaultGetPublic : 240;
    const safeMutation = Number.isFinite(defaultMutationPublic) && defaultMutationPublic > 0 ? defaultMutationPublic : 60;

    return {
        defaults: {
            public: { max: Math.floor(safeGet / 2), windowMs: ONE_MINUTE },
            user: { max: safeGet, windowMs: ONE_MINUTE },
            admin: { max: safeGet * 2, windowMs: ONE_MINUTE },
        },
        rules: [
            // Mutations get stricter limits
            {
                pattern: 'POST /api/sessions',
                tiers: {
                    public: { max: Math.floor(safeMutation / 2), windowMs: ONE_MINUTE },
                    user: { max: safeMutation, windowMs: ONE_MINUTE },
                    admin: { max: safeMutation * 2, windowMs: ONE_MINUTE },
                },
            },
            {
                pattern: 'POST /api/messages',
                tiers: {
                    public: { max: Math.floor(safeMutation / 2), windowMs: ONE_MINUTE },
                    user: { max: safeMutation, windowMs: ONE_MINUTE },
                    admin: { max: safeMutation * 2, windowMs: ONE_MINUTE },
                },
            },
            {
                pattern: '* /api/tools/*',
                tiers: {
                    public: { max: Math.floor(safeMutation / 3), windowMs: ONE_MINUTE },
                    user: { max: Math.floor(safeMutation / 2), windowMs: ONE_MINUTE },
                    admin: { max: safeMutation, windowMs: ONE_MINUTE },
                },
            },
            // Credit grant is admin-only but gets extra rate limiting as defense-in-depth
            {
                pattern: 'POST /api/wallets/*',
                tiers: {
                    public: { max: 0, windowMs: ONE_MINUTE },
                    user: { max: 0, windowMs: ONE_MINUTE },
                    admin: { max: 5, windowMs: ONE_MINUTE },
                },
            },
        ],
        exemptPaths: ['/api/health', '/webhooks/github', '/ws', '/.well-known/agent-card.json'],
    };
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/** Parsed route pattern for efficient matching. */
interface ParsedPattern {
    method: string; // '*' for any
    path: string;
    isPrefix: boolean; // true when path ends with /*
}

function parsePattern(pattern: string): ParsedPattern {
    const spaceIdx = pattern.indexOf(' ');
    if (spaceIdx === -1) {
        throw new Error(`Invalid endpoint pattern: "${pattern}" (expected "METHOD /path")`);
    }
    const method = pattern.slice(0, spaceIdx).toUpperCase();
    let path = pattern.slice(spaceIdx + 1);
    let isPrefix = false;

    if (path.endsWith('/*')) {
        isPrefix = true;
        path = path.slice(0, -2); // Remove trailing /*
    }

    return { method, path, isPrefix };
}

function matchesPattern(parsed: ParsedPattern, method: string, pathname: string): boolean {
    // Method check
    if (parsed.method !== '*' && parsed.method !== method) return false;

    // Path check
    if (parsed.isPrefix) {
        return pathname === parsed.path || pathname.startsWith(parsed.path + '/');
    }
    return pathname === parsed.path;
}

// ---------------------------------------------------------------------------
// Rate limit result
// ---------------------------------------------------------------------------

/** Result of a rate limit check, including header info. */
export interface RateLimitResult {
    /** Whether the request is allowed. */
    allowed: boolean;
    /** Rate limit headers to include in the response. */
    headers: Record<string, string>;
    /** If blocked, the 429 Response to return. */
    response?: Response;
}

// ---------------------------------------------------------------------------
// Sliding-window bucket
// ---------------------------------------------------------------------------

interface Bucket {
    timestamps: number[];
}

// ---------------------------------------------------------------------------
// EndpointRateLimiter
// ---------------------------------------------------------------------------

/**
 * Per-endpoint rate limiter with tier support and rate limit headers.
 *
 * Tracks requests in separate sliding-window buckets per
 * (client-key, endpoint-rule, tier) combination.
 */
export class EndpointRateLimiter {
    readonly config: EndpointRateLimitConfig;
    private readonly parsedRules: Array<{ rule: EndpointRule; parsed: ParsedPattern }>;
    private readonly parsedExempt: Array<{ path: string; isPrefix: boolean }>;

    /**
     * Buckets keyed by `${clientKey}:${ruleIndex}` (or `${clientKey}:default:${bucketType}`
     * for requests not matching any rule).
     */
    private readonly buckets: Map<string, Bucket> = new Map();

    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    constructor(config: EndpointRateLimitConfig) {
        this.config = config;

        // Pre-parse rule patterns
        this.parsedRules = config.rules.map((rule) => ({
            rule,
            parsed: parsePattern(rule.pattern),
        }));

        // Pre-parse exempt paths
        this.parsedExempt = config.exemptPaths.map((p) => {
            if (p.endsWith('/*')) {
                return { path: p.slice(0, -2), isPrefix: true };
            }
            return { path: p, isPrefix: false };
        });

        // Sweep stale entries every 5 minutes
        this.sweepTimer = setInterval(() => this.sweep(), 5 * 60_000);
        if (this.sweepTimer && typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
            (this.sweepTimer as NodeJS.Timeout).unref();
        }
    }

    /**
     * Check whether a request should be allowed.
     *
     * @param key     - Client identifier (wallet address or IP)
     * @param method  - HTTP method
     * @param pathname - URL pathname
     * @param tier    - Auth tier: 'public', 'user', or 'admin'
     * @returns RateLimitResult with allowed status, headers, and optional 429 response
     */
    check(key: string, method: string, pathname: string, tier: 'public' | 'user' | 'admin' = 'public'): RateLimitResult {
        // Check exemptions
        if (this.isExempt(pathname)) {
            return { allowed: true, headers: {} };
        }

        const now = Date.now();

        // Find matching rule (first match wins)
        let limit: TierLimit | undefined;
        let bucketKey: string;

        const matchedRule = this.parsedRules.find(({ parsed }) => matchesPattern(parsed, method, pathname));

        if (matchedRule) {
            limit = matchedRule.rule.tiers[tier];
            const ruleIdx = this.parsedRules.indexOf(matchedRule);
            bucketKey = `${key}:rule:${ruleIdx}:${tier}`;
        } else {
            // Fall back to defaults
            limit = this.config.defaults[tier];
            const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
            bucketKey = `${key}:default:${isRead ? 'read' : 'mutation'}:${tier}`;
        }

        // No limit configured for this tier → allow
        if (!limit) {
            return { allowed: true, headers: {} };
        }

        // Get or create bucket
        let bucket = this.buckets.get(bucketKey);
        if (!bucket) {
            bucket = { timestamps: [] };
            this.buckets.set(bucketKey, bucket);
        }

        const windowStart = now - limit.windowMs;

        // Prune expired timestamps
        const firstValid = bucket.timestamps.findIndex((t) => t > windowStart);
        if (firstValid > 0) {
            bucket.timestamps.splice(0, firstValid);
        } else if (firstValid === -1) {
            bucket.timestamps.length = 0;
        }

        const remaining = Math.max(0, limit.max - bucket.timestamps.length);
        const resetTime = now + limit.windowMs;

        // Standard rate limit headers
        const headers: Record<string, string> = {
            'X-RateLimit-Limit': String(limit.max),
            'X-RateLimit-Remaining': String(Math.max(0, remaining - 1)), // -1 for this request
            'X-RateLimit-Reset': String(Math.ceil(resetTime / 1000)),
        };

        if (bucket.timestamps.length >= limit.max) {
            // Rate limited
            const oldestInWindow = bucket.timestamps[0];
            const retryAfterSec = Math.ceil((oldestInWindow + limit.windowMs - now) / 1000);
            const retryAfter = Math.max(retryAfterSec, 1);

            headers['Retry-After'] = String(retryAfter);
            headers['X-RateLimit-Remaining'] = '0';

            log.warn('Endpoint rate limit exceeded', {
                key,
                method,
                path: pathname,
                tier,
                limit: limit.max,
                retryAfter,
            });

            endpointRateLimitRejections.inc({ method, path: pathname, tier });

            const response = new Response(
                JSON.stringify({
                    error: 'Too many requests',
                    retryAfter,
                }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        ...headers,
                    },
                },
            );

            return { allowed: false, headers, response };
        }

        // Allowed — record the timestamp
        bucket.timestamps.push(now);

        return { allowed: true, headers };
    }

    /** Check if a path is exempt from rate limiting. */
    private isExempt(pathname: string): boolean {
        for (const exempt of this.parsedExempt) {
            if (exempt.isPrefix) {
                if (pathname === exempt.path || pathname.startsWith(exempt.path + '/')) return true;
            } else {
                if (pathname === exempt.path) return true;
            }
        }
        return false;
    }

    /** Remove entries with no recent activity. */
    private sweep(): void {
        const now = Date.now();
        // Use the maximum window across all rules + defaults to determine staleness
        const maxWindow = this.getMaxWindow();
        const windowStart = now - maxWindow;
        let swept = 0;

        for (const [key, bucket] of this.buckets) {
            const hasRecent = bucket.timestamps.some((t) => t > windowStart);
            if (!hasRecent) {
                this.buckets.delete(key);
                swept++;
            }
        }

        if (swept > 0) {
            log.debug('Swept stale endpoint rate-limit entries', { swept, remaining: this.buckets.size });
        }
    }

    /** Get the maximum window size across all configured limits. */
    private getMaxWindow(): number {
        let max = ONE_MINUTE; // minimum 1 minute
        for (const tier of ['public', 'user', 'admin'] as const) {
            const d = this.config.defaults[tier];
            if (d) max = Math.max(max, d.windowMs);
        }
        for (const { rule } of this.parsedRules) {
            for (const tier of ['public', 'user', 'admin'] as const) {
                const t = rule.tiers[tier];
                if (t) max = Math.max(max, t.windowMs);
            }
        }
        return max;
    }

    /** Stop the periodic sweep timer. */
    stop(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
    }

    /** For testing: clear all tracked buckets. */
    reset(): void {
        this.buckets.clear();
    }
}

// ---------------------------------------------------------------------------
// Tier resolution helper
// ---------------------------------------------------------------------------

/**
 * Derive the rate limit tier from a request context.
 */
export function resolveTier(authenticated: boolean, role?: string): 'public' | 'user' | 'admin' {
    if (!authenticated) return 'public';
    if (role === 'admin') return 'admin';
    return 'user';
}
