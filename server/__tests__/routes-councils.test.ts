import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleCouncilRoutes } from '../routes/councils';
import type { ProcessManager } from '../process/manager';

let db: Database;
let projectId: string;
let agentId1: string;
let agentId2: string;

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

function createMockPM(): ProcessManager {
    return {
        startProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        resumeProcess: mock(() => {}),
        resumeSession: mock(() => true),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        isRunning: mock(() => false),
        approvalManager: { resolveRequest: mock(() => {}), getQueuedRequests: mock(() => []), operationalMode: 'default' },
    } as unknown as ProcessManager;
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    projectId = crypto.randomUUID();
    agentId1 = crypto.randomUUID();
    agentId2 = crypto.randomUUID();

    db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Test', '/tmp')").run(projectId);
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Agent1')").run(agentId1);
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Agent2')").run(agentId2);
});

afterAll(() => db.close());

describe('Council Routes', () => {
    it('GET /api/councils returns empty list initially', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/councils');
        const res = handleCouncilRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('POST /api/councils rejects empty body', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/councils', {});
        const res = await handleCouncilRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/councils rejects missing agentIds', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/councils', { name: 'Test Council' });
        const res = await handleCouncilRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/councils creates council with valid input', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/api/councils', {
            name: 'Test Council',
            agentIds: [agentId1, agentId2],
        });
        const res = await handleCouncilRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.name).toBe('Test Council');
        expect(data.id).toBeDefined();
    });

    let councilId: string;

    it('GET /api/councils lists created council', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/councils');
        const res = handleCouncilRoutes(req, url, db, pm);
        const data = await (res as Response).json();
        expect(data.length).toBeGreaterThanOrEqual(1);
        councilId = data[0].id;
    });

    it('GET /api/councils/:id returns council', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', `/api/councils/${councilId}`);
        const res = handleCouncilRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.id).toBe(councilId);
        expect(data.name).toBe('Test Council');
    });

    it('GET /api/councils/:id returns 404 for unknown', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/councils/nonexistent');
        const res = handleCouncilRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/councils/:id updates council', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('PUT', `/api/councils/${councilId}`, { name: 'Updated Council' });
        const res = await handleCouncilRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.name).toBe('Updated Council');
    });

    it('GET /api/council-launches returns empty list initially', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/council-launches');
        const res = handleCouncilRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/council-launches/:id returns 404 for unknown', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/council-launches/nonexistent');
        const res = handleCouncilRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(404);
    });

    it('DELETE /api/councils/:id deletes council', async () => {
        const pm = createMockPM();
        // Create a throwaway council
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/councils', {
            name: 'Delete Me',
            agentIds: [agentId1],
        });
        const cRes = await handleCouncilRoutes(cReq, cUrl, db, pm);
        const council = await (cRes as Response).json();

        const { req, url } = fakeReq('DELETE', `/api/councils/${council.id}`);
        const res = handleCouncilRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(200);

        // Verify deleted
        const { req: gReq, url: gUrl } = fakeReq('GET', `/api/councils/${council.id}`);
        const gRes = handleCouncilRoutes(gReq, gUrl, db, pm);
        expect((gRes as Response).status).toBe(404);
    });

    it('returns null for unmatched paths', () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleCouncilRoutes(req, url, db, pm);
        expect(res).toBeNull();
    });
});
