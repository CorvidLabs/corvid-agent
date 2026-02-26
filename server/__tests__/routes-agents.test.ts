import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleAgentRoutes } from '../routes/agents';
import { createAgent } from '../db/agents';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AgentMessenger } from '../algochat/agent-messenger';

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

describe('Agent Routes', () => {
    it('GET /api/agents returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/agents');
        const res = handleAgentRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('POST /api/agents rejects empty body', async () => {
        const { req, url } = fakeReq('POST', '/api/agents', {});
        const res = await handleAgentRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/agents rejects missing name', async () => {
        const { req, url } = fakeReq('POST', '/api/agents', { description: 'no name' });
        const res = await handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    let agentId: string;

    it('POST /api/agents creates agent with valid input', async () => {
        const { req, url } = fakeReq('POST', '/api/agents', { name: 'TestAgent' });
        const res = await handleAgentRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.name).toBe('TestAgent');
        expect(data.id).toBeDefined();
        agentId = data.id;
    });

    it('POST /api/agents triggers wallet creation when service available', async () => {
        const ensureWallet = mock(() => Promise.resolve());
        const walletService = { ensureWallet } as unknown as AgentWalletService;
        const { req, url } = fakeReq('POST', '/api/agents', { name: 'WalletAgent' });
        const res = await handleAgentRoutes(req, url, db, walletService);
        expect((res as Response).status).toBe(201);
        expect(ensureWallet).toHaveBeenCalled();
    });

    it('GET /api/agents lists created agents', async () => {
        const { req, url } = fakeReq('GET', '/api/agents');
        const res = handleAgentRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/agents/:id returns agent', async () => {
        const { req, url } = fakeReq('GET', `/api/agents/${agentId}`);
        const res = handleAgentRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.id).toBe(agentId);
        expect(data.name).toBe('TestAgent');
    });

    it('GET /api/agents/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('GET', '/api/agents/nonexistent');
        const res = handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/agents/:id updates agent', async () => {
        const { req, url } = fakeReq('PUT', `/api/agents/${agentId}`, { name: 'Updated' });
        const res = await handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.name).toBe('Updated');
    });

    it('PUT /api/agents/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('PUT', '/api/agents/nonexistent', { name: 'X' });
        const res = await handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/agents/:id rejects invalid body', async () => {
        const { req, url } = fakeReq('PUT', `/api/agents/${agentId}`, { name: '' });
        const res = await handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('GET /api/agents/:id/messages returns messages for agent', async () => {
        const { req, url } = fakeReq('GET', `/api/agents/${agentId}/messages`);
        const res = handleAgentRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/agents/:id/messages returns 404 for unknown agent', async () => {
        const { req, url } = fakeReq('GET', '/api/agents/nonexistent/messages');
        const res = handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('GET /api/agents/:id/balance returns balance without wallet service', async () => {
        const { req, url } = fakeReq('GET', `/api/agents/${agentId}/balance`);
        const res = await handleAgentRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data.balance).toBe(0);
        expect(data.address).toBeNull();
    });

    it('GET /api/agents/:id/balance returns 404 for unknown agent', async () => {
        const { req, url } = fakeReq('GET', '/api/agents/nonexistent/balance');
        const res = await handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('POST /api/agents/:id/fund returns 503 without wallet service', async () => {
        const { req, url } = fakeReq('POST', `/api/agents/${agentId}/fund`, { microAlgos: 5000 });
        const res = await handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(503);
    });

    it('POST /api/agents/:id/fund returns 404 for unknown agent', async () => {
        const walletService = {
            fundAgent: mock(() => Promise.resolve()),
            getBalance: mock(() => Promise.resolve(0)),
        } as unknown as AgentWalletService;
        const { req, url } = fakeReq('POST', '/api/agents/nonexistent/fund', { microAlgos: 5000 });
        const res = await handleAgentRoutes(req, url, db, walletService);
        expect((res as Response).status).toBe(404);
    });

    it('POST /api/agents/:id/fund rejects invalid microAlgos', async () => {
        const walletService = {
            fundAgent: mock(() => Promise.resolve()),
            getBalance: mock(() => Promise.resolve(0)),
        } as unknown as AgentWalletService;
        // Agent has no wallet address, so it would fail at that check;
        // but microAlgos validation should fail first if value < 1000
        const { req, url } = fakeReq('POST', `/api/agents/${agentId}/fund`, { microAlgos: 10 });
        const res = await handleAgentRoutes(req, url, db, walletService);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/agents/:id/invoke returns 503 without messenger', async () => {
        const { req, url } = fakeReq('POST', `/api/agents/${agentId}/invoke`, {
            toAgentId: 'some-agent',
            content: 'hello',
        });
        const res = await handleAgentRoutes(req, url, db, null, null);
        expect((res as Response).status).toBe(503);
    });

    it('POST /api/agents/:id/invoke returns 404 for unknown source agent', async () => {
        const messenger = { invoke: mock(() => Promise.resolve({})) } as unknown as AgentMessenger;
        const { req, url } = fakeReq('POST', '/api/agents/nonexistent/invoke', {
            toAgentId: 'some-agent',
            content: 'hello',
        });
        const res = await handleAgentRoutes(req, url, db, null, messenger);
        expect((res as Response).status).toBe(404);
    });

    it('POST /api/agents/:id/invoke rejects missing content', async () => {
        const messenger = { invoke: mock(() => Promise.resolve({})) } as unknown as AgentMessenger;
        const { req, url } = fakeReq('POST', `/api/agents/${agentId}/invoke`, {
            toAgentId: 'some-agent',
        });
        const res = await handleAgentRoutes(req, url, db, null, messenger);
        expect((res as Response).status).toBe(400);
    });

    it('GET /api/agents/:id/agent-card returns card for valid agent', async () => {
        const { req, url } = fakeReq('GET', `/api/agents/${agentId}/agent-card`);
        const res = handleAgentRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
    });

    it('GET /api/agents/:id/agent-card returns 404 for unknown agent', async () => {
        const { req, url } = fakeReq('GET', '/api/agents/nonexistent/agent-card');
        const res = handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('DELETE /api/agents/:id deletes agent', async () => {
        // Create a throwaway agent
        const agent = createAgent(db, { name: 'DeleteMe' });
        const { req, url } = fakeReq('DELETE', `/api/agents/${agent.id}`);
        const res = handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);

        // Verify deleted
        const { req: gReq, url: gUrl } = fakeReq('GET', `/api/agents/${agent.id}`);
        const gRes = handleAgentRoutes(gReq, gUrl, db);
        expect((gRes as Response).status).toBe(404);
    });

    it('DELETE /api/agents/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('DELETE', '/api/agents/nonexistent');
        const res = handleAgentRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleAgentRoutes(req, url, db);
        expect(res).toBeNull();
    });
});
