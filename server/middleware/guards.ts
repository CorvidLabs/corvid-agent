/**
 * Declarative guard chain pattern for route-level middleware.
 */

import type { AuthConfig } from './auth';
import { checkHttpAuth } from './auth';
import type { RateLimiter } from './rate-limit';
import { getClientIp } from './rate-limit';
import type { EndpointRateLimiter, RateLimitResult } from './endpoint-rate-limit';
import { resolveTier } from './endpoint-rate-limit';
import { createLogger } from '../lib/logger';

const log = createLogger('Guards');

export interface RequestContext {
    walletAddress?: string;
    role?: string;
    authenticated: boolean;
    rateLimitHeaders?: Record<string, string>;
}

export type Guard = (req: Request, url: URL, context: RequestContext) => Response | null;

export function authGuard(config: AuthConfig): Guard {
    return (req: Request, url: URL, context: RequestContext): Response | null => {
        const denied = checkHttpAuth(req, url, config);
        if (denied) return denied;
        context.authenticated = true;
        if (config.apiKey) {
            const adminKey = process.env.ADMIN_API_KEY;
            const authHeader = req.headers.get('Authorization');
            const token = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
            if (adminKey && token === adminKey) {
                context.role = 'admin';
            } else {
                context.role = 'user';
            }
        } else {
            context.role = 'admin';
        }
        const wallet = url.searchParams.get('wallet');
        if (wallet) {
            context.walletAddress = wallet;
        }
        return null;
    };
}

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

export function rateLimitGuard(limiter: RateLimiter): Guard {
    const EXEMPT_PATHS = new Set(['/api/health', '/webhooks/github']);
    return (req: Request, url: URL, context: RequestContext): Response | null => {
        if (EXEMPT_PATHS.has(url.pathname)) return null;
        if (url.pathname === '/ws') return null;
        const key = context.walletAddress || getClientIp(req);
        return limiter.check(key, req.method);
    };
}

export function endpointRateLimitGuard(limiter: EndpointRateLimiter): Guard {
    return (req: Request, url: URL, context: RequestContext): Response | null => {
        const key = context.walletAddress || getClientIp(req);
        const tier = resolveTier(context.authenticated, context.role);
        const result: RateLimitResult = limiter.check(key, req.method, url.pathname, tier);
        context.rateLimitHeaders = result.headers;
        if (!result.allowed && result.response) {
            return result.response;
        }
        return null;
    };
}

export function applyGuards(req: Request, url: URL, context: RequestContext, ...guards: Guard[]): Response | null {
    for (const guard of guards) {
        const denied = guard(req, url, context);
        if (denied) return denied;
    }
    return null;
}

export function createRequestContext(walletAddress?: string): RequestContext {
    return {
        walletAddress,
        authenticated: false,
    };
}

export const ADMIN_PATHS = new Set([
    '/metrics',
    '/api/audit-log',
    '/api/operational-mode',
    '/api/backup',
    '/api/memories/backfill',
    '/api/selftest/run',
]);

export function requiresAdminRole(pathname: string): boolean {
    if (ADMIN_PATHS.has(pathname)) return true;
    if (pathname.startsWith('/api/escalation-queue')) return true;
    return false;
}
