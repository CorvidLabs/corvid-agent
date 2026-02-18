import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleWorkflowRoutes } from '../routes/workflows';

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

/** Minimal valid workflow nodes for creating a workflow (must include a start node). */
function validNodes() {
    return [
        { id: 'start-1', type: 'start', label: 'Begin', config: {} },
        { id: 'end-1', type: 'end', label: 'Finish', config: {} },
    ];
}

function validEdges() {
    return [
        { id: 'e1', sourceNodeId: 'start-1', targetNodeId: 'end-1' },
    ];
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Seed an agent (FK target for workflows)
    agentId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Workflow Agent')").run(agentId);
});

afterAll(() => db.close());

describe('Workflow Routes', () => {
    it('GET /api/workflows returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/workflows');
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    let createdId: string;

    it('POST /api/workflows creates a workflow', async () => {
        const { req, url } = fakeReq('POST', '/api/workflows', {
            agentId,
            name: 'Test Workflow',
            description: 'A test workflow',
            nodes: validNodes(),
            edges: validEdges(),
        });
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.name).toBe('Test Workflow');
        expect(data.description).toBe('A test workflow');
        expect(data.agentId).toBe(agentId);
        expect(data.status).toBe('draft');
        expect(data.nodes.length).toBe(2);
        expect(data.edges.length).toBe(1);
        expect(data.id).toBeDefined();
        createdId = data.id;
    });

    it('POST /api/workflows rejects missing start node', async () => {
        const { req, url } = fakeReq('POST', '/api/workflows', {
            agentId,
            name: 'No Start',
            nodes: [
                { id: 'end-1', type: 'end', label: 'End', config: {} },
            ],
            edges: [],
        });
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/workflows rejects empty nodes array', async () => {
        const { req, url } = fakeReq('POST', '/api/workflows', {
            agentId,
            name: 'Empty Nodes',
            nodes: [],
            edges: [],
        });
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/workflows rejects missing name', async () => {
        const { req, url } = fakeReq('POST', '/api/workflows', {
            agentId,
            nodes: validNodes(),
            edges: [],
        });
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('GET /api/workflows/:id returns a workflow', async () => {
        const { req, url } = fakeReq('GET', `/api/workflows/${createdId}`);
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.id).toBe(createdId);
        expect(data.name).toBe('Test Workflow');
    });

    it('GET /api/workflows/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('GET', '/api/workflows/nonexistent');
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    it('PUT /api/workflows/:id updates a workflow', async () => {
        const { req, url } = fakeReq('PUT', `/api/workflows/${createdId}`, {
            name: 'Updated Workflow',
            status: 'active',
        });
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.name).toBe('Updated Workflow');
        expect(data.status).toBe('active');
    });

    it('PUT /api/workflows/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('PUT', '/api/workflows/nonexistent', {
            name: 'Whatever',
        });
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    it('DELETE /api/workflows/:id deletes a workflow', async () => {
        // Create one to delete
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/workflows', {
            agentId,
            name: 'Delete Me',
            nodes: validNodes(),
            edges: [],
        });
        const cRes = await handleWorkflowRoutes(cReq, cUrl, db, null);
        const created = await cRes!.json();

        const { req, url } = fakeReq('DELETE', `/api/workflows/${created.id}`);
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);

        // Verify deleted
        const { req: gReq, url: gUrl } = fakeReq('GET', `/api/workflows/${created.id}`);
        const gRes = await handleWorkflowRoutes(gReq, gUrl, db, null);
        expect(gRes!.status).toBe(404);
    });

    it('DELETE /api/workflows/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('DELETE', '/api/workflows/nonexistent');
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    it('GET /api/workflow-runs returns empty list', async () => {
        const { req, url } = fakeReq('GET', '/api/workflow-runs');
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('GET /api/workflows/health is shadowed by :id route (returns 404)', async () => {
        // NOTE: The /api/workflows/health route is unreachable because the
        // /api/workflows/:id regex matches "health" as an ID first, and
        // getWorkflow(db, "health") returns null => 404.
        const { req, url } = fakeReq('GET', '/api/workflows/health');
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    it('POST /api/workflows/:id/trigger returns 503 when service is null', async () => {
        const { req, url } = fakeReq('POST', `/api/workflows/${createdId}/trigger`, {
            input: {},
        });
        const res = await handleWorkflowRoutes(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
        const data = await res!.json();
        expect(data.error).toContain('not available');
    });

    it('returns null for unmatched paths', async () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleWorkflowRoutes(req, url, db, null);
        expect(res).toBeNull();
    });
});
