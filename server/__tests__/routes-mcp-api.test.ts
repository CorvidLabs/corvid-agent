import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleMcpApiRoutes } from '../routes/mcp-api';
import type { McpApiDeps } from '../routes/mcp-api';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { AgentWalletService } from '../algochat/agent-wallet';

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

/** Create a typed McpApiDeps with stub services. Pass partial overrides for specific methods. */
function makeMockDeps(overrides?: {
    agentMessenger?: Partial<AgentMessenger>;
    agentDirectory?: Partial<AgentDirectory>;
    agentWalletService?: Partial<AgentWalletService>;
}): McpApiDeps {
    return {
        db,
        agentMessenger: (overrides?.agentMessenger ?? {}) as unknown as AgentMessenger,
        agentDirectory: (overrides?.agentDirectory ?? {}) as unknown as AgentDirectory,
        agentWalletService: (overrides?.agentWalletService ?? {}) as unknown as AgentWalletService,
    };
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
        const deps = makeMockDeps();
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleMcpApiRoutes(req, url, deps);
        expect(res).toBeNull();
    });

    it('returns null for unknown /api/mcp/ sub-paths', () => {
        const deps = makeMockDeps();
        const { req, url } = fakeReq('GET', '/api/mcp/unknown-endpoint');
        const res = handleMcpApiRoutes(req, url, deps);
        expect(res).toBeNull();
    });

    it('GET /api/mcp/list-agents returns 400 without agentId', async () => {
        const deps = makeMockDeps({
            agentDirectory: { listAvailable: async () => [] },
        });
        const { req, url } = fakeReq('GET', '/api/mcp/list-agents');
        const res = await handleMcpApiRoutes(req, url, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('agentId');
    });

    it('POST /api/mcp/send-message with valid deps but missing body fields returns error', async () => {
        const deps = makeMockDeps({
            agentMessenger: {
                sendMessage: async () => ({ content: [{ type: 'text', text: 'ok' }], isError: false }),
            } as Partial<AgentMessenger>,
        });
        const { req, url } = fakeReq('POST', '/api/mcp/send-message', {});
        const res = await handleMcpApiRoutes(req, url, deps);
        expect(res).not.toBeNull();
        // Should return 400 for validation error (missing required fields)
        expect(res!.status).toBe(400);
    });

    it('POST /api/mcp/save-memory with missing fields returns error', async () => {
        const deps = makeMockDeps();
        const { req, url } = fakeReq('POST', '/api/mcp/save-memory', {});
        const res = await handleMcpApiRoutes(req, url, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    it('POST /api/mcp/recall-memory with missing fields returns error', async () => {
        const deps = makeMockDeps();
        const { req, url } = fakeReq('POST', '/api/mcp/recall-memory', {});
        const res = await handleMcpApiRoutes(req, url, deps);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });
});
