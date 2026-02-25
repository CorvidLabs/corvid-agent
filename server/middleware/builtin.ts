/**
 * Built-in middleware implementations for the Koa-style pipeline.
 *
 * Each middleware is exported as a factory function that returns a `Middleware`
 * object with name, order, and handler.
 *
 * @see pipeline.ts for the pipeline runner and types.
 */

import type { Middleware, MiddlewareContext, NextFn } from './pipeline';
import type { AuthConfig } from './auth';
import { buildCorsHeaders } from './auth';
import { checkHttpAuth } from './auth';
import type { RateLimiter } from './rate-limit';
import { getClientIp } from './rate-limit';
import type { EndpointRateLimiter } from './endpoint-rate-limit';
import { resolveTier } from './endpoint-rate-limit';
import { createLogger } from '../lib/logger';

const log = createLogger('Middleware');

// ---------------------------------------------------------------------------
// Order constants — single source of truth for middleware ordering
// ---------------------------------------------------------------------------

export const ORDER = {
    /** CORS preflight handling. */
    CORS: 10,
    /** Request logging (upstream: start timer; downstream: log result). */
    REQUEST_LOG: 20,
    /** Error boundary — catches errors from downstream middleware. */
    ERROR_HANDLER: 30,
    /** Rate limiting. */
    RATE_LIMIT: 100,
    /** Authentication. */
    AUTH: 110,
    /** Role-based access control. */
    ROLE: 120,
} as const;

// ---------------------------------------------------------------------------
// Error handling middleware
// ---------------------------------------------------------------------------

/**
 * Error boundary middleware.
 *
 * Wraps downstream middleware in a try/catch. If an error propagates up,
 * it logs the error and sets a generic 500 response (never exposing internals
 * to the client).
 *
 * Runs early (order 30) so it catches errors from auth, routing, etc.
 */
export function errorHandlerMiddleware(): Middleware {
    return {
        name: 'error-handler',
        order: ORDER.ERROR_HANDLER,
        handler: async (ctx: MiddlewareContext, next: NextFn): Promise<void> => {
            try {
                await next();
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const stack = err instanceof Error ? err.stack : undefined;
                log.error('Unhandled error in pipeline', { error: message, stack, path: ctx.url.pathname });

                if (!ctx.response) {
                    ctx.response = new Response(
                        JSON.stringify({ error: 'Internal server error', timestamp: new Date().toISOString() }),
                        { status: 500, headers: { 'Content-Type': 'application/json' } },
                    );
                }
            }
        },
    };
}

// ---------------------------------------------------------------------------
// Request logging middleware
// ---------------------------------------------------------------------------

/**
 * Request logging middleware.
 *
 * Logs the incoming request method + path on the way down, and the
 * response status + duration on the way up. Uses structured logging
 * with the shared logger.
 */
export function requestLogMiddleware(): Middleware {
    return {
        name: 'request-log',
        order: ORDER.REQUEST_LOG,
        handler: async (ctx: MiddlewareContext, next: NextFn): Promise<void> => {
            const { method, url } = ctx;

            await next();

            const durationMs = performance.now() - ctx.startTime;
            const status = ctx.response?.status ?? 0;
            log.info(`${method} ${url.pathname} ${status}`, {
                method,
                path: url.pathname,
                status,
                durationMs: Math.round(durationMs * 100) / 100,
            });
        },
    };
}

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------

/**
 * CORS middleware.
 *
 * Handles OPTIONS preflight requests (sets ctx.response and aborts) and
 * applies CORS headers to all responses on the upstream phase.
 */
export function corsMiddleware(config: AuthConfig): Middleware {
    return {
        name: 'cors',
        order: ORDER.CORS,
        handler: async (ctx: MiddlewareContext, next: NextFn): Promise<void> => {
            // Handle preflight
            if (ctx.method === 'OPTIONS') {
                const corsHeaders = buildCorsHeaders(ctx.req, config);
                corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
                ctx.response = new Response(null, { status: 204, headers: corsHeaders });
                ctx.aborted = true;
                return;
            }

            await next();

            // Apply CORS headers to whatever response was set
            if (ctx.response) {
                const corsHeaders = buildCorsHeaders(ctx.req, config);
                for (const [key, value] of Object.entries(corsHeaders)) {
                    ctx.response.headers.set(key, value);
                }
            }
        },
    };
}

// ---------------------------------------------------------------------------
// Rate limit middleware
// ---------------------------------------------------------------------------

/** Paths that bypass rate limiting (monitoring probes, webhooks, etc.). */
const RATE_LIMIT_EXEMPT = new Set(['/api/health', '/webhooks/github']);

/**
 * Rate limiting middleware.
 *
 * Uses the existing sliding-window RateLimiter. When a request exceeds
 * the limit, sets a 429 response and aborts the pipeline.
 */
