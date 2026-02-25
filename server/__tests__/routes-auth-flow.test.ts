import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleAuthFlowRoutes } from '../routes/auth-flow';

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

describe('Auth Flow Routes', () => {
    let deviceCode: string;
    let userCode: string;

    it('POST /api/auth/device creates a device auth code', async () => {
        const { req, url } = fakeReq('POST', '/api/auth/device');
        const res = await Promise.resolve(handleAuthFlowRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.deviceCode).toBeDefined();
        expect(data.userCode).toBeDefined();
        expect(typeof data.userCode).toBe('string');
        expect(data.userCode.length).toBe(8);
        expect(data.verificationUrl).toContain('/api/auth/verify');
        expect(data.expiresIn).toBe(600);
        expect(data.interval).toBe(2);

        deviceCode = data.deviceCode;
        userCode = data.userCode;
    });

    it('POST /api/auth/device/token returns pending while not authorized', async () => {
        const { req, url } = fakeReq('POST', '/api/auth/device/token', { deviceCode });
        const res = await Promise.resolve(handleAuthFlowRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toBe('authorization_pending');
    });

    it('POST /api/auth/device/token rejects missing deviceCode', async () => {
        const { req, url } = fakeReq('POST', '/api/auth/device/token', {});
        const res = await Promise.resolve(handleAuthFlowRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/auth/device/token rejects unknown deviceCode', async () => {
        const { req, url } = fakeReq('POST', '/api/auth/device/token', { deviceCode: 'nonexistent' });
        const res = await Promise.resolve(handleAuthFlowRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toBe('expired');
    });

    it('POST /api/auth/device/authorize authorizes a device code', async () => {
        const { req, url } = fakeReq('POST', '/api/auth/device/authorize', {
            userCode,
            tenantId: 'test-tenant',
            email: 'test@example.com',
            approve: true,
        });
        const res = await Promise.resolve(handleAuthFlowRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
        expect(data.status).toBe('authorized');
    });

    it('POST /api/auth/device/token returns token after authorization', async () => {
        const { req, url } = fakeReq('POST', '/api/auth/device/token', { deviceCode });
        const res = await Promise.resolve(handleAuthFlowRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.accessToken).toBeDefined();
        expect(data.accessToken.startsWith('ca_')).toBe(true);
        expect(data.tenantId).toBe('test-tenant');
        expect(data.email).toBe('test@example.com');
    });

    it('GET /api/auth/verify returns HTML page', async () => {
        const { req, url } = fakeReq('GET', '/api/auth/verify?code=ABCD1234');
        const res = await Promise.resolve(handleAuthFlowRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        expect(res!.headers.get('Content-Type')).toBe('text/html');
        const html = await res!.text();
        expect(html).toContain('ABCD1234');
        expect(html).toContain('Device Authorization');
    });

    it('returns null for unmatched paths', async () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleAuthFlowRoutes(req, url, db);
        expect(res).toBeNull();
    });
});
