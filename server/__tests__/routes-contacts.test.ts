import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleContactRoutes } from '../routes/contacts';
import type { RequestContext } from '../middleware/guards';

let db: Database;
const ctx: RequestContext = {
    tenantId: 'default',
    authenticated: true,
    tenantRole: 'owner',
};

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

describe('Contact Routes', () => {
    it('GET /api/contacts returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts');
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data.contacts)).toBe(true);
        expect(data.total).toBe(0);
    });

    let contactId: string;

    it('POST /api/contacts creates a contact', async () => {
        const { req, url } = fakeReq('POST', '/api/contacts', { displayName: 'Alice' });
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.displayName).toBe('Alice');
        expect(data.id).toBeDefined();
        contactId = data.id;
    });

    it('GET /api/contacts/:id returns the contact', async () => {
        const { req, url } = fakeReq('GET', `/api/contacts/${contactId}`);
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.id).toBe(contactId);
        expect(data.displayName).toBe('Alice');
    });

    it('GET /api/contacts/:id returns 404 for missing contact', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts/nonexistent-id');
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res!.status).toBe(404);
    });

    it('PUT /api/contacts/:id updates display name', async () => {
        const { req, url } = fakeReq('PUT', `/api/contacts/${contactId}`, { displayName: 'Alice Updated' });
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.displayName).toBe('Alice Updated');
    });

    it('GET /api/contacts?search=Alice finds by name', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts?search=Alice');
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.contacts.length).toBeGreaterThanOrEqual(1);
        expect(data.contacts[0].displayName).toContain('Alice');
    });

    it('GET /api/contacts respects limit param', async () => {
        // Seed extra contacts
        const ids: string[] = [];
        for (let i = 0; i < 5; i++) {
            const { req, url } = fakeReq('POST', '/api/contacts', { displayName: `PaginationTest${i}` });
            const res = await handleContactRoutes(req, url, db, ctx);
            const data = await res!.json();
            ids.push(data.id);
        }
        const { req, url } = fakeReq('GET', '/api/contacts?limit=2');
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.contacts.length).toBeLessThanOrEqual(2);
        expect(typeof data.total).toBe('number');
        // Cleanup
        for (const id of ids) {
            await handleContactRoutes(fakeReq('DELETE', `/api/contacts/${id}`).req, fakeReq('DELETE', `/api/contacts/${id}`).url, db, ctx);
        }
    });

    it('GET /api/contacts respects offset param', async () => {
        // Seed 3 contacts to ensure there are enough
        const ids: string[] = [];
        for (let i = 0; i < 3; i++) {
            const { req, url } = fakeReq('POST', '/api/contacts', { displayName: `OffsetTest${i}` });
            const res = await handleContactRoutes(req, url, db, ctx);
            const data = await res!.json();
            ids.push(data.id);
        }
        const first = await (await handleContactRoutes(fakeReq('GET', '/api/contacts?limit=1').req, fakeReq('GET', '/api/contacts?limit=1').url, db, ctx))!.json();
        const offset1 = await (await handleContactRoutes(fakeReq('GET', '/api/contacts?limit=1&offset=1').req, fakeReq('GET', '/api/contacts?limit=1&offset=1').url, db, ctx))!.json();
        // Different pages should return different contacts (when there's more than 1)
        if (first.total > 1) {
            expect(first.contacts[0].id).not.toBe(offset1.contacts[0].id);
        }
        // Cleanup
        for (const id of ids) {
            await handleContactRoutes(fakeReq('DELETE', `/api/contacts/${id}`).req, fakeReq('DELETE', `/api/contacts/${id}`).url, db, ctx);
        }
    });

    it('GET /api/contacts/lookup?name=Alice Updated finds by exact name', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts/lookup?name=Alice%20Updated');
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.id).toBe(contactId);
    });

    it('GET /api/contacts/lookup with no params returns 400', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts/lookup');
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res!.status).toBe(400);
    });

    it('POST /api/contacts with empty displayName returns 400', async () => {
        const { req, url } = fakeReq('POST', '/api/contacts', { displayName: '' });
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res!.status).toBe(400);
    });

    describe('platform links', () => {
        let linkId: string;

        it('POST /api/contacts/:id/links adds a platform link', async () => {
            const { req, url } = fakeReq('POST', `/api/contacts/${contactId}/links`, {
                platform: 'discord',
                platformId: '123456789',
            });
            const res = await handleContactRoutes(req, url, db, ctx);
            expect(res!.status).toBe(201);
            const data = await res!.json();
            expect(data.platform).toBe('discord');
            expect(data.platformId).toBe('123456789');
            expect(data.id).toBeDefined();
            linkId = data.id;
        });

        it('GET /api/contacts/:id reflects the platform link', async () => {
            const { req, url } = fakeReq('GET', `/api/contacts/${contactId}`);
            const res = await handleContactRoutes(req, url, db, ctx);
            const data = await res!.json();
            expect(Array.isArray(data.links)).toBe(true);
            expect(data.links.length).toBeGreaterThanOrEqual(1);
        });

        it('GET /api/contacts/lookup by platform+platformId finds the contact', async () => {
            const { req, url } = fakeReq('GET', '/api/contacts/lookup?platform=discord&platform_id=123456789');
            const res = await handleContactRoutes(req, url, db, ctx);
            expect(res!.status).toBe(200);
            const data = await res!.json();
            expect(data.id).toBe(contactId);
        });

        it('PUT /api/contacts/:id/links/:linkId/verify marks link as verified', async () => {
            const { req, url } = fakeReq('PUT', `/api/contacts/${contactId}/links/${linkId}/verify`);
            const res = await handleContactRoutes(req, url, db, ctx);
            expect(res!.status).toBe(200);
            const data = await res!.json();
            expect(data.ok).toBe(true);
        });

        it('POST /api/contacts/:id/links with invalid platform returns 400', async () => {
            const { req, url } = fakeReq('POST', `/api/contacts/${contactId}/links`, {
                platform: 'slack',
                platformId: '999',
            });
            const res = await handleContactRoutes(req, url, db, ctx);
            expect(res!.status).toBe(400);
        });

        it('POST /api/contacts/nonexistent/links returns 404', async () => {
            const { req, url } = fakeReq('POST', '/api/contacts/nonexistent/links', {
                platform: 'discord',
                platformId: '999',
            });
            const res = await handleContactRoutes(req, url, db, ctx);
            expect(res!.status).toBe(404);
        });

        it('DELETE /api/contacts/:id/links/:linkId removes the link', async () => {
            const { req, url } = fakeReq('DELETE', `/api/contacts/${contactId}/links/${linkId}`);
            const res = await handleContactRoutes(req, url, db, ctx);
            expect(res!.status).toBe(200);
            const data = await res!.json();
            expect(data.ok).toBe(true);
        });

        it('DELETE /api/contacts/:id/links/:linkId for missing link returns 404', async () => {
            const { req, url } = fakeReq('DELETE', `/api/contacts/${contactId}/links/nonexistent-link`);
            const res = await handleContactRoutes(req, url, db, ctx);
            expect(res!.status).toBe(404);
        });
    });

    it('DELETE /api/contacts/:id removes the contact', async () => {
        const { req, url } = fakeReq('DELETE', `/api/contacts/${contactId}`);
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
    });

    it('GET /api/contacts/:id returns 404 after deletion', async () => {
        const { req, url } = fakeReq('GET', `/api/contacts/${contactId}`);
        const res = await handleContactRoutes(req, url, db, ctx);
        expect(res!.status).toBe(404);
    });

    it('returns null for unmatched routes', () => {
        const { req, url } = fakeReq('PATCH', '/api/contacts/something');
        const res = handleContactRoutes(req, url, db, ctx);
        expect(res).toBeNull();
    });
});
