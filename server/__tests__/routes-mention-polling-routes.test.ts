import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleMentionPollingRoutes } from '../routes/mention-polling';
import type { MentionPollingService } from '../polling/service';

let db: Database;
let agentId: string;
let projectId: string;

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

    // Seed agent and project for FK references
    agentId = crypto.randomUUID();
    projectId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'PollingAgent')").run(agentId);
    db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'PollingProject', '/tmp')").run(projectId);
});

afterAll(() => db.close());

describe('Mention Polling Routes', () => {
    it('GET /api/mention-polling returns empty configs initially', async () => {
        const { req, url } = fakeReq('GET', '/api/mention-polling');
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.configs).toBeDefined();
        expect(Array.isArray(data.configs)).toBe(true);
        expect(data.configs.length).toBe(0);
    });

    it('POST /api/mention-polling rejects empty body', async () => {
        const { req, url } = fakeReq('POST', '/api/mention-polling', {});
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/mention-polling rejects missing agentId', async () => {
        const { req, url } = fakeReq('POST', '/api/mention-polling', {
            repo: 'owner/repo',
            mentionUsername: 'bot',
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/mention-polling rejects invalid repo format', async () => {
        const { req, url } = fakeReq('POST', '/api/mention-polling', {
            agentId,
            repo: 'invalid-repo-no-slash',
            mentionUsername: 'bot',
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/mention-polling rejects intervalSeconds below minimum', async () => {
        const { req, url } = fakeReq('POST', '/api/mention-polling', {
            agentId,
            repo: 'owner/repo',
            mentionUsername: 'bot',
            intervalSeconds: 10, // min is 30
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/mention-polling rejects intervalSeconds above maximum', async () => {
        const { req, url } = fakeReq('POST', '/api/mention-polling', {
            agentId,
            repo: 'owner/repo',
            mentionUsername: 'bot',
            intervalSeconds: 7200, // max is 3600
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect((res as Response).status).toBe(400);
    });

    let configId: string;

    it('POST /api/mention-polling creates config with valid input', async () => {
        const { req, url } = fakeReq('POST', '/api/mention-polling', {
            agentId,
            repo: 'owner/repo',
            mentionUsername: 'corvid-bot',
            intervalSeconds: 60,
            projectId,
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.repo).toBe('owner/repo');
        expect(data.mentionUsername).toBe('corvid-bot');
        expect(data.id).toBeDefined();
        configId = data.id;
    });

    it('GET /api/mention-polling lists created config', async () => {
        const { req, url } = fakeReq('GET', '/api/mention-polling');
        const res = handleMentionPollingRoutes(req, url, db, null);
        const data = await (res as Response).json();
        expect(data.configs.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/mention-polling?agentId=xxx filters by agent', async () => {
        const { req, url } = fakeReq('GET', `/api/mention-polling?agentId=${agentId}`);
        const res = handleMentionPollingRoutes(req, url, db, null);
        const data = await (res as Response).json();
        expect(data.configs.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/mention-polling?agentId=xxx returns empty for unknown agent', async () => {
        const { req, url } = fakeReq('GET', '/api/mention-polling?agentId=nonexistent');
        const res = handleMentionPollingRoutes(req, url, db, null);
        const data = await (res as Response).json();
        expect(data.configs.length).toBe(0);
    });

    it('GET /api/mention-polling/stats returns defaults when service is null', async () => {
        const { req, url } = fakeReq('GET', '/api/mention-polling/stats');
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.isRunning).toBe(false);
        expect(data.activeConfigs).toBe(0);
        expect(data.totalConfigs).toBe(0);
        expect(data.totalTriggers).toBe(0);
    });

    it('GET /api/mention-polling/stats returns service stats when available', async () => {
        const mockService = {
            getStats: mock(() => ({
                isRunning: true,
                activeConfigs: 3,
                totalConfigs: 5,
                totalTriggers: 42,
            })),
        } as unknown as MentionPollingService;
        const { req, url } = fakeReq('GET', '/api/mention-polling/stats');
        const res = handleMentionPollingRoutes(req, url, db, mockService);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.isRunning).toBe(true);
        expect(data.activeConfigs).toBe(3);
        expect(data.totalTriggers).toBe(42);
    });

    it('GET /api/mention-polling/:id returns config', async () => {
        const { req, url } = fakeReq('GET', `/api/mention-polling/${configId}`);
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.id).toBe(configId);
        expect(data.repo).toBe('owner/repo');
    });

    it('GET /api/mention-polling/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('GET', '/api/mention-polling/nonexistent');
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect((res as Response).status).toBe(404);
    });

    it('GET /api/mention-polling/:id/activity returns sessions', async () => {
        const { req, url } = fakeReq('GET', `/api/mention-polling/${configId}/activity`);
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.sessions).toBeDefined();
        expect(Array.isArray(data.sessions)).toBe(true);
    });

    it('GET /api/mention-polling/:id/activity returns 404 for unknown config', async () => {
        const { req, url } = fakeReq('GET', '/api/mention-polling/nonexistent/activity');
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/mention-polling/:id updates config', async () => {
        const { req, url } = fakeReq('PUT', `/api/mention-polling/${configId}`, {
            mentionUsername: 'updated-bot',
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.mentionUsername).toBe('updated-bot');
    });

    it('PUT /api/mention-polling/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('PUT', '/api/mention-polling/nonexistent', {
            mentionUsername: 'x',
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/mention-polling/:id rejects invalid status', async () => {
        const { req, url } = fakeReq('PUT', `/api/mention-polling/${configId}`, {
            status: 'invalid',
        });
        const res = await handleMentionPollingRoutes(req, url, db, null);
        expect((res as Response).status).toBe(400);
    });

    it('does not match "stats" as config ID', () => {
        // GET /api/mention-polling/stats should be handled by the stats route, not the :id route
        const { req, url } = fakeReq('GET', '/api/mention-polling/stats');
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        // It should return stats, not a 404
        expect((res as Response).status).toBe(200);
    });

    it('DELETE /api/mention-polling/:id deletes config', async () => {
        // Create a throwaway config
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/mention-polling', {
            agentId,
            repo: 'owner/delete-me',
            mentionUsername: 'bot',
            projectId,
        });
        const cRes = await handleMentionPollingRoutes(cReq, cUrl, db, null);
        const created = await (cRes as Response).json();

        const { req, url } = fakeReq('DELETE', `/api/mention-polling/${created.id}`);
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);

        // Verify deleted
        const { req: gReq, url: gUrl } = fakeReq('GET', `/api/mention-polling/${created.id}`);
        const gRes = handleMentionPollingRoutes(gReq, gUrl, db, null);
        expect((gRes as Response).status).toBe(404);
    });

    it('DELETE /api/mention-polling/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('DELETE', '/api/mention-polling/nonexistent');
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect((res as Response).status).toBe(404);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleMentionPollingRoutes(req, url, db, null);
        expect(res).toBeNull();
    });
});
