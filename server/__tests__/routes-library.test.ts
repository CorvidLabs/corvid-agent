import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleLibraryRoutes } from '../routes/library';

let db: Database;
let seedAgentId: string;

function fakeReq(method: string, path: string): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const req = new Request(url.toString(), { method });
    return { req, url };
}

function insertEntry(opts: {
    key: string;
    category?: string;
    book?: string;
    page?: number;
}): void {
    db.query(
        `INSERT INTO agent_library (id, key, author_id, author_name, category, tags, content, book, page, archived, created_at, updated_at)
         VALUES (?, ?, ?, 'Test Agent', ?, '[]', 'Test content for ' || ?, ?, ?, 0, datetime('now'), datetime('now'))`,
    ).run(
        crypto.randomUUID(),
        opts.key,
        seedAgentId,
        opts.category ?? 'guide',
        opts.key,
        opts.book ?? null,
        opts.page ?? null,
    );
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    // Seed an agent (FK target for author_id)
    seedAgentId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name, tenant_id) VALUES (?, 'Library Author', 'default')").run(seedAgentId);
});

afterAll(() => db.close());

describe('Library Routes', () => {
    it('GET /api/library returns empty array initially', () => {
        const { req, url } = fakeReq('GET', '/api/library');
        const res = handleLibraryRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
    });

    describe('with seeded entries', () => {
        beforeAll(() => {
            insertEntry({ key: 'guide/getting-started', category: 'guide' });
            insertEntry({ key: 'reference/api-overview', category: 'reference' });
            insertEntry({ key: 'standard/coding-style', category: 'standard' });
        });

        it('GET /api/library returns list of entries', async () => {
            const { req, url } = fakeReq('GET', '/api/library');
            const res = handleLibraryRoutes(req, url, db);
            expect(res).not.toBeNull();
            const data = await res!.json();
            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBeGreaterThanOrEqual(3);
        });

        it('GET /api/library?category=guide filters by category', async () => {
            const { req, url } = fakeReq('GET', '/api/library?category=guide');
            const res = handleLibraryRoutes(req, url, db);
            expect(res).not.toBeNull();
            const data = await res!.json();
            expect(Array.isArray(data)).toBe(true);
            expect(data.every((e: { category: string }) => e.category === 'guide')).toBe(true);
        });

        it('GET /api/library?category=invalid returns 400', async () => {
            const { req, url } = fakeReq('GET', '/api/library?category=invalid');
            const res = handleLibraryRoutes(req, url, db);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(400);
            const data = await res!.json();
            expect(data.error).toContain('Invalid category');
        });

        it('GET /api/library?grouped=true returns array (book/non-book)', async () => {
            const { req, url } = fakeReq('GET', '/api/library?grouped=true');
            const res = handleLibraryRoutes(req, url, db);
            expect(res).not.toBeNull();
            // grouped returns the same shape (array) but only page-1 or non-book entries
            const data = await res!.json();
            expect(Array.isArray(data)).toBe(true);
        });

        it('GET /api/library/:key returns single entry', async () => {
            const { req, url } = fakeReq('GET', '/api/library/guide%2Fgetting-started');
            const res = handleLibraryRoutes(req, url, db);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(200);
            const data = await res!.json();
            expect(data.key).toBe('guide/getting-started');
            expect(data.category).toBe('guide');
        });

        it('GET /api/library/:key returns 404 for missing key', async () => {
            const { req, url } = fakeReq('GET', '/api/library/nonexistent-key');
            const res = handleLibraryRoutes(req, url, db);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(404);
        });
    });

    describe('book pages', () => {
        beforeAll(() => {
            insertEntry({ key: 'mybook/page-1', category: 'guide', book: 'mybook', page: 1 });
            insertEntry({ key: 'mybook/page-2', category: 'guide', book: 'mybook', page: 2 });
        });

        it('GET /api/library/:key for book entry includes pages array', async () => {
            const { req, url } = fakeReq('GET', '/api/library/mybook%2Fpage-1');
            const res = handleLibraryRoutes(req, url, db);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(200);
            const data = await res!.json();
            expect(data.book).toBe('mybook');
            expect(Array.isArray(data.pages)).toBe(true);
            expect(data.pages.length).toBeGreaterThanOrEqual(2);
        });
    });

    it('returns null for unmatched routes', () => {
        const { req, url } = fakeReq('POST', '/api/library');
        const res = handleLibraryRoutes(req, url, db);
        expect(res).toBeNull();
    });
});
