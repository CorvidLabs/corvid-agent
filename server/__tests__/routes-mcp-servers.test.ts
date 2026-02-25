import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleMcpServerRoutes } from '../routes/mcp-servers';

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

    // Seed an agent for FK references
    agentId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'McpTestAgent')").run(agentId);
});

afterAll(() => db.close());

describe('MCP Server Routes', () => {
    it('GET /api/mcp-servers returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/mcp-servers');
        const res = handleMcpServerRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('POST /api/mcp-servers rejects empty body', async () => {
        const { req, url } = fakeReq('POST', '/api/mcp-servers', {});
        const res = await handleMcpServerRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/mcp-servers rejects missing name', async () => {
        const { req, url } = fakeReq('POST', '/api/mcp-servers', { command: 'npx' });
        const res = await handleMcpServerRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/mcp-servers rejects missing command', async () => {
        const { req, url } = fakeReq('POST', '/api/mcp-servers', { name: 'test-server' });
        const res = await handleMcpServerRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    let configId: string;

    it('POST /api/mcp-servers creates config with valid input', async () => {
        const { req, url } = fakeReq('POST', '/api/mcp-servers', {
            name: 'test-mcp',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-test'],
            agentId,
        });
        const res = await handleMcpServerRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.name).toBe('test-mcp');
        expect(data.command).toBe('npx');
        expect(data.args).toEqual(['-y', '@modelcontextprotocol/server-test']);
        expect(data.agentId).toBe(agentId);
        expect(data.id).toBeDefined();
        configId = data.id;
    });

    it('POST /api/mcp-servers creates global config without agentId', async () => {
        const { req, url } = fakeReq('POST', '/api/mcp-servers', {
            name: 'global-mcp',
            command: 'node',
            args: ['server.js'],
        });
        const res = await handleMcpServerRoutes(req, url, db);
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.agentId).toBeNull();
    });

    it('GET /api/mcp-servers lists all configs', async () => {
        const { req, url } = fakeReq('GET', '/api/mcp-servers');
        const res = handleMcpServerRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.length).toBeGreaterThanOrEqual(2);
    });

    it('GET /api/mcp-servers?agentId=xxx filters by agent', async () => {
        const { req, url } = fakeReq('GET', `/api/mcp-servers?agentId=${agentId}`);
        const res = handleMcpServerRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.length).toBeGreaterThanOrEqual(1);
        for (const config of data) {
            expect(config.agentId).toBe(agentId);
        }
    });

    it('GET /api/mcp-servers?agentId=xxx returns empty for unknown agent', async () => {
        const { req, url } = fakeReq('GET', '/api/mcp-servers?agentId=nonexistent');
        const res = handleMcpServerRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.length).toBe(0);
    });

    it('PUT /api/mcp-servers/:id updates config', async () => {
        const { req, url } = fakeReq('PUT', `/api/mcp-servers/${configId}`, { name: 'updated-mcp' });
        const res = await handleMcpServerRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.name).toBe('updated-mcp');
    });

    it('PUT /api/mcp-servers/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('PUT', '/api/mcp-servers/nonexistent', { name: 'x' });
        const res = await handleMcpServerRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/mcp-servers/:id rejects name too long', async () => {
        const { req, url } = fakeReq('PUT', `/api/mcp-servers/${configId}`, {
            name: 'x'.repeat(101),
        });
        const res = await handleMcpServerRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/mcp-servers/:id/test returns 404 for unknown config', async () => {
        const { req, url } = fakeReq('POST', '/api/mcp-servers/nonexistent/test');
        const res = await handleMcpServerRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(404);
    });

    it('DELETE /api/mcp-servers/:id deletes config', async () => {
        // Create a throwaway config
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/mcp-servers', {
            name: 'delete-me',
            command: 'echo',
        });
        const cRes = await handleMcpServerRoutes(cReq, cUrl, db);
        const created = await (cRes as Response).json();

        const { req, url } = fakeReq('DELETE', `/api/mcp-servers/${created.id}`);
        const res = handleMcpServerRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);
    });

    it('DELETE /api/mcp-servers/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('DELETE', '/api/mcp-servers/nonexistent');
        const res = handleMcpServerRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleMcpServerRoutes(req, url, db);
        expect(res).toBeNull();
    });
});
