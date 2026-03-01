import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleSettingsRoutes } from '../routes/settings';
import type { RequestContext } from '../middleware/guards';
import type { AuthConfig } from '../middleware/auth';

let db: Database;

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

function adminContext(): RequestContext {
    return { authenticated: true, role: 'admin', tenantId: 'default' };
}

function userContext(): RequestContext {
    return { authenticated: true, role: 'user', tenantId: 'default' };
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterAll(() => db.close());

describe('Settings Routes', () => {
    it('GET /api/settings returns creditConfig and system stats for admin', async () => {
        const { req, url } = fakeReq('GET', '/api/settings');
        const res = handleSettingsRoutes(req, url, db, adminContext());
        expect(res).not.toBeNull();
        const resolved = await Promise.resolve(res!);
        expect(resolved.status).toBe(200);
        const data = await resolved.json();
        expect(data.creditConfig).toBeDefined();
        expect(data.creditConfig.credits_per_algo).toBe('1000');
        expect(data.system).toBeDefined();
        expect(typeof data.system.schemaVersion).toBe('number');
        expect(typeof data.system.agentCount).toBe('number');
        expect(typeof data.system.projectCount).toBe('number');
        expect(typeof data.system.sessionCount).toBe('number');
    });

    it('GET /api/settings omits system metadata for non-admin users', async () => {
        const { req, url } = fakeReq('GET', '/api/settings');
        const res = handleSettingsRoutes(req, url, db, userContext());
        expect(res).not.toBeNull();
        const resolved = await Promise.resolve(res!);
        expect(resolved.status).toBe(200);
        const data = await resolved.json();
        expect(data.creditConfig).toBeDefined();
        expect(data.creditConfig.credits_per_algo).toBeDefined();
        expect(data.system).toBeUndefined();
    });

    it('PUT /api/settings/credits updates credit config keys', async () => {
        const { req, url } = fakeReq('PUT', '/api/settings/credits', {
            credits_per_algo: '2000',
            low_credit_threshold: '100',
        });
        const res = await handleSettingsRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
        expect(data.updated).toBe(2);

        // Verify persisted
        const { req: gReq, url: gUrl } = fakeReq('GET', '/api/settings');
        const gRes = await Promise.resolve(handleSettingsRoutes(gReq, gUrl, db, adminContext())!);
        const settings = await gRes.json();
        expect(settings.creditConfig.credits_per_algo).toBe('2000');
        expect(settings.creditConfig.low_credit_threshold).toBe('100');
    });

    it('PUT /api/settings/credits rejects unknown keys', async () => {
        const { req, url } = fakeReq('PUT', '/api/settings/credits', {
            unknown_key: 'value',
        });
        const res = await handleSettingsRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('Unrecognized key');
    });

    it('PUT /api/settings/credits rejects empty body', async () => {
        const { req, url } = fakeReq('PUT', '/api/settings/credits', {});
        const res = await handleSettingsRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('At least one config key is required');
    });

    it('returns null for unmatched paths', async () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleSettingsRoutes(req, url, db);
        expect(res).toBeNull();
    });
});

describe('API Key Rotation Endpoint', () => {
    it('POST /api/settings/api-key/rotate rotates the key', async () => {
        const authConfig: AuthConfig = {
            apiKey: 'original-key-for-rotation',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
        };

        const { req, url } = fakeReq('POST', '/api/settings/api-key/rotate', {});
        const res = await handleSettingsRoutes(req, url, db, adminContext(), authConfig);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
        expect(data.apiKey).toBeTruthy();
        expect(data.apiKey).not.toBe('original-key-for-rotation');
        expect(authConfig.apiKey).toBe(data.apiKey);
        expect(authConfig.previousApiKey).toBe('original-key-for-rotation');
    });

    it('POST /api/settings/api-key/rotate with ttlDays sets expiry', async () => {
        const authConfig: AuthConfig = {
            apiKey: 'key-to-rotate-with-ttl',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
        };

        const { req, url } = fakeReq('POST', '/api/settings/api-key/rotate', { ttlDays: 30 });
        const res = await handleSettingsRoutes(req, url, db, adminContext(), authConfig);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
        expect(data.expiresAt).toBeTruthy();
        expect(authConfig.apiKeyExpiresAt).toBeGreaterThan(Date.now());
    });

    it('POST /api/settings/api-key/rotate returns 400 when no API key configured', async () => {
        const authConfig: AuthConfig = {
            apiKey: null,
            allowedOrigins: [],
            bindHost: '127.0.0.1',
        };

        const { req, url } = fakeReq('POST', '/api/settings/api-key/rotate', {});
        const res = await handleSettingsRoutes(req, url, db, adminContext(), authConfig);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/settings/api-key/rotate returns 503 when authConfig is null', async () => {
        const { req, url } = fakeReq('POST', '/api/settings/api-key/rotate', {});
        const res = await handleSettingsRoutes(req, url, db, adminContext(), null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
    });
});

describe('API Key Status Endpoint', () => {
    it('GET /api/settings/api-key/status returns status with no expiry', async () => {
        const authConfig: AuthConfig = {
            apiKey: 'test-status-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
        };

        const { req, url } = fakeReq('GET', '/api/settings/api-key/status');
        const res = handleSettingsRoutes(req, url, db, adminContext(), authConfig);
        expect(res).not.toBeNull();
        const resolved = await Promise.resolve(res!);
        expect(resolved.status).toBe(200);
        const data = await resolved.json();
        expect(data.hasActiveKey).toBe(true);
        expect(data.expired).toBe(false);
        expect(data.expiresAt).toBeNull();
        expect(data.warning).toBeNull();
    });

    it('GET /api/settings/api-key/status returns warning when key expiring soon', async () => {
        const authConfig: AuthConfig = {
            apiKey: 'test-expiring-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            apiKeyExpiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 days
        };

        const { req, url } = fakeReq('GET', '/api/settings/api-key/status');
        const res = handleSettingsRoutes(req, url, db, adminContext(), authConfig);
        expect(res).not.toBeNull();
        const resolved = await Promise.resolve(res!);
        expect(resolved.status).toBe(200);
        const data = await resolved.json();
        expect(data.expired).toBe(false);
        expect(data.warning).toContain('3 days');
    });

    it('GET /api/settings/api-key/status returns expired status', async () => {
        const authConfig: AuthConfig = {
            apiKey: 'test-expired-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            apiKeyExpiresAt: Date.now() - 1000,
        };

        const { req, url } = fakeReq('GET', '/api/settings/api-key/status');
        const res = handleSettingsRoutes(req, url, db, adminContext(), authConfig);
        expect(res).not.toBeNull();
        const resolved = await Promise.resolve(res!);
        expect(resolved.status).toBe(200);
        const data = await resolved.json();
        expect(data.expired).toBe(true);
    });

    it('GET /api/settings/api-key/status returns 503 when authConfig null', async () => {
        const { req, url } = fakeReq('GET', '/api/settings/api-key/status');
        const res = handleSettingsRoutes(req, url, db, adminContext(), null);
        expect(res).not.toBeNull();
        const resolved = await Promise.resolve(res!);
        expect(resolved.status).toBe(503);
    });
});
