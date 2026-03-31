/**
 * Tests for authentication middleware — HTTP auth, WS auth, CORS, key rotation, expiry.
 */
import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import {
    loadAuthConfig,
    checkHttpAuth,
    checkWsAuth,
    rotateApiKey,
    getApiKeyRotationStatus,
    setApiKeyExpiry,
    isApiKeyExpired,
    getApiKeyExpiryWarning,
    buildCorsHeaders,
    timingSafeEqual,
    type AuthConfig,
} from '../middleware/auth';

function makeConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
    return {
        apiKey: 'test-api-key-secure-enough',
        allowedOrigins: [],
        bindHost: '127.0.0.1',
        ...overrides,
    };
}

function makeRequest(path: string, opts: { method?: string; headers?: Record<string, string> } = {}): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const req = new Request(url.toString(), {
        method: opts.method ?? 'GET',
        headers: opts.headers ?? {},
    });
    return { req, url };
}

// ── timingSafeEqual ──────────────────────────────────────────────────

describe('timingSafeEqual', () => {
    test('returns true for equal strings', () => {
        expect(timingSafeEqual('hello', 'hello')).toBe(true);
    });

    test('returns false for different strings', () => {
        expect(timingSafeEqual('hello', 'world')).toBe(false);
    });

    test('returns false for different lengths', () => {
        expect(timingSafeEqual('short', 'much-longer-string')).toBe(false);
    });

    test('returns true for empty strings', () => {
        expect(timingSafeEqual('', '')).toBe(true);
    });

    test('returns false for one empty one not', () => {
        expect(timingSafeEqual('', 'x')).toBe(false);
    });
});

// ── checkHttpAuth ────────────────────────────────────────────────────

describe('checkHttpAuth', () => {
    test('allows all requests when no API key configured', () => {
        const config = makeConfig({ apiKey: null });
        const { req, url } = makeRequest('/api/agents');
        expect(checkHttpAuth(req, url, config)).toBeNull();
    });

    test('allows OPTIONS preflight', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/api/agents', { method: 'OPTIONS' });
        expect(checkHttpAuth(req, url, config)).toBeNull();
    });

    test('allows /api/health without auth', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/api/health');
        expect(checkHttpAuth(req, url, config)).toBeNull();
    });

    test('allows /.well-known/agent-card.json without auth', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/.well-known/agent-card.json');
        expect(checkHttpAuth(req, url, config)).toBeNull();
    });

    test('allows /api/tenants/register without auth', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/api/tenants/register');
        expect(checkHttpAuth(req, url, config)).toBeNull();
    });

    test('rejects request without Authorization header', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/api/agents');
        const resp = checkHttpAuth(req, url, config);
        expect(resp).not.toBeNull();
        expect(resp!.status).toBe(401);
    });

    test('rejects malformed Authorization header', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/api/agents', {
            headers: { Authorization: 'Basic dXNlcjpwYXNz' },
        });
        const resp = checkHttpAuth(req, url, config);
        expect(resp).not.toBeNull();
        expect(resp!.status).toBe(401);
    });

    test('rejects invalid API key', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/api/agents', {
            headers: { Authorization: 'Bearer wrong-key' },
        });
        const resp = checkHttpAuth(req, url, config);
        expect(resp).not.toBeNull();
        expect(resp!.status).toBe(403);
    });

    test('still rejects when audit logging throws', () => {
        // Mock the audit module so recordAudit throws, exercising the catch path
        mock.module('../db/audit', () => ({
            recordAudit: () => { throw new Error('DB connection lost'); },
        }));
        const config = makeConfig();
        const { req, url } = makeRequest('/api/agents', {
            headers: { Authorization: 'Bearer wrong-key' },
        });
        const resp = checkHttpAuth(req, url, config);
        expect(resp).not.toBeNull();
        expect(resp!.status).toBe(403);
        // Restore original module
        mock.module('../db/audit', () => require('../db/audit'));
    });

    test('accepts valid API key', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/api/agents', {
            headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        expect(checkHttpAuth(req, url, config)).toBeNull();
    });

    test('rejects expired but valid key', () => {
        const config = makeConfig({
            apiKeyExpiresAt: Date.now() - 1000, // expired
        });
        const { req, url } = makeRequest('/api/agents', {
            headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        const resp = checkHttpAuth(req, url, config);
        expect(resp).not.toBeNull();
        expect(resp!.status).toBe(401);
    });
});

