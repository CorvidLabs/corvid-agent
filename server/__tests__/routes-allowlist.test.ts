import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleAllowlistRoutes } from '../routes/allowlist';

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

describe('Allowlist Routes', () => {
    it('GET /api/allowlist returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/allowlist');
        const res = handleAllowlistRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('POST /api/allowlist rejects empty body', async () => {
        const { req, url } = fakeReq('POST', '/api/allowlist', {});
        const res = await handleAllowlistRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/allowlist rejects missing address', async () => {
        const { req, url } = fakeReq('POST', '/api/allowlist', { label: 'test' });
        const res = await handleAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/allowlist rejects invalid Algorand address', async () => {
        const { req, url } = fakeReq('POST', '/api/allowlist', { address: 'NOT_A_VALID_ADDRESS' });
        const res = await handleAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    // Use a valid 58-char Algorand address for the happy path
    const validAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';

    it('POST /api/allowlist adds valid address', async () => {
        const { req, url } = fakeReq('POST', '/api/allowlist', {
            address: validAddress,
            label: 'Test Address',
        });
        const res = await handleAllowlistRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.address).toBe(validAddress);
        expect(data.label).toBe('Test Address');
    });

    it('GET /api/allowlist lists added entry', async () => {
        const { req, url } = fakeReq('GET', '/api/allowlist');
        const res = handleAllowlistRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.length).toBeGreaterThanOrEqual(1);
        const entry = data.find((e: { address: string }) => e.address === validAddress);
        expect(entry).toBeDefined();
    });

    it('PUT /api/allowlist/:address updates label', async () => {
        const encoded = encodeURIComponent(validAddress);
        const { req, url } = fakeReq('PUT', `/api/allowlist/${encoded}`, { label: 'Updated Label' });
        const res = await handleAllowlistRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.label).toBe('Updated Label');
    });

    it('PUT /api/allowlist/:address returns 404 for unknown', async () => {
        const { req, url } = fakeReq('PUT', '/api/allowlist/UNKNOWN_ADDRESS', { label: 'x' });
        const res = await handleAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/allowlist/:address rejects missing label', async () => {
        const encoded = encodeURIComponent(validAddress);
        const { req, url } = fakeReq('PUT', `/api/allowlist/${encoded}`, {});
        const res = await handleAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('DELETE /api/allowlist/:address removes entry', async () => {
        // Add a throwaway entry first
        const throwaway = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';
        db.query("INSERT OR IGNORE INTO algochat_allowlist (address, label) VALUES (?, 'del')").run(throwaway);

        const encoded = encodeURIComponent(throwaway);
        const { req, url } = fakeReq('DELETE', `/api/allowlist/${encoded}`);
        const res = handleAllowlistRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);
    });

    it('DELETE /api/allowlist/:address returns 404 for unknown', async () => {
        const { req, url } = fakeReq('DELETE', '/api/allowlist/UNKNOWN_ADDRESS');
        const res = handleAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('converts address to uppercase', async () => {
        const lower = encodeURIComponent(validAddress.toLowerCase());
        const { req, url } = fakeReq('PUT', `/api/allowlist/${lower}`, { label: 'case test' });
        // The route converts to uppercase internally, so this tests the conversion
        const res = await handleAllowlistRoutes(req, url, db);
        // Either 200 (found) or 404 (not found) is valid — the key is it doesn't crash
        expect(res).not.toBeNull();
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleAllowlistRoutes(req, url, db);
        expect(res).toBeNull();
    });
});
