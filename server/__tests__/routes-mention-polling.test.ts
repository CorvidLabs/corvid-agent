import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleMentionPollingRoutes } from '../routes/mention-polling';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';

// --- Helpers ----------------------------------------------------------------

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

/** Valid input matching CreateMentionPollingSchema */
function validCreateBody(agentId: string, projectId: string, repo = 'owner/test-repo') {
    return {
        agentId,
        repo,
        mentionUsername: 'corvid-agent',
        intervalSeconds: 60,
        projectId,
    };
}

function createMockPollingService() {
    return {
        getStats: mock(() => ({
            isRunning: true,
            activeConfigs: 2,
            totalConfigs: 3,
            totalTriggers: 15,
        })),
    } as any;
}

// --- Tests ------------------------------------------------------------------

describe('routes/mention-polling', () => {
    let db: Database;
    let agentId: string;
    let projectId: string;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);

        // Create an agent and project for polling configs
        const agent = createAgent(db, { name: 'TestAgent', model: 'claude-sonnet-4-20250514' });
        agentId = agent.id;
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
        projectId = project.id;
    });

    afterEach(() => {
        db.close();
    });

    // ── Routing ──────────────────────────────────────────────────────────

    it('returns null for non-matching paths', () => {
        const { req, url } = fakeReq('GET', '/api/agents');
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect(res).toBeNull();
    });

    // ── List configs ─────────────────────────────────────────────────────

    it('lists polling configs (empty initially)', async () => {
        const { req, url } = fakeReq('GET', '/api/mention-polling');
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.configs).toHaveLength(0);
    });

    // ── Create config ────────────────────────────────────────────────────

    it('creates a polling config', async () => {
        const { req, url } = fakeReq('POST', '/api/mention-polling', validCreateBody(agentId, projectId));
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.id).toBeDefined();
        expect(data.repo).toBe('owner/test-repo');
        expect(data.mentionUsername).toBe('corvid-agent');
    });

    it('rejects create with invalid JSON body', async () => {
        const url = new URL('http://localhost:3000/api/mention-polling');
        const req = new Request(url.toString(), {
            method: 'POST',
            body: 'not json',
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects create with missing required fields', async () => {
        const { req, url } = fakeReq('POST', '/api/mention-polling', {
            agentId,
            // missing repo and mentionUsername
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBe(400);
    });

    // ── Get single config ────────────────────────────────────────────────

    it('gets a single polling config by id', async () => {
        // Create first
        const { req: createReq, url: createUrl } = fakeReq('POST', '/api/mention-polling', validCreateBody(agentId, projectId));
        const createRes = await handleMentionPollingRoutes(createReq, createUrl, db, null);
        const created = await createRes!.json();

        // Get
        const { req, url } = fakeReq('GET', `/api/mention-polling/${created.id}`);
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.id).toBe(created.id);
    });

    it('returns 404 for nonexistent config', async () => {
        const { req, url } = fakeReq('GET', '/api/mention-polling/nonexistent-id');
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBe(404);
    });

    // ── Update config ────────────────────────────────────────────────────

    it('updates a polling config', async () => {
        // Create first
        const { req: createReq, url: createUrl } = fakeReq('POST', '/api/mention-polling', validCreateBody(agentId, projectId));
        const createRes = await handleMentionPollingRoutes(createReq, createUrl, db, null);
        const created = await createRes!.json();

        // Update
        const { req, url } = fakeReq('PUT', `/api/mention-polling/${created.id}`, {
            intervalSeconds: 120,
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.intervalSeconds).toBe(120);
    });

    it('returns 404 when updating nonexistent config', async () => {
        const { req, url } = fakeReq('PUT', '/api/mention-polling/nonexistent', {
            intervalSeconds: 120,
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBe(404);
    });

    // ── Delete config ────────────────────────────────────────────────────

    it('deletes a polling config', async () => {
        // Create first
        const { req: createReq, url: createUrl } = fakeReq('POST', '/api/mention-polling', validCreateBody(agentId, projectId));
        const createRes = await handleMentionPollingRoutes(createReq, createUrl, db, null);
        const created = await createRes!.json();

        // Delete
        const { req, url } = fakeReq('DELETE', `/api/mention-polling/${created.id}`);
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
    });

    it('returns 404 when deleting nonexistent config', async () => {
        const { req, url } = fakeReq('DELETE', '/api/mention-polling/nonexistent');
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBe(404);
    });

    // ── Stats ────────────────────────────────────────────────────────────

    it('returns polling stats from service', async () => {
        const mockService = createMockPollingService();
        const { req, url } = fakeReq('GET', '/api/mention-polling/stats');
        const res = await handleMentionPollingRoutes(req, url, db, mockService);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.isRunning).toBe(true);
        expect(data.activeConfigs).toBe(2);
    });

    it('returns default stats when service is null', async () => {
        const { req, url } = fakeReq('GET', '/api/mention-polling/stats');
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.isRunning).toBe(false);
    });

    // ── Blocked repo ─────────────────────────────────────────────────────

    it('rejects creating config for a blocked repo', async () => {
        // Add repo to blocklist
        db.query('INSERT INTO repo_blocklist (repo, reason) VALUES (?, ?)').run('blocked/repo', 'test');

        const { req, url } = fakeReq('POST', '/api/mention-polling', validCreateBody(agentId, projectId, 'blocked/repo'));
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res!.status).toBe(403);
    });

    // ── List with agentId filter ─────────────────────────────────────────

    it('filters configs by agentId query param', async () => {
        // Create config
        const { req: createReq, url: createUrl } = fakeReq('POST', '/api/mention-polling', validCreateBody(agentId, projectId, 'owner/repo'));
        await handleMentionPollingRoutes(createReq, createUrl, db, null);

        // List with filter
        const { req, url } = fakeReq('GET', `/api/mention-polling?agentId=${agentId}`);
        const res = await handleMentionPollingRoutes(req, url, db, null);
        const data = await res!.json();
        expect(data.configs).toHaveLength(1);

        // List with different agentId
        const { req: req2, url: url2 } = fakeReq('GET', '/api/mention-polling?agentId=other');
        const res2 = await handleMentionPollingRoutes(req2, url2, db, null);
        const data2 = await res2!.json();
        expect(data2.configs).toHaveLength(0);
    });
});
