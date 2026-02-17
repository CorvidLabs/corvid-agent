import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleSandboxRoutes } from '../routes/sandbox';
import { DEFAULT_RESOURCE_LIMITS } from '../sandbox/types';

let db: Database;
let agentId: string;

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

    // Seed an agent for FK in sandbox_configs
    agentId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Sandbox Agent')").run(agentId);
});

afterAll(() => db.close());

describe('Sandbox Routes', () => {
    // ─── Stats ───────────────────────────────────────────────────────────────

    it('GET /api/sandbox/stats returns disabled stats when no sandbox manager', async () => {
        const { req, url } = fakeReq('GET', '/api/sandbox/stats');
        const res = await handleSandboxRoutes(req, url, db, undefined)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.enabled).toBe(false);
        expect(data.total).toBe(0);
        expect(data.warm).toBe(0);
        expect(data.assigned).toBe(0);
    });

    // ─── Policies CRUD ──────────────────────────────────────────────────────

    it('GET /api/sandbox/policies returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/sandbox/policies');
        const res = await handleSandboxRoutes(req, url, db)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('GET /api/sandbox/policies/:id returns defaults for unconfigured agent', async () => {
        const { req, url } = fakeReq('GET', `/api/sandbox/policies/${agentId}`);
        const res = await handleSandboxRoutes(req, url, db)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.cpuLimit).toBe(DEFAULT_RESOURCE_LIMITS.cpuLimit);
        expect(data.memoryLimitMb).toBe(DEFAULT_RESOURCE_LIMITS.memoryLimitMb);
        expect(data.networkPolicy).toBe(DEFAULT_RESOURCE_LIMITS.networkPolicy);
        expect(data.timeoutSeconds).toBe(DEFAULT_RESOURCE_LIMITS.timeoutSeconds);
    });

    it('PUT /api/sandbox/policies/:id creates custom policy', async () => {
        const { req, url } = fakeReq('PUT', `/api/sandbox/policies/${agentId}`, {
            cpuLimit: 2.0,
            memoryLimitMb: 1024,
            networkPolicy: 'none',
            timeoutSeconds: 300,
        });
        const res = await handleSandboxRoutes(req, url, db)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.cpuLimit).toBe(2.0);
        expect(data.memoryLimitMb).toBe(1024);
        expect(data.networkPolicy).toBe('none');
        expect(data.timeoutSeconds).toBe(300);
    });

    it('GET /api/sandbox/policies lists created policies', async () => {
        const { req, url } = fakeReq('GET', '/api/sandbox/policies');
        const res = await handleSandboxRoutes(req, url, db)!;
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(1);
        expect(data[0].agent_id).toBe(agentId);
        expect(data[0].cpu_limit).toBe(2.0);
    });

    it('PUT /api/sandbox/policies/:id updates existing policy', async () => {
        const { req, url } = fakeReq('PUT', `/api/sandbox/policies/${agentId}`, {
            memoryLimitMb: 2048,
        });
        const res = await handleSandboxRoutes(req, url, db)!;
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.memoryLimitMb).toBe(2048);
    });

    it('DELETE /api/sandbox/policies/:id removes policy', async () => {
        const { req, url } = fakeReq('DELETE', `/api/sandbox/policies/${agentId}`);
        const res = await handleSandboxRoutes(req, url, db)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);

        // Verify it falls back to defaults
        const { req: gReq, url: gUrl } = fakeReq('GET', `/api/sandbox/policies/${agentId}`);
        const gRes = await handleSandboxRoutes(gReq, gUrl, db)!;
        const defaults = await gRes!.json();
        expect(defaults.cpuLimit).toBe(DEFAULT_RESOURCE_LIMITS.cpuLimit);
    });

    it('DELETE /api/sandbox/policies/:id returns 404 for nonexistent', async () => {
        const { req, url } = fakeReq('DELETE', '/api/sandbox/policies/nonexistent-agent');
        const res = await handleSandboxRoutes(req, url, db)!;
        expect(res!.status).toBe(404);
    });
});