// ── checkWsAuth ──────────────────────────────────────────────────────

describe('checkWsAuth', () => {
    test('allows when no API key configured', () => {
        const config = makeConfig({ apiKey: null });
        const { req, url } = makeRequest('/ws');
        expect(checkWsAuth(req, url, config)).toBe(true);
    });

    test('accepts valid Bearer header', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/ws', {
            headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        expect(checkWsAuth(req, url, config)).toBe(true);
    });

    test('accepts valid query param (deprecated)', () => {
        const config = makeConfig();
        const url = new URL(`http://localhost:3000/ws?key=${config.apiKey}`);
        const req = new Request(url.toString());
        expect(checkWsAuth(req, url, config)).toBe(true);
    });

    test('rejects invalid auth', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/ws');
        expect(checkWsAuth(req, url, config)).toBe(false);
    });

    test('rejects wrong key', () => {
        const config = makeConfig();
        const { req, url } = makeRequest('/ws', {
            headers: { Authorization: 'Bearer wrong' },
        });
        expect(checkWsAuth(req, url, config)).toBe(false);
    });
});

// ── API Key Rotation ─────────────────────────────────────────────────

describe('rotateApiKey', () => {
    test('generates new key and retains previous', () => {
        const config = makeConfig();
        const originalKey = config.apiKey!;
        const newKey = rotateApiKey(config, 60_000);

        expect(newKey).not.toBe(originalKey);
        expect(config.apiKey).toBe(newKey);
        expect(config.previousApiKey).toBe(originalKey);
        expect(config.previousKeyExpiry).toBeGreaterThan(Date.now());
    });

    test('previous key accepted during grace period', () => {
        const config = makeConfig();
        const originalKey = config.apiKey!;
        rotateApiKey(config, 60_000);

        // Original key should still work during grace period
        const { req, url } = makeRequest('/api/agents', {
            headers: { Authorization: `Bearer ${originalKey}` },
        });
        expect(checkHttpAuth(req, url, config)).toBeNull();
    });

    test('previous key rejected after grace period', () => {
        const config = makeConfig();
        const originalKey = config.apiKey!;
        rotateApiKey(config, 1); // 1ms grace

        // Manually expire
        config.previousKeyExpiry = Date.now() - 1000;

        const { req, url } = makeRequest('/api/agents', {
            headers: { Authorization: `Bearer ${originalKey}` },
        });
        const resp = checkHttpAuth(req, url, config);
        expect(resp).not.toBeNull();
        expect(resp!.status).toBe(403);
    });
});

describe('getApiKeyRotationStatus', () => {
    test('no active key', () => {
        const config = makeConfig({ apiKey: null });
        const status = getApiKeyRotationStatus(config);
        expect(status.hasActiveKey).toBe(false);
        expect(status.isInGracePeriod).toBe(false);
    });

    test('active key, no rotation', () => {
        const config = makeConfig();
        const status = getApiKeyRotationStatus(config);
        expect(status.hasActiveKey).toBe(true);
        expect(status.isInGracePeriod).toBe(false);
        expect(status.gracePeriodExpiry).toBeNull();
    });

    test('during grace period', () => {
        const config = makeConfig();
        rotateApiKey(config, 60_000);
        const status = getApiKeyRotationStatus(config);
        expect(status.isInGracePeriod).toBe(true);
        expect(status.gracePeriodExpiry).toBeTruthy();
    });
});

// ── API Key Expiration ───────────────────────────────────────────────

describe('isApiKeyExpired', () => {
    test('not expired when no expiry set', () => {
        const config = makeConfig();
        expect(isApiKeyExpired(config)).toBe(false);
    });

    test('not expired when expiry is in future', () => {
        const config = makeConfig({ apiKeyExpiresAt: Date.now() + 86_400_000 });
        expect(isApiKeyExpired(config)).toBe(false);
    });

    test('expired when expiry is in past', () => {
        const config = makeConfig({ apiKeyExpiresAt: Date.now() - 1000 });
        expect(isApiKeyExpired(config)).toBe(true);
    });
});

describe('setApiKeyExpiry', () => {
    test('sets createdAt and expiresAt', () => {
        const config = makeConfig();
        setApiKeyExpiry(config, 3600_000);
        expect(config.apiKeyCreatedAt).toBeGreaterThan(0);
        expect(config.apiKeyExpiresAt).toBeGreaterThan(Date.now());
    });
});

