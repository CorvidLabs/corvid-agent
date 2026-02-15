/**
 * Authentication middleware for the CorvidAgent HTTP/WS server.
 *
 * Security model:
 * - If API_KEY is set, all non-OPTIONS routes require `Authorization: Bearer <key>`.
 * - If BIND_HOST !== 127.0.0.1 and no API_KEY is set, the server refuses to start.
 * - WebSocket connections authenticate via `?key=<key>` query param or the
 *   first message `{ type: "auth", key: "<key>" }`.
 * - Health endpoint (/api/health) is always public (monitoring probes need it).
 */

import { createLogger } from '../lib/logger';

const log = createLogger('Auth');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AuthConfig {
    /** The API key required for access. null = auth disabled (localhost-only). */
    apiKey: string | null;
    /** Origins allowed by CORS. Empty = allow all (for localhost). */
    allowedOrigins: string[];
    /** The bind host — used to enforce the "must have key if not localhost" rule. */
    bindHost: string;
}

/**
 * Load auth configuration from environment variables.
 * Throws if the deployment is insecure (non-localhost without API_KEY).
 */
export function loadAuthConfig(): AuthConfig {
    const apiKey = process.env.API_KEY?.trim() || null;
    const bindHost = process.env.BIND_HOST || '127.0.0.1';

    const allowedOrigins: string[] = [];
    const rawOrigins = process.env.ALLOWED_ORIGINS?.trim();
    if (rawOrigins) {
        for (const origin of rawOrigins.split(',')) {
            const trimmed = origin.trim();
            if (trimmed.length > 0) allowedOrigins.push(trimmed);
        }
    }

    return { apiKey, allowedOrigins, bindHost };
}

/**
 * Validate that the deployment is safe to start.
 * Refuses to proceed if bound to a non-localhost address without API_KEY.
 */
export function validateStartupSecurity(config: AuthConfig): void {
    const isLocalhost = config.bindHost === '127.0.0.1' || config.bindHost === 'localhost' || config.bindHost === '::1';

    if (!isLocalhost && !config.apiKey) {
        log.error('SECURITY: BIND_HOST is not localhost but no API_KEY is set');
        log.error('Set API_KEY in your .env to secure the server, or bind to 127.0.0.1');
        process.exit(1);
    }

    if (config.apiKey) {
        if (config.apiKey.length < 16) {
            log.warn('API_KEY is shorter than 16 characters — consider using a stronger key');
        }
        log.info('API key authentication enabled');
    } else {
        log.info('No API_KEY set — server is localhost-only, auth disabled');
    }

    if (config.allowedOrigins.length > 0) {
        log.info(`CORS restricted to origins: ${config.allowedOrigins.join(', ')}`);
    }
}

// ---------------------------------------------------------------------------
// HTTP Auth
// ---------------------------------------------------------------------------

/** Routes that bypass authentication (monitoring, preflight, A2A discovery). */
const PUBLIC_PATHS = new Set(['/api/health', '/.well-known/agent-card.json']);

/**
 * Check whether an HTTP request is authenticated.
 * Returns null if authenticated, or a 401/403 Response if not.
 */
export function checkHttpAuth(req: Request, url: URL, config: AuthConfig): Response | null {
    // No API key configured = auth disabled (localhost mode)
    if (!config.apiKey) return null;

    // OPTIONS preflight is always allowed (CORS handles it)
    if (req.method === 'OPTIONS') return null;

    // Public paths bypass auth
    if (PUBLIC_PATHS.has(url.pathname)) return null;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
        });
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return new Response(JSON.stringify({ error: 'Invalid Authorization header format. Expected: Bearer <key>' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
        });
    }

    if (!timingSafeEqual(match[1], config.apiKey)) {
        log.warn('Rejected request with invalid API key', { path: url.pathname, ip: req.headers.get('x-forwarded-for') ?? 'unknown' });
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return null;
}

// ---------------------------------------------------------------------------
// WebSocket Auth
// ---------------------------------------------------------------------------

/**
 * Check whether a WebSocket upgrade request is authenticated.
 * Supports `?key=<key>` query parameter.
 * Returns true if authenticated, false if not.
 */
export function checkWsAuth(req: Request, url: URL, config: AuthConfig): boolean {
    // No API key configured = auth disabled
    if (!config.apiKey) return true;

    // Check Authorization header first (standard path)
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match && timingSafeEqual(match[1], config.apiKey)) return true;
    }

    // Check query parameter (browsers can't set headers on WebSocket upgrade)
    const key = url.searchParams.get('key');
    if (key && timingSafeEqual(key, config.apiKey)) return true;

    log.warn('Rejected WebSocket connection: invalid or missing auth', { ip: req.headers.get('x-forwarded-for') ?? 'unknown' });
    return false;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/**
 * Build CORS headers based on the request origin and allowed origins config.
 */
export function buildCorsHeaders(req: Request, config: AuthConfig): Record<string, string> {
    const requestOrigin = req.headers.get('Origin');

    let allowOrigin = '*';
    if (config.allowedOrigins.length > 0) {
        // If specific origins are configured, only reflect back if the request origin is allowed
        if (requestOrigin && config.allowedOrigins.includes(requestOrigin)) {
            allowOrigin = requestOrigin;
        } else if (requestOrigin) {
            // Origin not in allowlist — return empty origin (browser will block)
            allowOrigin = '';
        }
        // No Origin header (same-origin or non-browser) — allow
    }

    const headers: Record<string, string> = {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // When we're reflecting a specific origin (not *), Vary on Origin
    if (allowOrigin !== '*') {
        headers['Vary'] = 'Origin';
    }

    return headers;
}

/**
 * Apply CORS headers to an existing Response.
 */
export function applyCors(response: Response, req: Request, config: AuthConfig): void {
    const corsHeaders = buildCorsHeaders(req, config);
    for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
    }
}

// ---------------------------------------------------------------------------
// Timing-safe comparison
// ---------------------------------------------------------------------------

/**
 * Constant-time string comparison to prevent timing attacks on API key validation.
 * Uses the same approach as crypto.timingSafeEqual but works with strings.
 */
function timingSafeEqual(a: string, b: string): boolean {
    const encoder = new TextEncoder();
    const bufA = encoder.encode(a);
    const bufB = encoder.encode(b);

    // If lengths differ, still compare to avoid timing leak, but result is false
    const len = Math.max(bufA.length, bufB.length);
    const paddedA = new Uint8Array(len);
    const paddedB = new Uint8Array(len);
    paddedA.set(bufA);
    paddedB.set(bufB);

    let result = bufA.length ^ bufB.length; // non-zero if lengths differ
    for (let i = 0; i < len; i++) {
        result |= paddedA[i] ^ paddedB[i];
    }
    return result === 0;
}
