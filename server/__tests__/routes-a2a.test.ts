import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleA2ARoutes } from '../routes/a2a';
import { clearTaskStore } from '../a2a/task-handler';
import type { ProcessManager } from '../process/manager';

let db: Database;
let projectId: string;
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
        approvalManager: {
            resolveRequest: mock(() => {}),
            getQueuedRequests: mock(() => []),
            resolveQueuedRequest: mock(() => true),
            operationalMode: 'default',
        },
        ...overrides,
    } as unknown as ProcessManager;
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Seed agent with default project (required for A2A task routing)
    projectId = crypto.randomUUID();
    agentId = crypto.randomUUID();
    db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'A2A Project', '/tmp')").run(projectId);
    db.query("INSERT INTO agents (id, name, default_project_id) VALUES (?, 'A2AAgent', ?)").run(agentId, projectId);
});

afterAll(() => {
    clearTaskStore();
    db.close();
});

describe('A2A Routes', () => {
    let createdTaskId: string;

    it('POST /a2a/tasks/send creates a task', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/a2a/tasks/send', {
            params: { message: 'Hello from remote agent' },
        });
        const res = await handleA2ARoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.id).toBeDefined();
        expect(data.state).toBe('working');
        expect(data.messages.length).toBeGreaterThanOrEqual(1);
        expect(pm.startProcess).toHaveBeenCalledTimes(1);
        expect(pm.subscribe).toHaveBeenCalledTimes(1);
        createdTaskId = data.id;
    });

    it('POST /a2a/tasks/send rejects missing message', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/a2a/tasks/send', {
            params: {},
        });
        const res = await handleA2ARoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('message');
    });

    it('POST /a2a/tasks/send rejects empty message', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('POST', '/a2a/tasks/send', {
            params: { message: '   ' },
        });
        const res = await handleA2ARoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('GET /a2a/tasks/:id returns task status', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', `/a2a/tasks/${createdTaskId}`);
        const res = await handleA2ARoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.id).toBe(createdTaskId);
        expect(data.state).toBeDefined();
    });

    it('GET /a2a/tasks/:id returns 404 for unknown task', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/a2a/tasks/nonexistent');
        const res = await handleA2ARoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    it('returns null for unmatched paths', async () => {
        const pm = createMockPM();
        const { req, url } = fakeReq('GET', '/api/other');
        const res = await handleA2ARoutes(req, url, db, pm);
        expect(res).toBeNull();
    });
});
