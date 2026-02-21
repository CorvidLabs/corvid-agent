/**
 * Authentication middleware for the CorvidAgent HTTP/WS server.
 *
 * Security model:
 * - If API_KEY is set, all non-OPTIONS routes require `Authorization: Bearer <key>`.
 * - If BIND_HOST !== 127.0.0.1 and no API_KEY is set, a random key is generated
 *   on first run and persisted to .env (admin bootstrap).
 * - WebSocket connections authenticate via `?key=<key>` query param. When API_KEY
 *   is set, unauthenticated upgrade requests are rejected with 401.
 * - Health endpoint (/api/health) is always public (monitoring probes need it).
 */

import { createLogger } from '../lib/logger';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

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
 * Generate a cryptographically random API key.
 */
function generateApiKey(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * Persist a generated API key to the .env file.
 * Appends to .env if it exists, creates it otherwise.
 */
function persistApiKeyToEnv(key: string): boolean {
    try {
        const envPath = join(process.cwd(), '.env');
        const line = `API_KEY=${key}\n`;

        if (existsSync(envPath)) {
            const content = readFileSync(envPath, 'utf8');
            // Don't overwrite an existing API_KEY
            if (content.includes('API_KEY=')) {
                return false;
            }
            appendFileSync(envPath, line);
        } else {
            writeFileSync(envPath, line);
        }
        return true;
    } catch (err) {
        log.warn('Failed to persist API key to .env', {
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
}

/**
 * Validate that the deployment is safe to start.
 *
 * When BIND_HOST is non-localhost and no API_KEY is set, instead of refusing
 * to start, generates a random API key on first run, prints it to stdout,
 * and persists it to .env (admin bootstrap).
 */
export function validateStartupSecurity(config: AuthConfig): void {
    const isLocalhost = config.bindHost === '127.0.0.1' || config.bindHost === 'localhost' || config.bindHost === '::1';

    if (!isLocalhost && !config.apiKey) {
        // First-run admin bootstrap: generate and persist a key
        const generatedKey = generateApiKey();
        const persisted = persistApiKeyToEnv(generatedKey);

        if (persisted) {
            // Update config in-place so the rest of the server uses the new key
            config.apiKey = generatedKey;
            process.env.API_KEY = generatedKey;

            log.info('==========================================================');
            log.info('FIRST-RUN BOOTSTRAP: Generated API key for remote access');
            log.info(`API_KEY=${generatedKey}`);
            log.info('This key has been persisted to .env');
            log.info('Use this key in the Authorization header: Bearer <key>');
            log.info('==========================================================');
        } else {
            // .env already has an API_KEY line or write failed — fall back to refusing
            log.error('SECURITY: BIND_HOST is not localhost but no API_KEY is set');
            log.error('Set API_KEY in your .env to secure the server, or bind to 127.0.0.1');
            process.exit(1);
        }
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

    // A2A endpoints require auth when API key is configured
    // (agent-card discovery at /.well-known/agent-card.json is already in PUBLIC_PATHS)

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
export function timingSafeEqual(a: string, b: string): boolean {
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
