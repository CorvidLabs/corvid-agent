import { describe, it, expect } from 'bun:test';
import {
    loadAuthConfig,
    validateStartupSecurity,
    checkHttpAuth,
    checkWsAuth,
    buildCorsHeaders,
    applyCors,
    type AuthConfig,
} from '../middleware/auth';

// --- Helpers ----------------------------------------------------------------

function makeRequest(path: string, options?: RequestInit & { headers?: Record<string, string> }): Request {
    return new Request(`http://localhost:3000${path}`, options);
}

function makeUrl(path: string, params?: Record<string, string>): URL {
    const url = new URL(`http://localhost:3000${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    return url;
}

const AUTH_ENABLED: AuthConfig = {
    apiKey: 'test-secret-key-12345',
    allowedOrigins: [],
    bindHost: '0.0.0.0',
};

const AUTH_DISABLED: AuthConfig = {
    apiKey: null,
    allowedOrigins: [],
    bindHost: '127.0.0.1',
};

const AUTH_WITH_ORIGINS: AuthConfig = {
    apiKey: 'test-secret-key-12345',
    allowedOrigins: ['https://dashboard.example.com', 'http://localhost:4200'],
    bindHost: '0.0.0.0',
};

// --- loadAuthConfig ---------------------------------------------------------

describe('loadAuthConfig', () => {
    it('returns null apiKey when API_KEY is not set', () => {
        const originalKey = process.env.API_KEY;
        delete process.env.API_KEY;
        const config = loadAuthConfig();
        expect(config.apiKey).toBeNull();
        if (originalKey !== undefined) process.env.API_KEY = originalKey;
    });

    it('trims whitespace from API_KEY', () => {
        const original = process.env.API_KEY;
        process.env.API_KEY = '  my-key  ';
        const config = loadAuthConfig();
        expect(config.apiKey).toBe('my-key');
        if (original !== undefined) process.env.API_KEY = original;
        else delete process.env.API_KEY;
    });

    it('parses ALLOWED_ORIGINS as comma-separated list', () => {
        const original = process.env.ALLOWED_ORIGINS;
        process.env.ALLOWED_ORIGINS = 'https://a.com , https://b.com,https://c.com';
        const config = loadAuthConfig();
        expect(config.allowedOrigins).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
        if (original !== undefined) process.env.ALLOWED_ORIGINS = original;
        else delete process.env.ALLOWED_ORIGINS;
    });

    it('returns empty allowedOrigins when ALLOWED_ORIGINS is not set', () => {
        const original = process.env.ALLOWED_ORIGINS;
        delete process.env.ALLOWED_ORIGINS;
        const config = loadAuthConfig();
        expect(config.allowedOrigins).toEqual([]);
        if (original !== undefined) process.env.ALLOWED_ORIGINS = original;
    });
});

// --- validateStartupSecurity ------------------------------------------------

describe('validateStartupSecurity', () => {
    it('does not throw for localhost without API_KEY', () => {
        expect(() => validateStartupSecurity(AUTH_DISABLED)).not.toThrow();
    });

    it('does not throw for non-localhost with API_KEY', () => {
        expect(() => validateStartupSecurity(AUTH_ENABLED)).not.toThrow();
    });

    // Note: testing process.exit(1) case requires mocking process.exit,
    // which would complicate these unit tests. The behavior is verified
    // by integration testing: start server with BIND_HOST=0.0.0.0 and no API_KEY.
});

// --- checkHttpAuth ----------------------------------------------------------

describe('checkHttpAuth', () => {
    it('returns null (allow) when auth is disabled', () => {
        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_DISABLED);
        expect(result).toBeNull();
    });

    it('returns null for OPTIONS requests even with auth enabled', () => {
        const req = makeRequest('/api/sessions', { method: 'OPTIONS' });
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).toBeNull();
    });

    it('returns null for /api/health (public path)', () => {
        const req = makeRequest('/api/health');
        const url = makeUrl('/api/health');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).toBeNull();
    });

    it('returns 401 when no Authorization header is present', () => {
        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(401);
        expect(result!.headers.get('WWW-Authenticate')).toBe('Bearer');
    });

    it('returns 401 for malformed Authorization header', () => {
        const req = makeRequest('/api/sessions', {
            headers: { Authorization: 'Basic abc123' },
        });
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(401);
    });

    it('returns 403 for incorrect API key', () => {
        const req = makeRequest('/api/sessions', {
            headers: { Authorization: 'Bearer wrong-key' },
        });
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    it('returns null (allow) for correct API key', () => {
        const req = makeRequest('/api/sessions', {
            headers: { Authorization: `Bearer ${AUTH_ENABLED.apiKey}` },
        });
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).toBeNull();
    });

    it('handles case-insensitive Bearer prefix', () => {
        const req = makeRequest('/api/sessions', {
            headers: { Authorization: `bearer ${AUTH_ENABLED.apiKey}` },
        });
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).toBeNull();
    });

    it('returns JSON error body on auth failure', async () => {
        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).not.toBeNull();
        const body = await result!.json();
        expect(body).toHaveProperty('error');
        expect(body.error).toBe('Authentication required');
    });
});

// --- checkWsAuth ------------------------------------------------------------

describe('checkWsAuth', () => {
    it('returns true when auth is disabled', () => {
        const req = makeRequest('/ws');
        const url = makeUrl('/ws');
        expect(checkWsAuth(req, url, AUTH_DISABLED)).toBe(true);
    });

    it('returns false when auth is enabled and no credentials provided', () => {
        const req = makeRequest('/ws');
        const url = makeUrl('/ws');
        expect(checkWsAuth(req, url, AUTH_ENABLED)).toBe(false);
    });

    it('returns true with valid key in query param', () => {
        const req = makeRequest('/ws');
        const url = makeUrl('/ws', { key: AUTH_ENABLED.apiKey! });
        expect(checkWsAuth(req, url, AUTH_ENABLED)).toBe(true);
    });

    it('returns false with invalid key in query param', () => {
        const req = makeRequest('/ws');
        const url = makeUrl('/ws', { key: 'wrong-key' });
        expect(checkWsAuth(req, url, AUTH_ENABLED)).toBe(false);
    });

    it('returns true with valid Authorization header', () => {
        const req = makeRequest('/ws', {
            headers: { Authorization: `Bearer ${AUTH_ENABLED.apiKey}` },
        });
        const url = makeUrl('/ws');
        expect(checkWsAuth(req, url, AUTH_ENABLED)).toBe(true);
    });

    it('returns false with invalid Authorization header', () => {
        const req = makeRequest('/ws', {
            headers: { Authorization: 'Bearer wrong-key' },
        });
        const url = makeUrl('/ws');
        expect(checkWsAuth(req, url, AUTH_ENABLED)).toBe(false);
    });
});

// --- buildCorsHeaders -------------------------------------------------------

describe('buildCorsHeaders', () => {
    it('returns wildcard origin when no origins are configured', () => {
        const req = makeRequest('/api/sessions', {
            headers: { Origin: 'https://anything.com' },
        });
        const headers = buildCorsHeaders(req, AUTH_ENABLED);
        expect(headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('reflects allowed origin when request origin matches', () => {
        const req = makeRequest('/api/sessions', {
            headers: { Origin: 'https://dashboard.example.com' },
        });
        const headers = buildCorsHeaders(req, AUTH_WITH_ORIGINS);
        expect(headers['Access-Control-Allow-Origin']).toBe('https://dashboard.example.com');
        expect(headers['Vary']).toBe('Origin');
    });

    it('returns empty origin for disallowed origin', () => {
        const req = makeRequest('/api/sessions', {
            headers: { Origin: 'https://evil.com' },
        });
        const headers = buildCorsHeaders(req, AUTH_WITH_ORIGINS);
        expect(headers['Access-Control-Allow-Origin']).toBe('');
    });

    it('allows all methods including DELETE', () => {
        const req = makeRequest('/api/sessions');
        const headers = buildCorsHeaders(req, AUTH_ENABLED);
        expect(headers['Access-Control-Allow-Methods']).toContain('DELETE');
    });

    it('includes Authorization in allowed headers', () => {
        const req = makeRequest('/api/sessions');
        const headers = buildCorsHeaders(req, AUTH_ENABLED);
        expect(headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });

    it('returns wildcard when no Origin header and origins are configured', () => {
        // Same-origin requests don't send Origin header — should still work
        const req = makeRequest('/api/sessions');
        const headers = buildCorsHeaders(req, AUTH_WITH_ORIGINS);
        expect(headers['Access-Control-Allow-Origin']).toBe('*');
    });
});

// --- applyCors --------------------------------------------------------------

describe('applyCors', () => {
    it('applies CORS headers to an existing response', () => {
        const response = new Response('OK', { status: 200 });
        const req = makeRequest('/api/sessions');
        applyCors(response, req, AUTH_ENABLED);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });
});

// --- Timing-safe comparison (indirect via checkHttpAuth) --------------------

describe('timing-safe key comparison', () => {
    it('rejects keys that are a prefix of the actual key', () => {
        const req = makeRequest('/api/sessions', {
            headers: { Authorization: 'Bearer test-secret' }, // prefix of test-secret-key-12345
        });
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    it('rejects keys that have the actual key as a prefix', () => {
        const req = makeRequest('/api/sessions', {
            headers: { Authorization: 'Bearer test-secret-key-12345-extra' },
        });
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    it('rejects empty key', () => {
        const req = makeRequest('/api/sessions', {
            headers: { Authorization: 'Bearer ' },
        });
        const url = makeUrl('/api/sessions');
        const result = checkHttpAuth(req, url, AUTH_ENABLED);
        expect(result).not.toBeNull();
        // Empty string after "Bearer " won't match regex
        expect(result!.status).toBe(401);
    });
});
