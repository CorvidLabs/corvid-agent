/**
 * API key authentication.
 *
 * Auth behaviour by environment:
 *
 * | API_KEY set? | NODE_ENV=production | Result                                      |
 * |--------------|---------------------|---------------------------------------------|
 * | Yes          | any                 | Bearer token required on all /api/ routes   |
 * | No           | production          | Server refuses to start (enforced elsewhere)|
 * | No           | development/test    | WARNING logged, requests allowed             |
 *
 * Public paths (always unauthenticated):
 *   - /api/health
 *   - /api/auth/login
 *   - /api/auth/refresh
 */

import { timingSafeEqual } from 'node:crypto';
import { createLogger } from './logger';

const log = createLogger('Auth');

const API_KEY = process.env.API_KEY?.trim() || null;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Log auth status once at startup
if (!API_KEY) {
    if (IS_PRODUCTION) {
        log.error('API_KEY is not set — all API routes are UNPROTECTED in production! Set API_KEY to secure your instance.');
    } else {
        log.warn('API_KEY is not set — API routes are open. Set API_KEY in .env for production use.');
    }
} else {
    log.info('API key authentication enabled');
}

/** Public paths that never require authentication. */
const PUBLIC_PATHS = new Set([
    '/api/health',
    '/api/auth/login',
    '/api/auth/refresh',
]);

/** Constant-time string comparison to prevent timing attacks. */
function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Whether API key auth is enabled. */
export function isAuthEnabled(): boolean {
    return API_KEY !== null;
}

/**
 * Check whether the request is authenticated.
 * Returns null if auth passes, or a 401 Response if it fails.
 */
export function checkAuth(req: Request, url: URL): Response | null {
    // Public paths are always allowed
    if (PUBLIC_PATHS.has(url.pathname)) return null;

    // If no API key configured, allow in dev but warn
    if (!API_KEY) return null;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !safeEqual(match[1], API_KEY)) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return null;
}

/**
 * Check whether a WebSocket upgrade request is authenticated.
 * WebSocket clients cannot set Authorization headers, so we accept
 * the token as a `?token=` query parameter or via the Authorization header.
 * Returns null if auth passes, or a 401 Response if it fails.
 */
export function checkWsAuth(req: Request, url: URL): Response | null {
    if (!API_KEY) return null; // No API key configured — allow all

    // Check query parameter first (standard for WS auth)
    const token = url.searchParams.get('token');
    if (token && safeEqual(token, API_KEY)) return null;

    // Fall back to Authorization header (some clients support it)
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match && safeEqual(match[1], API_KEY)) return null;
    }

    return new Response(JSON.stringify({ error: 'WebSocket authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
    });
}
