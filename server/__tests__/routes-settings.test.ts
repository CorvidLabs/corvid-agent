import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleSettingsRoutes } from '../routes/settings';

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

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterAll(() => db.close());

describe('Settings Routes', () => {
    it('GET /api/settings returns creditConfig and system stats', async () => {
        const { req, url } = fakeReq('GET', '/api/settings');
        const res = handleSettingsRoutes(req, url, db);
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
        const gRes = await Promise.resolve(handleSettingsRoutes(gReq, gUrl, db)!);
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