export function rateLimitMiddleware(limiter: RateLimiter): Middleware {
    return {
        name: 'rate-limit',
        order: ORDER.RATE_LIMIT,
        handler: async (ctx: MiddlewareContext, next: NextFn): Promise<void> => {
            const { url, req, requestContext } = ctx;

            // Exempt specific paths
            if (RATE_LIMIT_EXEMPT.has(url.pathname) || url.pathname === '/ws') {
                await next();
                return;
            }

            // Prefer wallet address as rate limit key, fall back to IP
            const key = requestContext.walletAddress || getClientIp(req);
            const denied = limiter.check(key, req.method);
            if (denied) {
                ctx.response = denied;
                ctx.aborted = true;
                return;
            }

            await next();
        },
    };
}


// ---------------------------------------------------------------------------
// Per-endpoint rate limit middleware
// ---------------------------------------------------------------------------

export function endpointRateLimitMiddleware(limiter: EndpointRateLimiter): Middleware {
    return {
        name: 'endpoint-rate-limit',
        order: ORDER.RATE_LIMIT + 15,
        handler: async (ctx: MiddlewareContext, next: NextFn): Promise<void> => {
            const { url, req, requestContext } = ctx;
            const key = requestContext.walletAddress || getClientIp(req);
            const tier = resolveTier(requestContext.authenticated, requestContext.role);
            const result = limiter.check(key, req.method, url.pathname, tier);
            requestContext.rateLimitHeaders = result.headers;
            if (!result.allowed && result.response) {
                ctx.response = result.response;
                ctx.aborted = true;
                return;
            }
            await next();
            if (ctx.response && requestContext.rateLimitHeaders) {
                for (const [header, value] of Object.entries(requestContext.rateLimitHeaders)) {
                    ctx.response.headers.set(header, value);
                }
            }
        },
    };
}
// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

/**
 * Authentication middleware.
 *
 * Delegates to the existing checkHttpAuth function. On success, populates
 * the requestContext with authenticated=true, role, and wallet address.
 * On failure, sets a 401/403 response and aborts.
 */
export function authMiddleware(config: AuthConfig): Middleware {
    return {
        name: 'auth',
        order: ORDER.AUTH,
        handler: async (ctx: MiddlewareContext, next: NextFn): Promise<void> => {
            const { req, url, requestContext } = ctx;

            const denied = checkHttpAuth(req, url, config);
            if (denied) {
                ctx.response = denied;
                ctx.aborted = true;
                return;
            }

            // Auth passed — populate context
            requestContext.authenticated = true;

            // Derive role from API key type
            if (config.apiKey) {
                const adminKey = process.env.ADMIN_API_KEY;
                const authHeader = req.headers.get('Authorization');
                const token = authHeader?.replace(/^Bearer\s+/i, '') ?? '';

                if (adminKey && token === adminKey) {
                    requestContext.role = 'admin';
                } else {
                    requestContext.role = 'user';
                }
            } else {
                requestContext.role = 'admin';
            }

            // Extract wallet address from query param
            const wallet = url.searchParams.get('wallet');
            if (wallet) {
                requestContext.walletAddress = wallet;
            }

            await next();
        },
    };
}

// ---------------------------------------------------------------------------
// Role guard middleware
// ---------------------------------------------------------------------------

/**
 * Role-based access control middleware.
 *
 * Checks that the authenticated user has one of the required roles.
 * Must be placed after auth middleware in the pipeline.
 *
 * This is a factory that takes a predicate to decide which paths
 * need role checking, avoiding hardcoding path sets here.
 */
export function roleMiddleware(
    allowedRoles: string[],
    pathPredicate: (pathname: string) => boolean,
): Middleware {
    return {
        name: 'role',
        order: ORDER.ROLE,
        handler: async (ctx: MiddlewareContext, next: NextFn): Promise<void> => {
            const { url, requestContext } = ctx;

            // Only enforce role for matching paths
            if (!pathPredicate(url.pathname)) {
                await next();
                return;
            }

            if (!requestContext.authenticated) {
                ctx.response = new Response(
                    JSON.stringify({ error: 'Authentication required' }),
                    { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' } },
                );
                ctx.aborted = true;
                return;
            }

            if (!requestContext.role || !allowedRoles.includes(requestContext.role)) {
                log.warn('Access denied: insufficient role', {
                    path: url.pathname,
                    role: requestContext.role ?? 'none',
                    required: allowedRoles.join(', '),
                });
                ctx.response = new Response(
                    JSON.stringify({ error: 'Forbidden: insufficient role', requiredRoles: allowedRoles }),
                    { status: 403, headers: { 'Content-Type': 'application/json' } },
                );
                ctx.aborted = true;
                return;
            }

            await next();
        },
    };
}
