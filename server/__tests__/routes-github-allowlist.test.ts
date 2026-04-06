import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleGitHubAllowlistRoutes } from '../routes/github-allowlist';

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

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => db.close());

describe('GitHub Allowlist Routes', () => {
    it('GET /api/github-allowlist returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/github-allowlist');
        const res = handleGitHubAllowlistRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('POST /api/github-allowlist rejects missing username', async () => {
        const { req, url } = fakeReq('POST', '/api/github-allowlist', {});
        const res = await handleGitHubAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/github-allowlist adds valid username', async () => {
        const { req, url } = fakeReq('POST', '/api/github-allowlist', {
            username: 'octocat',
            label: 'Core contributor',
        });
        const res = await handleGitHubAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.username).toBe('octocat');
        expect(data.label).toBe('Core contributor');
    });

    it('GET /api/github-allowlist lists added entry', async () => {
        const { req: postReq, url: postUrl } = fakeReq('POST', '/api/github-allowlist', { username: 'octocat' });
        await handleGitHubAllowlistRoutes(postReq, postUrl, db);

        const { req, url } = fakeReq('GET', '/api/github-allowlist');
        const res = handleGitHubAllowlistRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.some((e: { username: string }) => e.username === 'octocat')).toBe(true);
    });

    it('PUT /api/github-allowlist/:username updates label', async () => {
        await handleGitHubAllowlistRoutes(
            ...Object.values(fakeReq('POST', '/api/github-allowlist', { username: 'patchuser' })) as [Request, URL],
            db,
        );

        const { req, url } = fakeReq('PUT', '/api/github-allowlist/patchuser', { label: 'Updated' });
        const res = await handleGitHubAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.label).toBe('Updated');
    });

    it('PUT /api/github-allowlist/:username returns 400 when label missing', async () => {
        const { req, url } = fakeReq('PUT', '/api/github-allowlist/anyone', {});
        const res = await handleGitHubAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('PUT /api/github-allowlist/:username returns 404 for unknown user', async () => {
        const { req, url } = fakeReq('PUT', '/api/github-allowlist/nobody-here', { label: 'x' });
        const res = await handleGitHubAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('DELETE /api/github-allowlist/:username removes entry', async () => {
        await handleGitHubAllowlistRoutes(
            ...Object.values(fakeReq('POST', '/api/github-allowlist', { username: 'delme' })) as [Request, URL],
            db,
        );

        const { req, url } = fakeReq('DELETE', '/api/github-allowlist/delme');
        const res = handleGitHubAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);
    });

    it('DELETE /api/github-allowlist/:username returns 404 for unknown user', async () => {
        const { req, url } = fakeReq('DELETE', '/api/github-allowlist/ghostuser');
        const res = handleGitHubAllowlistRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('username is lowercased internally on DELETE', async () => {
        await handleGitHubAllowlistRoutes(
            ...Object.values(fakeReq('POST', '/api/github-allowlist', { username: 'mixedcase' })) as [Request, URL],
            db,
        );
        const { req, url } = fakeReq('DELETE', '/api/github-allowlist/MixedCase');
        const res = handleGitHubAllowlistRoutes(req, url, db);
        // Route lowercases the param — should find and delete
        expect((res as Response).status).toBe(200);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleGitHubAllowlistRoutes(req, url, db);
        expect(res).toBeNull();
    });
});
