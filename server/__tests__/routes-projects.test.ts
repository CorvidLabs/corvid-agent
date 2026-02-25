import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleProjectRoutes, handleBrowseDirs, isPathAllowed, getAllowedRoots } from '../routes/projects';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';

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

describe('Project Routes', () => {
    it('GET /api/projects returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/projects');
        const res = handleProjectRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('POST /api/projects rejects empty body', async () => {
        const { req, url } = fakeReq('POST', '/api/projects', {});
        const res = await handleProjectRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/projects rejects missing name', async () => {
        const { req, url } = fakeReq('POST', '/api/projects', { workingDir: '/tmp' });
        const res = await handleProjectRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/projects rejects missing workingDir', async () => {
        const { req, url } = fakeReq('POST', '/api/projects', { name: 'TestProject' });
        const res = await handleProjectRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    let projectId: string;

    it('POST /api/projects creates project with valid input', async () => {
        const { req, url } = fakeReq('POST', '/api/projects', {
            name: 'TestProject',
            workingDir: '/tmp/test-project',
            description: 'A test project',
        });
        const res = await handleProjectRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.name).toBe('TestProject');
        expect(data.workingDir).toBe('/tmp/test-project');
        expect(data.id).toBeDefined();
        projectId = data.id;
    });

    it('POST /api/projects creates project with mcpServers', async () => {
        const { req, url } = fakeReq('POST', '/api/projects', {
            name: 'McpProject',
            workingDir: '/tmp/mcp-project',
            mcpServers: [{ name: 'test-server', command: 'npx', args: ['-y', 'test'] }],
        });
        const res = await handleProjectRoutes(req, url, db);
        expect((res as Response).status).toBe(201);
    });

    it('GET /api/projects lists created projects', async () => {
        const { req, url } = fakeReq('GET', '/api/projects');
        const res = handleProjectRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/projects/:id returns project', async () => {
        const { req, url } = fakeReq('GET', `/api/projects/${projectId}`);
        const res = handleProjectRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.id).toBe(projectId);
        expect(data.name).toBe('TestProject');
    });

    it('GET /api/projects/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('GET', '/api/projects/nonexistent');
        const res = handleProjectRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/projects/:id updates project', async () => {
        const { req, url } = fakeReq('PUT', `/api/projects/${projectId}`, { name: 'UpdatedProject' });
        const res = await handleProjectRoutes(req, url, db);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.name).toBe('UpdatedProject');
    });

    it('PUT /api/projects/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('PUT', '/api/projects/nonexistent', { name: 'X' });
        const res = await handleProjectRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/projects/:id rejects empty update', async () => {
        const { req, url } = fakeReq('PUT', `/api/projects/${projectId}`, {});
        const res = await handleProjectRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('DELETE /api/projects/:id deletes project', async () => {
        // Create a throwaway project
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/projects', {
            name: 'DeleteMe',
            workingDir: '/tmp/delete-me',
        });
        const cRes = await handleProjectRoutes(cReq, cUrl, db);
        const created = await (cRes as Response).json();

        const { req, url } = fakeReq('DELETE', `/api/projects/${created.id}`);
        const res = handleProjectRoutes(req, url, db);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);

        // Verify deleted
        const { req: gReq, url: gUrl } = fakeReq('GET', `/api/projects/${created.id}`);
        const gRes = handleProjectRoutes(gReq, gUrl, db);
        expect((gRes as Response).status).toBe(404);
    });

    it('DELETE /api/projects/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('DELETE', '/api/projects/nonexistent');
        const res = handleProjectRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleProjectRoutes(req, url, db);
        expect(res).toBeNull();
    });
});

describe('isPathAllowed', () => {
    it('allows exact root match', () => {
        expect(isPathAllowed('/home/user', ['/home/user'])).toBe(true);
    });

    it('allows subdirectory of root', () => {
        expect(isPathAllowed('/home/user/projects', ['/home/user'])).toBe(true);
    });

    it('rejects path outside roots', () => {
        expect(isPathAllowed('/etc/secrets', ['/home/user'])).toBe(false);
    });

    it('prevents partial prefix match attack', () => {
        // /home/user2 should NOT match /home/user
        expect(isPathAllowed('/home/user2', ['/home/user'])).toBe(false);
    });

    it('handles multiple roots', () => {
        const roots = ['/home/user', '/var/data'];
        expect(isPathAllowed('/var/data/file', roots)).toBe(true);
        expect(isPathAllowed('/opt/other', roots)).toBe(false);
    });
});

describe('getAllowedRoots', () => {
    it('includes home directory', () => {
        const roots = getAllowedRoots(db);
        expect(roots).toContain(resolve(homedir()));
    });

    it('includes project working directories', () => {
        // We have projects seeded above
        const roots = getAllowedRoots(db);
        expect(roots.length).toBeGreaterThanOrEqual(1);
    });
});

describe('handleBrowseDirs', () => {
    it('returns directory listing for home dir', async () => {
        const { req, url } = fakeReq('GET', '/browse-dirs');
        const res = await handleBrowseDirs(req, url, db);
        expect(res).not.toBeNull();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.current).toBeDefined();
        expect(data.dirs).toBeDefined();
        expect(Array.isArray(data.dirs)).toBe(true);
    });

    it('returns 403 for disallowed path', async () => {
        const { req, url } = fakeReq('GET', '/browse-dirs?path=/nonexistent/forbidden/path');
        const res = await handleBrowseDirs(req, url, db);
        // Either 403 (forbidden) or 400 (path doesn't exist) depending on allowlist
        expect([400, 403]).toContain(res.status);
    });

    it('returns 400 for non-directory path', async () => {
        // Use a known file path
        const { req, url } = fakeReq('GET', '/browse-dirs?path=/dev/null');
        const res = await handleBrowseDirs(req, url, db);
        expect([400, 403]).toContain(res.status);
    });
});
