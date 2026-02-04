/**
 * Optional API key authentication.
 * When API_KEY env var is set, all /api/ routes (except /api/health) require
 * a Bearer token in the Authorization header.
 */

import { timingSafeEqual } from 'node:crypto';

const API_KEY = process.env.API_KEY?.trim() || null;

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
    if (!API_KEY) return null; // No API key configured — allow all
    if (url.pathname === '/api/health') return null; // Health check is always public

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
