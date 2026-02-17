import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleSessionRoutes } from '../routes/sessions';
import type { ProcessManager } from '../process/manager';

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

function createMockPM(overrides?: Partial<ProcessManager>): ProcessManager {
    return {
        startProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        resumeProcess: mock(() => {}),
        resumeSession: mock(() => true),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        isRunning: mock(() => false),
        approvalManager: { resolveRequest: mock(() => {}), getQueuedRequests: mock(() => []), resolveQueuedRequest: mock(() => true), operationalMode: 'default' },
        ...overrides,
    } as unknown as ProcessManager;
}

let projectId: string;

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Seed a project
    const id = crypto.randomUUID();
    db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Test', '/tmp')").run(id);
    projectId = id;
});

afterAll(() => db.close());

describe('Session Routes', () => {
    it('GET /api/sessions returns empty list initially', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/sessions');
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('GET /api/sessions filters by projectId', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', `/api/sessions?projectId=${projectId}`);
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('POST /api/sessions rejects empty body', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/sessions', {});
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/sessions creates session with valid input', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/sessions', {
            projectId,
            name: 'Test Session',
        });
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.name).toBe('Test Session');
        expect(data.projectId).toBe(projectId);
        expect(data.id).toBeDefined();
    });

    it('POST /api/sessions with initialPrompt starts process', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/sessions', {
            projectId,
            name: 'Auto Session',
            initialPrompt: 'Hello!',
        });
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res!.status).toBe(201);
        expect(pm.startProcess).toHaveBeenCalledTimes(1);
    });

    it('GET /api/sessions/:id returns session', async () => {
        const pm = createMockPM();
        // First create a session
        const { req: createReq, url: createUrl } = fakeReq('POST', '/api/sessions', {
            projectId,
            name: 'Fetch Me',
        });
        const createRes = await handleSessionRoutes(createReq, createUrl, db, pm);
        const session = await createRes!.json();

        // Now fetch it
        const { req, url } = fakeReq('GET', `/api/sessions/${session.id}`);
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.id).toBe(session.id);
        expect(data.name).toBe('Fetch Me');
    });

    it('GET /api/sessions/:id returns 404 for unknown', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/sessions/nonexistent');
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res!.status).toBe(404);
    });

    it('PUT /api/sessions/:id updates session', async () => {
        const pm = createMockPM();
        // Create
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/sessions', { projectId, name: 'Before' });
        const cRes = await handleSessionRoutes(cReq, cUrl, db, pm);
        const session = await cRes!.json();

        // Update
        const { req, url } = fakeReq('PUT', `/api/sessions/${session.id}`, { name: 'After' });
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.name).toBe('After');
    });

    it('PUT /api/sessions/:id returns 404 for unknown', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('PUT', '/api/sessions/nonexistent', { name: 'X' });
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res!.status).toBe(404);
    });

    it('DELETE /api/sessions/:id deletes and stops process', async () => {
        const pm = createMockPM();
        // Create
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/sessions', { projectId, name: 'Delete Me' });
        const cRes = await handleSessionRoutes(cReq, cUrl, db, pm);
        const session = await cRes!.json();

        // Delete
        const { req, url } = fakeReq('DELETE', `/api/sessions/${session.id}`);
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res!.status).toBe(200);
        expect(pm.stopProcess).toHaveBeenCalledWith(session.id);

        // Verify deleted
        const { req: gReq, url: gUrl } = fakeReq('GET', `/api/sessions/${session.id}`);
        const gRes = await handleSessionRoutes(gReq, gUrl, db, pm);
        expect(gRes!.status).toBe(404);
    });

    it('GET /api/sessions/:id/messages returns empty list', async () => {
        const pm = createMockPM();
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/sessions', { projectId, name: 'Msg Session' });
        const session = await (await handleSessionRoutes(cReq, cUrl, db, pm))!.json();

        const { req, url } = fakeReq('GET', `/api/sessions/${session.id}/messages`);
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('POST /api/sessions/:id/stop stops process', async () => {
        const pm = createMockPM();
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/sessions', { projectId, name: 'Stop Me' });
        const session = await (await handleSessionRoutes(cReq, cUrl, db, pm))!.json();

        const { req, url } = fakeReq('POST', `/api/sessions/${session.id}/stop`);
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res!.status).toBe(200);
        expect(pm.stopProcess).toHaveBeenCalledWith(session.id);
    });

    it('POST /api/sessions/:id/stop returns 404 for unknown', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/sessions/nonexistent/stop');
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res!.status).toBe(404);
    });

    it('POST /api/sessions/:id/resume resumes process', async () => {
        const pm = createMockPM();
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/sessions', { projectId, name: 'Resume Me' });
        const session = await (await handleSessionRoutes(cReq, cUrl, db, pm))!.json();

        const { req, url } = fakeReq('POST', `/api/sessions/${session.id}/resume`, { prompt: 'continue' });
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res!.status).toBe(200);
        expect(pm.resumeProcess).toHaveBeenCalled();
    });

    it('returns null for unmatched paths', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/other');
        const res = await handleSessionRoutes(req, url, db, pm);
        expect(res).toBeNull();
    });
});
