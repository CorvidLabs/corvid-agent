/**
 * Declarative guard chain pattern for route-level middleware.
 */

import type { Database } from 'bun:sqlite';
import type { AuthConfig } from './auth';
import { checkHttpAuth } from './auth';
import type { RateLimiter } from './rate-limit';
import { getClientIp } from './rate-limit';
import type { EndpointRateLimiter, RateLimitResult } from './endpoint-rate-limit';
import { resolveTier } from './endpoint-rate-limit';
import type { TenantService } from '../tenant/context';
import type { TenantContext, TenantRole } from '../tenant/types';
import { DEFAULT_TENANT_ID } from '../tenant/types';
import { extractTenantId } from '../tenant/middleware';
import { createLogger } from '../lib/logger';

const log = createLogger('Guards');

export interface RequestContext {
    walletAddress?: string;
    role?: string;
    authenticated: boolean;
    rateLimitHeaders?: Record<string, string>;
    tenantId: string;
    tenantContext?: TenantContext;
    tenantRole?: TenantRole;
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

export function contentLengthGuard(maxBytes: number = 1_048_576): Guard {
    return (req, _url, _ctx) => {
        if (['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(req.method)) return null;
        const cl = req.headers.get('Content-Length');
        if (cl && parseInt(cl, 10) > maxBytes) {
            return new Response(JSON.stringify({ error: 'Payload too large' }), {
                status: 413,
                headers: { 'Content-Type': 'application/json' },
            });
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
        tenantId: DEFAULT_TENANT_ID,
    };
}

/**
 * Tenant guard — resolves tenant context from the request and sets it on the context.
 * Returns 403 if the tenant is suspended.
 */
export function tenantGuard(db: Database, tenantService: TenantService | null): Guard {
    return (req: Request, _url: URL, context: RequestContext): Response | null => {
        if (!tenantService || !tenantService.isMultiTenant()) {
            context.tenantId = DEFAULT_TENANT_ID;
            return null;
        }

        const tenantCtx = extractTenantId(req, db, tenantService);
        context.tenantId = tenantCtx.tenantId;
        context.tenantContext = tenantCtx;

        // Check tenant status
        const tenant = tenantService.getTenant(tenantCtx.tenantId);
        if (tenant && tenant.status === 'suspended') {
            return new Response(JSON.stringify({ error: 'Tenant suspended' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Look up tenant member role from API key hash
        const authHeader = req.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const hasher = new Bun.CryptoHasher('sha256');
            hasher.update(token);
            const keyHash = hasher.digest('hex');

            const member = db.query(
                'SELECT role FROM tenant_members WHERE tenant_id = ? AND key_hash = ?',
            ).get(tenantCtx.tenantId, keyHash) as { role: string } | null;

            if (member) {
                context.tenantRole = member.role as TenantRole;
            }
        }

        return null;
    };
}

/**
 * Tenant role guard — returns 403 if the user's tenant role is not in the allowed list.
 * No-op in single-tenant mode (tenantRole is undefined).
 */
export function tenantRoleGuard(...roles: TenantRole[]): Guard {
    return (_req: Request, _url: URL, context: RequestContext): Response | null => {
        // No-op in single-tenant mode
        if (context.tenantId === DEFAULT_TENANT_ID && !context.tenantRole) {
            return null;
        }

        if (!context.tenantRole || !roles.includes(context.tenantRole)) {
            return new Response(JSON.stringify({
                error: 'Forbidden: insufficient tenant role',
                requiredRoles: roles,
            }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return null;
    };
}

export const ADMIN_PATHS = new Set([
    '/metrics',
    '/api/audit-log',
    '/api/operational-mode',
    '/api/backup',
    '/api/memories/backfill',
    '/api/selftest/run',
    '/api/settings/credits',
    '/api/settings/api-key/rotate',
    '/api/settings/api-key/status',
]);

export function requiresAdminRole(pathname: string): boolean {
    if (ADMIN_PATHS.has(pathname)) return true;
    if (pathname.startsWith('/api/escalation-queue')) return true;
    // Credit grant endpoint requires admin — prevents any authenticated user from granting themselves credits
    if (/^\/api\/wallets\/[^/]+\/credits$/.test(pathname)) return true;
    return false;
}
