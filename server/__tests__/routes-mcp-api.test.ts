import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleMcpApiRoutes } from '../routes/mcp-api';

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

describe('MCP API Routes', () => {
    it('returns null when deps is null', () => {
        const { req, url } = fakeReq('POST', '/api/mcp/send-message');
        const res = handleMcpApiRoutes(req, url, null);
        expect(res).toBeNull();
    });

    it('returns null for non-mcp paths even with deps null', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleMcpApiRoutes(req, url, null);
        expect(res).toBeNull();
    });

    it('returns null for non-mcp paths with deps provided', () => {
        const deps = {
            db,
            agentMessenger: {} as unknown as import('../algochat/agent-messenger').AgentMessenger,
            agentDirectory: {} as unknown as import('../algochat/agent-directory').AgentDirectory,
            agentWalletService: {} as unknown as import('../algochat/agent-wallet').AgentWalletService,
        };
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleMcpApiRoutes(req, url, deps);
        expect(res).toBeNull();
    });

    it('returns null for unknown /api/mcp/ sub-paths', () => {
        const deps = {
            db,
            agentMessenger: {} as unknown as import('../algochat/agent-messenger').AgentMessenger,
            agentDirectory: {} as unknown as import('../algochat/agent-directory').AgentDirectory,
            agentWalletService: {} as unknown as import('../algochat/agent-wallet').AgentWalletService,
        };
        const { req, url } = fakeReq('GET', '/api/mcp/unknown-endpoint');
        const res = handleMcpApiRoutes(req, url, deps);
        expect(res).toBeNull();
    });

    it('GET /api/mcp/list-agents returns 400 without agentId', async () => {
        const deps = {
            db,
            agentMessenger: {} as unknown as import('../algochat/agent-messenger').AgentMessenger,
            agentDirectory: {
                getRegisteredAgents: () => [],
            } as unknown as import('../algochat/agent-directory').AgentDirectory,
            agentWalletService: {} as unknown as import('../algochat/agent-wallet').AgentWalletService,
        };
        const { req, url } = fakeReq('GET', '/api/mcp/list-agents');
        const res = await handleMcpApiRoutes(req, url, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('agentId');
    });

    it('POST /api/mcp/send-message with valid deps but missing body fields returns error', async () => {
        const deps = {
            db,
            agentMessenger: {
                sendMessage: async () => ({ content: [{ type: 'text', text: 'ok' }], isError: false }),
            } as unknown as import('../algochat/agent-messenger').AgentMessenger,
            agentDirectory: {} as unknown as import('../algochat/agent-directory').AgentDirectory,
            agentWalletService: {} as unknown as import('../algochat/agent-wallet').AgentWalletService,
        };
        const { req, url } = fakeReq('POST', '/api/mcp/send-message', {});
        const res = await handleMcpApiRoutes(req, url, deps);
        expect(res).not.toBeNull();
        // Should return 400 for validation error (missing required fields)
        expect(res!.status).toBe(400);
    });

    it('POST /api/mcp/save-memory with missing fields returns error', async () => {
        const deps = {
            db,
            agentMessenger: {} as unknown as import('../algochat/agent-messenger').AgentMessenger,
            agentDirectory: {} as unknown as import('../algochat/agent-directory').AgentDirectory,
            agentWalletService: {} as unknown as import('../algochat/agent-wallet').AgentWalletService,
        };
        const { req, url } = fakeReq('POST', '/api/mcp/save-memory', {});
        const res = await handleMcpApiRoutes(req, url, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/mcp/recall-memory with missing fields returns error', async () => {
        const deps = {
            db,
            agentMessenger: {} as unknown as import('../algochat/agent-messenger').AgentMessenger,
            agentDirectory: {} as unknown as import('../algochat/agent-directory').AgentDirectory,
            agentWalletService: {} as unknown as import('../algochat/agent-wallet').AgentWalletService,
        };
        const { req, url } = fakeReq('POST', '/api/mcp/recall-memory', {});
        const res = await handleMcpApiRoutes(req, url, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });
});
