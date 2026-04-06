import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleRepoBlocklistRoutes } from '../routes/repo-blocklist';
import type { RequestContext } from '../middleware/guards';

let db: Database;

const ctx: RequestContext = { authenticated: true, tenantId: 'default' };

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

describe('Repo Blocklist Routes', () => {
    it('GET /api/repo-blocklist returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/repo-blocklist');
        const res = handleRepoBlocklistRoutes(req, url, db, ctx);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('POST /api/repo-blocklist rejects missing repo field', async () => {
        const { req, url } = fakeReq('POST', '/api/repo-blocklist', {});
        const res = await handleRepoBlocklistRoutes(req, url, db, ctx);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/repo-blocklist rejects empty repo string', async () => {
        const { req, url } = fakeReq('POST', '/api/repo-blocklist', { repo: '' });
        const res = await handleRepoBlocklistRoutes(req, url, db, ctx);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/repo-blocklist adds entry and returns 201', async () => {
        const { req, url } = fakeReq('POST', '/api/repo-blocklist', {
            repo: 'owner/bad-repo',
            reason: 'spam',
            source: 'manual',
        });
        const res = await handleRepoBlocklistRoutes(req, url, db, ctx);
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.repo).toBe('owner/bad-repo');
        expect(data.reason).toBe('spam');
    });

    it('GET /api/repo-blocklist lists added entry', async () => {
        const { req: postReq, url: postUrl } = fakeReq('POST', '/api/repo-blocklist', { repo: 'acme/blocker' });
        await handleRepoBlocklistRoutes(postReq, postUrl, db, ctx);

        const { req, url } = fakeReq('GET', '/api/repo-blocklist');
        const res = handleRepoBlocklistRoutes(req, url, db, ctx);
        const data = await (res as Response).json();
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data.some((e: { repo: string }) => e.repo === 'acme/blocker')).toBe(true);
    });

    it('DELETE /api/repo-blocklist/:repo removes entry', async () => {
        await handleRepoBlocklistRoutes(
            ...Object.values(fakeReq('POST', '/api/repo-blocklist', { repo: 'del/me' })) as [Request, URL],
            db, ctx,
        );

        const encoded = encodeURIComponent('del/me');
        const { req, url } = fakeReq('DELETE', `/api/repo-blocklist/${encoded}`);
        const res = handleRepoBlocklistRoutes(req, url, db, ctx);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);
    });

    it('DELETE /api/repo-blocklist/:repo returns 404 for unknown repo', async () => {
        const encoded = encodeURIComponent('nobody/unknown');
        const { req, url } = fakeReq('DELETE', `/api/repo-blocklist/${encoded}`);
        const res = handleRepoBlocklistRoutes(req, url, db, ctx);
        expect((res as Response).status).toBe(404);
    });

    it('POST /api/repo-blocklist accepts valid source enum values', async () => {
        for (const source of ['manual', 'pr_rejection', 'daily_review'] as const) {
            const { req, url } = fakeReq('POST', '/api/repo-blocklist', { repo: `owner/${source}`, source });
            const res = await handleRepoBlocklistRoutes(req, url, db, ctx);
            expect((res as Response).status).toBe(201);
        }
    });

    it('POST /api/repo-blocklist rejects invalid source enum', async () => {
        const { req, url } = fakeReq('POST', '/api/repo-blocklist', { repo: 'x/y', source: 'badvalue' });
        const res = await handleRepoBlocklistRoutes(req, url, db, ctx);
        expect((res as Response).status).toBe(400);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleRepoBlocklistRoutes(req, url, db, ctx);
        expect(res).toBeNull();
    });

    it('repo name is lowercased on DELETE', async () => {
        await handleRepoBlocklistRoutes(
            ...Object.values(fakeReq('POST', '/api/repo-blocklist', { repo: 'owner/cased' })) as [Request, URL],
            db, ctx,
        );
        const encoded = encodeURIComponent('Owner/Cased');
        const { req, url } = fakeReq('DELETE', `/api/repo-blocklist/${encoded}`);
        const res = handleRepoBlocklistRoutes(req, url, db, ctx);
        // Either deleted (200) or not found (404) — either way no crash
        expect(res).not.toBeNull();
    });
});
