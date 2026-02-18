import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleScheduleRoutes } from '../routes/schedules';

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

    // Seed an agent (FK target for schedules)
    agentId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Test Agent')").run(agentId);
});

afterAll(() => db.close());

describe('Schedule Routes', () => {
    it('GET /api/schedules returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/schedules');
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    let createdId: string;

    it('POST /api/schedules creates a schedule with intervalMs', async () => {
        const { req, url } = fakeReq('POST', '/api/schedules', {
            agentId,
            name: 'Every 10 minutes',
            intervalMs: 600000,
            actions: [{ type: 'work_task', description: 'Do stuff' }],
        });
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.name).toBe('Every 10 minutes');
        expect(data.intervalMs).toBe(600000);
        expect(data.agentId).toBe(agentId);
        expect(data.id).toBeDefined();
        createdId = data.id;
    });

    it('POST /api/schedules creates a schedule with cronExpression', async () => {
        const { req, url } = fakeReq('POST', '/api/schedules', {
            agentId,
            name: 'Daily cron',
            cronExpression: '0 9 * * *',
            actions: [{ type: 'review_prs', repos: ['owner/repo'] }],
        });
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.name).toBe('Daily cron');
        expect(data.cronExpression).toBe('0 9 * * *');
    });

    it('POST /api/schedules rejects missing required fields', async () => {
        const { req, url } = fakeReq('POST', '/api/schedules', {
            agentId,
            name: 'No trigger',
            actions: [{ type: 'work_task', description: 'stuff' }],
            // Missing both cronExpression and intervalMs
        });
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/schedules rejects empty actions array', async () => {
        const { req, url } = fakeReq('POST', '/api/schedules', {
            agentId,
            name: 'No actions',
            intervalMs: 600000,
            actions: [],
        });
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('GET /api/schedules/:id returns a schedule', async () => {
        const { req, url } = fakeReq('GET', `/api/schedules/${createdId}`);
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        const data = await res!.json();
        expect(data.id).toBe(createdId);
        expect(data.name).toBe('Every 10 minutes');
    });

    it('GET /api/schedules/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('GET', '/api/schedules/nonexistent');
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    it('PUT /api/schedules/:id updates a schedule', async () => {
        const { req, url } = fakeReq('PUT', `/api/schedules/${createdId}`, {
            name: 'Updated name',
        });
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.name).toBe('Updated name');
    });

    it('PUT /api/schedules/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('PUT', '/api/schedules/nonexistent', {
            name: 'Whatever',
        });
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    it('DELETE /api/schedules/:id deletes a schedule', async () => {
        // Create one to delete
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/schedules', {
            agentId,
            name: 'Delete me',
            intervalMs: 600000,
            actions: [{ type: 'work_task', description: 'x' }],
        });
        const cRes = await handleScheduleRoutes(cReq, cUrl, db, null);
        const created = await cRes!.json();

        const { req, url } = fakeReq('DELETE', `/api/schedules/${created.id}`);
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);

        // Verify deleted
        const { req: gReq, url: gUrl } = fakeReq('GET', `/api/schedules/${created.id}`);
        const gRes = await handleScheduleRoutes(gReq, gUrl, db, null);
        expect(gRes!.status).toBe(404);
    });

    it('DELETE /api/schedules/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('DELETE', '/api/schedules/nonexistent');
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    it('GET /api/schedules/:id/executions returns empty list', async () => {
        const { req, url } = fakeReq('GET', `/api/schedules/${createdId}/executions`);
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('GET /api/schedule-executions returns empty list', async () => {
        const { req, url } = fakeReq('GET', '/api/schedule-executions');
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/scheduler/health returns defaults when service is null', async () => {
        const { req, url } = fakeReq('GET', '/api/scheduler/health');
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.running).toBe(false);
        expect(data.activeSchedules).toBe(0);
        expect(data.pausedSchedules).toBe(0);
        expect(data.runningExecutions).toBe(0);
        expect(data.maxConcurrent).toBe(0);
        expect(data.recentFailures).toBe(0);
    });

    it('GET /api/github/status returns configured boolean', async () => {
        const { req, url } = fakeReq('GET', '/api/github/status');
        const res = await handleScheduleRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(typeof data.configured).toBe('boolean');
    });

    it('returns null for unmatched paths', async () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleScheduleRoutes(req, url, db, null);
        expect(res).toBeNull();
    });
});
