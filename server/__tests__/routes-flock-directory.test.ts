import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleFlockDirectoryRoutes } from '../routes/flock-directory';
import type { FlockDirectoryService } from '../flock-directory/service';

let db: Database;

// Valid-format 58-char Algorand addresses for tests
const VALID_ADDR1 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';
const VALID_ADDR2 = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC4';

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

/** Await the handler and return a Response (or null). */
async function callRoute(
    ...args: Parameters<typeof handleFlockDirectoryRoutes>
): Promise<Response | null> {
    const result = handleFlockDirectoryRoutes(...args);
    return result ? await result : null;
}

function createMockService(overrides?: Partial<FlockDirectoryService>): FlockDirectoryService {
    return {
        search: mock(() => ({ agents: [], total: 0, limit: 50, offset: 0 })),
        getStats: mock(() => ({ total: 5, active: 3, inactive: 2 })),
        listActive: mock(() => []),
        register: mock(() => ({
            id: 'new-id',
            address: VALID_ADDR1,
            name: 'TestAgent',
            description: '',
            instanceUrl: null,
            capabilities: [],
            status: 'active',
            reputationScore: 0,
            attestationCount: 0,
            councilParticipations: 0,
            uptimePct: 100,
            lastHeartbeat: '2026-01-01T00:00:00Z',
            registeredAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
        })),
        getById: mock(() => null),
        getByAddress: mock(() => null),
        update: mock(() => null),
        deregister: mock(() => false),
        heartbeat: mock(() => false),
        ...overrides,
    } as unknown as FlockDirectoryService;
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterAll(() => db.close());

describe('Flock Directory Routes', () => {
    // ─── Service unavailable ─────────────────────────────────────────────────

    it('returns 503 when flockDirectory service is null', async () => {
        const { req, url } = fakeReq('GET', '/api/flock-directory/search');
        const res = await callRoute(req, url, db, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
        const data = await res!.json();
        expect(data.error).toContain('not available');
    });

    it('returns 503 when flockDirectory service is undefined', async () => {
        const { req, url } = fakeReq('GET', '/api/flock-directory/stats');
        const res = await callRoute(req, url, db, undefined);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
    });

    // ─── Path matching ───────────────────────────────────────────────────────

    it('returns null for non-flock-directory paths', async () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = await callRoute(req, url, db, null);
        expect(res).toBeNull();
    });

    it('returns null for non-flock-directory paths even with service', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('GET', '/api/other');
        const res = await callRoute(req, url, db, svc);
        expect(res).toBeNull();
    });

    // ─── Search ──────────────────────────────────────────────────────────────

    it('GET /api/flock-directory/search calls search with no params', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('GET', '/api/flock-directory/search');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.agents).toEqual([]);
        expect(data.total).toBe(0);
        expect(svc.search).toHaveBeenCalledTimes(1);
    });

    it('GET /api/flock-directory/search passes query params', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('GET', '/api/flock-directory/search?q=test&status=active&capability=code&minReputation=5&limit=10&offset=2');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        expect(svc.search).toHaveBeenCalledWith({
            query: 'test',
            status: 'active',
            capability: 'code',
            minReputation: 5,
            limit: 10,
            offset: 2,
        });
    });

    // ─── Stats ───────────────────────────────────────────────────────────────

    it('GET /api/flock-directory/stats returns stats', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('GET', '/api/flock-directory/stats');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data).toEqual({ total: 5, active: 3, inactive: 2 });
        expect(svc.getStats).toHaveBeenCalledTimes(1);
    });

    // ─── List active agents ──────────────────────────────────────────────────

    it('GET /api/flock-directory/agents lists active agents', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('GET', '/api/flock-directory/agents');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data).toEqual([]);
        expect(svc.listActive).toHaveBeenCalledTimes(1);
    });

    it('GET /api/flock-directory/agents passes pagination params', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('GET', '/api/flock-directory/agents?limit=20&offset=5');
        await callRoute(req, url, db, svc);
        expect(svc.listActive).toHaveBeenCalledWith(20, 5);
    });

    // ─── Register ────────────────────────────────────────────────────────────

    it('POST /api/flock-directory/agents registers a new agent', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('POST', '/api/flock-directory/agents', {
            address: VALID_ADDR1,
            name: 'TestAgent',
        });
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.id).toBe('new-id');
        expect(data.name).toBe('TestAgent');
        expect(svc.register).toHaveBeenCalledWith({
            address: VALID_ADDR1,
            name: 'TestAgent',
        });
    });

    it('POST /api/flock-directory/agents with full body', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('POST', '/api/flock-directory/agents', {
            address: VALID_ADDR2,
            name: 'FullAgent',
            description: 'A full agent',
            instanceUrl: 'https://example.com',
            capabilities: ['code', 'review'],
        });
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        expect(svc.register).toHaveBeenCalledWith({
            address: VALID_ADDR2,
            name: 'FullAgent',
            description: 'A full agent',
            instanceUrl: 'https://example.com',
            capabilities: ['code', 'review'],
        });
    });

    it('POST /api/flock-directory/agents rejects empty body', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('POST', '/api/flock-directory/agents', {});
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/flock-directory/agents rejects missing address', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('POST', '/api/flock-directory/agents', { name: 'NoAddr' });
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/flock-directory/agents rejects missing name', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('POST', '/api/flock-directory/agents', { address: VALID_ADDR1 });
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/flock-directory/agents rejects invalid instanceUrl', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('POST', '/api/flock-directory/agents', {
            address: VALID_ADDR1,
            name: 'Test',
            instanceUrl: 'not-a-url',
        });
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    // ─── GET by ID ───────────────────────────────────────────────────────────

    it('GET /api/flock-directory/agents/:id returns agent', async () => {
        const agent = {
            id: 'agent-1',
            address: VALID_ADDR1,
            name: 'TestAgent',
            status: 'active',
        };
        const svc = createMockService({ getById: mock(() => agent as any) });
        const { req, url } = fakeReq('GET', '/api/flock-directory/agents/agent-1');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.id).toBe('agent-1');
        expect(svc.getById).toHaveBeenCalledWith('agent-1');
    });

    it('GET /api/flock-directory/agents/:id returns 404 when not found', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('GET', '/api/flock-directory/agents/nonexistent');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    // ─── PATCH by ID ─────────────────────────────────────────────────────────

    it('PATCH /api/flock-directory/agents/:id updates agent', async () => {
        const updated = { id: 'agent-1', name: 'Updated', status: 'active' };
        const svc = createMockService({ update: mock(() => updated as any) });
        const { req, url } = fakeReq('PATCH', '/api/flock-directory/agents/agent-1', {
            name: 'Updated',
        });
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.name).toBe('Updated');
        expect(svc.update).toHaveBeenCalledWith('agent-1', { name: 'Updated' });
    });

    it('PATCH /api/flock-directory/agents/:id returns 404 when not found', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('PATCH', '/api/flock-directory/agents/nonexistent', {
            name: 'Updated',
        });
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    // ─── DELETE by ID ────────────────────────────────────────────────────────

    it('DELETE /api/flock-directory/agents/:id deregisters agent', async () => {
        const svc = createMockService({ deregister: mock(() => true) });
        const { req, url } = fakeReq('DELETE', '/api/flock-directory/agents/agent-1');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
        expect(svc.deregister).toHaveBeenCalledWith('agent-1');
    });

    it('DELETE /api/flock-directory/agents/:id returns 404 when not found', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('DELETE', '/api/flock-directory/agents/nonexistent');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    // ─── Heartbeat ───────────────────────────────────────────────────────────

    it('POST /api/flock-directory/agents/:id/heartbeat succeeds', async () => {
        const svc = createMockService({ heartbeat: mock(() => true) });
        const { req, url } = fakeReq('POST', '/api/flock-directory/agents/agent-1/heartbeat');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);
        expect(svc.heartbeat).toHaveBeenCalledWith('agent-1');
    });

    it('POST /api/flock-directory/agents/:id/heartbeat returns 404 when not found', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('POST', '/api/flock-directory/agents/nonexistent/heartbeat');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    // ─── Lookup by address ───────────────────────────────────────────────────

    it('GET /api/flock-directory/lookup/:address returns agent', async () => {
        const agent = { id: 'agent-1', address: VALID_ADDR1, name: 'Test' };
        const svc = createMockService({ getByAddress: mock(() => agent as any) });
        const { req, url } = fakeReq('GET', `/api/flock-directory/lookup/${VALID_ADDR1}`);
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.address).toBe(VALID_ADDR1);
        expect(svc.getByAddress).toHaveBeenCalledWith(VALID_ADDR1);
    });

    it('GET /api/flock-directory/lookup/:address returns 400 for invalid address format', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('GET', '/api/flock-directory/lookup/INVALID');
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('GET /api/flock-directory/lookup/:address returns 404 for valid but unknown address', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('GET', `/api/flock-directory/lookup/${VALID_ADDR2}`);
        const res = await callRoute(req, url, db, svc);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    // ─── Unmatched sub-paths ─────────────────────────────────────────────────

    it('returns null for unmatched flock-directory sub-path', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('GET', '/api/flock-directory/unknown-endpoint');
        const res = await callRoute(req, url, db, svc);
        expect(res).toBeNull();
    });

    it('returns null for wrong method on search', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('POST', '/api/flock-directory/search');
        const res = await callRoute(req, url, db, svc);
        expect(res).toBeNull();
    });

    it('returns null for wrong method on stats', async () => {
        const svc = createMockService();
        const { req, url } = fakeReq('POST', '/api/flock-directory/stats');
        const res = await callRoute(req, url, db, svc);
        expect(res).toBeNull();
    });
});