describe('getApiKeyExpiryWarning', () => {
    test('null when no expiry', () => {
        const config = makeConfig();
        expect(getApiKeyExpiryWarning(config)).toBeNull();
    });

    test('null when expiry is far in future', () => {
        const config = makeConfig({ apiKeyExpiresAt: Date.now() + 30 * 86_400_000 });
        expect(getApiKeyExpiryWarning(config)).toBeNull();
    });

    test('warns when expiry is within 7 days', () => {
        const config = makeConfig({ apiKeyExpiresAt: Date.now() + 3 * 86_400_000 });
        const warning = getApiKeyExpiryWarning(config);
        expect(warning).toContain('3 days');
    });

    test('null when already expired', () => {
        const config = makeConfig({ apiKeyExpiresAt: Date.now() - 1000 });
        expect(getApiKeyExpiryWarning(config)).toBeNull();
    });
});

// ── CORS ─────────────────────────────────────────────────────────────

describe('buildCorsHeaders', () => {
    test('returns wildcard when no origins configured', () => {
        const config = makeConfig();
        const { req } = makeRequest('/api/agents', {
            headers: { Origin: 'http://example.com' },
        });
        const headers = buildCorsHeaders(req, config);
        expect(headers['Access-Control-Allow-Origin']).toBe('*');
    });

    test('reflects allowed origin', () => {
        const config = makeConfig({ allowedOrigins: ['http://example.com'] });
        const { req } = makeRequest('/api/agents', {
            headers: { Origin: 'http://example.com' },
        });
        const headers = buildCorsHeaders(req, config);
        expect(headers['Access-Control-Allow-Origin']).toBe('http://example.com');
        expect(headers['Vary']).toBe('Origin');
    });

    test('blocks disallowed origin', () => {
        const config = makeConfig({ allowedOrigins: ['http://example.com'] });
        const { req } = makeRequest('/api/agents', {
            headers: { Origin: 'http://evil.com' },
        });
        const headers = buildCorsHeaders(req, config);
        expect(headers['Access-Control-Allow-Origin']).toBe('');
    });

    test('allows same-origin (no Origin header)', () => {
        const config = makeConfig({ allowedOrigins: ['http://example.com'] });
        const { req } = makeRequest('/api/agents');
        const headers = buildCorsHeaders(req, config);
        expect(headers['Access-Control-Allow-Origin']).toBe('*');
    });
});

// ── loadAuthConfig ───────────────────────────────────────────────────

describe('loadAuthConfig', () => {
    let origEnv: Record<string, string | undefined>;

    beforeEach(() => {
        origEnv = {
            API_KEY: process.env.API_KEY,
            BIND_HOST: process.env.BIND_HOST,
            ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
            API_KEY_TTL_DAYS: process.env.API_KEY_TTL_DAYS,
        };
    });

    // Restore env after each test
    function restoreEnv() {
        for (const [k, v] of Object.entries(origEnv)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }

    test('loads with no env vars set', () => {
        delete process.env.API_KEY;
        delete process.env.BIND_HOST;
        delete process.env.ALLOWED_ORIGINS;
        delete process.env.API_KEY_TTL_DAYS;
        const config = loadAuthConfig();
        expect(config.apiKey).toBeNull();
        expect(config.bindHost).toBe('127.0.0.1');
        expect(config.allowedOrigins).toEqual([]);
        restoreEnv();
    });

    test('parses comma-separated origins', () => {
        process.env.ALLOWED_ORIGINS = 'http://a.com, http://b.com';
        delete process.env.API_KEY;
        delete process.env.BIND_HOST;
        delete process.env.API_KEY_TTL_DAYS;
        const config = loadAuthConfig();
        expect(config.allowedOrigins).toEqual(['http://a.com', 'http://b.com']);
        restoreEnv();
    });

    test('sets expiry when API_KEY_TTL_DAYS is set', () => {
        process.env.API_KEY = 'test-key-for-ttl';
        process.env.API_KEY_TTL_DAYS = '30';
        delete process.env.BIND_HOST;
        delete process.env.ALLOWED_ORIGINS;
        const config = loadAuthConfig();
        expect(config.apiKeyExpiresAt).toBeGreaterThan(Date.now());
        restoreEnv();
    });
});
