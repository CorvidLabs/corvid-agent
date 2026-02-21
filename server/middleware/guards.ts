/**
 * Declarative guard chain pattern for route-level middleware.
 *
 * Guards are composable functions that inspect a request and either
 * allow it (return null) or deny it (return a Response). They are
 * applied in order — the first guard to return a Response short-circuits
 * the chain.
 *
 * Usage:
 *   const denied = applyGuards(req, url, context, rateLimitGuard(limiter), authGuard(config), roleGuard('admin'));
 *   if (denied) return denied;
 */

import type { AuthConfig } from './auth';
import { checkHttpAuth } from './auth';
import type { RateLimiter } from './rate-limit';
import { getClientIp } from './rate-limit';
import { createLogger } from '../lib/logger';

const log = createLogger('Guards');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Request context populated by earlier guards and passed down the chain. */
export interface RequestContext {
    /** Wallet address of the caller (from auth or query param). */
    walletAddress?: string;
    /** Role derived from the API key or JWT claims. */
    role?: string;
    /** Whether the request has been authenticated. */
    authenticated: boolean;
}

/**
 * A guard inspects a request and returns null to allow it,
 * or a Response to deny it.
 */
export type Guard = (req: Request, url: URL, context: RequestContext) => Response | null;

// ---------------------------------------------------------------------------
// Guard implementations
// ---------------------------------------------------------------------------

/**
 * Authentication guard — delegates to checkHttpAuth.
 * On success, populates context.authenticated and context.role.
 */
export function authGuard(config: AuthConfig): Guard {
    return (req: Request, url: URL, context: RequestContext): Response | null => {
        const denied = checkHttpAuth(req, url, config);
        if (denied) return denied;

        // If we get here, auth passed
        context.authenticated = true;

        // Derive role from API key type
        if (config.apiKey) {
            const adminKey = process.env.ADMIN_API_KEY;
            const authHeader = req.headers.get('Authorization');
            const token = authHeader?.replace(/^Bearer\s+/i, '') ?? '';

            // If ADMIN_API_KEY is set and the token matches it, grant admin role
            if (adminKey && token === adminKey) {
                context.role = 'admin';
            } else {
                // Standard API key = user role
                context.role = 'user';
            }
        } else {
            // No API key configured (localhost dev mode) — treat as admin
            context.role = 'admin';
        }

        // Extract wallet address from query param if present
        const wallet = url.searchParams.get('wallet');
        if (wallet) {
            context.walletAddress = wallet;
        }

        return null;
    };
}

/**
 * Role-based access control guard.
 * Requires the request context to have a role matching one of the allowed roles.
 * Must be applied after authGuard.
 */
export function roleGuard(...allowedRoles: string[]): Guard {
    return (_req: Request, url: URL, context: RequestContext): Response | null => {
        if (!context.authenticated) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
            });
        }

        if (!context.role || !allowedRoles.includes(context.role)) {
            log.warn('Access denied: insufficient role', {
                path: url.pathname,
                role: context.role ?? 'none',
                required: allowedRoles.join(', '),
            });
            return new Response(JSON.stringify({ error: 'Forbidden: insufficient role', requiredRoles: allowedRoles }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return null;
    };
}

/**
 * Rate limiting guard.
 * Uses wallet address as the rate limit key when available, falls back to IP.
 */
export function rateLimitGuard(limiter: RateLimiter): Guard {
    /** Paths that bypass rate limiting (monitoring probes, webhooks, etc.). */
    const EXEMPT_PATHS = new Set(['/api/health', '/webhooks/github']);

    return (req: Request, url: URL, context: RequestContext): Response | null => {
        // Exempt specific paths
        if (EXEMPT_PATHS.has(url.pathname)) return null;

        // Don't rate-limit WebSocket upgrades
        if (url.pathname === '/ws') return null;

        // Prefer wallet address as the rate limit key, fall back to IP
        const key = context.walletAddress || getClientIp(req);
        return limiter.check(key, req.method);
    };
}

// ---------------------------------------------------------------------------
// Guard chain runner
// ---------------------------------------------------------------------------

/**
 * Apply a sequence of guards to a request. Returns the first denial Response,
 * or null if all guards pass.
 */
export function applyGuards(req: Request, url: URL, context: RequestContext, ...guards: Guard[]): Response | null {
    for (const guard of guards) {
        const denied = guard(req, url, context);
        if (denied) return denied;
    }
    return null;
}

/**
 * Create a fresh RequestContext for a new request.
 */
export function createRequestContext(walletAddress?: string): RequestContext {
    return {
        walletAddress,
        authenticated: false,
    };
}

// ---------------------------------------------------------------------------
// Route path sets for role-based access control
// ---------------------------------------------------------------------------

/** Paths that require admin role. */
export const ADMIN_PATHS = new Set([
    '/metrics',
    '/api/audit-log',
    '/api/operational-mode',
    '/api/backup',
    '/api/memories/backfill',
    '/api/selftest/run',
]);

/** Check if a path requires admin role (exact match or prefix match). */
export function requiresAdminRole(pathname: string): boolean {
    if (ADMIN_PATHS.has(pathname)) return true;
    // Escalation queue management requires admin
    if (pathname.startsWith('/api/escalation-queue')) return true;
    return false;
}
