import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleContactRoutes } from '../routes/contacts';
import { createContact, addPlatformLink } from '../db/contacts';
import type { RequestContext } from '../middleware/guards';

let db: Database;

const ctx: RequestContext = {
    authenticated: true,
    tenantId: '',
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

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => db.close());

// ── List ─────────────────────────────────────────────────────────────

describe('GET /api/contacts', () => {
    it('returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res).not.toBeNull();
        const data = await res.json();
        expect(data.contacts).toEqual([]);
        expect(data.total).toBe(0);
    });

    it('returns contacts with pagination', async () => {
        createContact(db, '', 'Alice');
        createContact(db, '', 'Bob');
        createContact(db, '', 'Charlie');

        const { req, url } = fakeReq('GET', '/api/contacts?limit=2&offset=0');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        const data = await res.json();
        expect(data.contacts).toHaveLength(2);
        expect(data.total).toBe(3);
    });

    it('supports search query param', async () => {
        createContact(db, '', 'Alice Smith');
        createContact(db, '', 'Bob Jones');

        const { req, url } = fakeReq('GET', '/api/contacts?search=alice');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        const data = await res.json();
        expect(data.total).toBe(1);
        expect(data.contacts[0].displayName).toBe('Alice Smith');
    });
});

// ── Create ───────────────────────────────────────────────────────────

describe('POST /api/contacts', () => {
    it('creates a contact with display name', async () => {
        const { req, url } = fakeReq('POST', '/api/contacts', { displayName: 'Alice' });
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.displayName).toBe('Alice');
        expect(data.id).toBeTruthy();
    });

    it('creates a contact with notes', async () => {
        const { req, url } = fakeReq('POST', '/api/contacts', {
            displayName: 'Bob',
            notes: 'Some notes',
        });
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.notes).toBe('Some notes');
    });

    it('rejects empty body', async () => {
        const { req, url } = fakeReq('POST', '/api/contacts', {});
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(400);
    });

    it('rejects missing displayName', async () => {
        const { req, url } = fakeReq('POST', '/api/contacts', { notes: 'orphan' });
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(400);
    });
});

// ── Get by ID ────────────────────────────────────────────────────────

describe('GET /api/contacts/:id', () => {
    it('returns contact by id', async () => {
        const contact = createContact(db, '', 'Alice');
        const { req, url } = fakeReq('GET', `/api/contacts/${contact.id}`);
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.displayName).toBe('Alice');
    });

    it('returns 404 for missing contact', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts/nonexistent');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(404);
    });
});

// ── Update ───────────────────────────────────────────────────────────

describe('PUT /api/contacts/:id', () => {
    it('updates display name', async () => {
        const contact = createContact(db, '', 'Alice');
        const { req, url } = fakeReq('PUT', `/api/contacts/${contact.id}`, {
            displayName: 'Alice Updated',
        });
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.displayName).toBe('Alice Updated');
    });

    it('updates notes', async () => {
        const contact = createContact(db, '', 'Alice');
        const { req, url } = fakeReq('PUT', `/api/contacts/${contact.id}`, {
            notes: 'new notes',
        });
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.notes).toBe('new notes');
    });

    it('can set notes to null', async () => {
        const contact = createContact(db, '', 'Alice', 'has notes');
        const { req, url } = fakeReq('PUT', `/api/contacts/${contact.id}`, {
            notes: null,
        });
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.notes).toBeNull();
    });

    it('returns 404 for missing contact', async () => {
        const { req, url } = fakeReq('PUT', '/api/contacts/nonexistent', {
            displayName: 'x',
        });
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(404);
    });
});

// ── Delete ───────────────────────────────────────────────────────────

describe('DELETE /api/contacts/:id', () => {
    it('deletes contact and returns ok', async () => {
        const contact = createContact(db, '', 'Alice');
        const { req, url } = fakeReq('DELETE', `/api/contacts/${contact.id}`);
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });

    it('returns 404 for missing contact', async () => {
        const { req, url } = fakeReq('DELETE', '/api/contacts/nonexistent');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(404);
    });
});

// ── Lookup ───────────────────────────────────────────────────────────

describe('GET /api/contacts/lookup', () => {
    it('looks up by name', async () => {
        createContact(db, '', 'Alice');
        const { req, url } = fakeReq('GET', '/api/contacts/lookup?name=Alice');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.displayName).toBe('Alice');
    });

    it('returns 404 when name not found', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts/lookup?name=Nobody');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(404);
    });

    it('looks up by platform + platform_id', async () => {
        const contact = createContact(db, '', 'Alice');
        addPlatformLink(db, '', contact.id, 'discord', '123456');

        const { req, url } = fakeReq('GET', '/api/contacts/lookup?platform=discord&platform_id=123456');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.displayName).toBe('Alice');
    });

    it('returns 404 when platform id not found', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts/lookup?platform=discord&platform_id=unknown');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(404);
    });

    it('returns 400 for invalid platform', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts/lookup?platform=telegram&platform_id=123');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(400);
    });

    it('returns 400 when no params provided', async () => {
        const { req, url } = fakeReq('GET', '/api/contacts/lookup');
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(400);
    });
});

// ── Platform Links ───────────────────────────────────────────────────

describe('POST /api/contacts/:id/links', () => {
    it('adds a platform link', async () => {
        const contact = createContact(db, '', 'Alice');
        const { req, url } = fakeReq('POST', `/api/contacts/${contact.id}/links`, {
            platform: 'discord',
            platformId: '12345',
        });
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.platform).toBe('discord');
        expect(data.platformId).toBe('12345');
    });

    it('returns 404 for missing contact', async () => {
        const { req, url } = fakeReq('POST', '/api/contacts/nonexistent/links', {
            platform: 'discord',
            platformId: '12345',
        });
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(404);
    });

    it('rejects invalid body', async () => {
        const contact = createContact(db, '', 'Alice');
        const { req, url } = fakeReq('POST', `/api/contacts/${contact.id}/links`, {});
        const res = await handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(400);
    });
});

describe('DELETE /api/contacts/:id/links/:linkId', () => {
    it('removes a platform link', async () => {
        const contact = createContact(db, '', 'Alice');
        const link = addPlatformLink(db, '', contact.id, 'github', 'alice');
        const { req, url } = fakeReq('DELETE', `/api/contacts/${contact.id}/links/${link.id}`);
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });

    it('returns 404 for missing link', async () => {
        const contact = createContact(db, '', 'Alice');
        const { req, url } = fakeReq('DELETE', `/api/contacts/${contact.id}/links/nonexistent`);
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(404);
    });
});

describe('PUT /api/contacts/:id/links/:linkId/verify', () => {
    it('verifies a platform link', async () => {
        const contact = createContact(db, '', 'Alice');
        const link = addPlatformLink(db, '', contact.id, 'github', 'alice');
        const { req, url } = fakeReq('PUT', `/api/contacts/${contact.id}/links/${link.id}/verify`);
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });

    it('returns 404 for missing link', async () => {
        const contact = createContact(db, '', 'Alice');
        const { req, url } = fakeReq('PUT', `/api/contacts/${contact.id}/links/nonexistent/verify`);
        const res = handleContactRoutes(req, url, db, ctx) as Response;
        expect(res.status).toBe(404);
    });
});

// ── Unmatched paths ──────────────────────────────────────────────────

describe('unmatched paths', () => {
    it('returns null for unrelated paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleContactRoutes(req, url, db, ctx);
        expect(res).toBeNull();
    });
});
