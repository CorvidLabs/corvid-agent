import type { Database } from 'bun:sqlite';
import {
    listMcpServerConfigs,
    getMcpServerConfig,
    createMcpServerConfig,
    updateMcpServerConfig,
    deleteMcpServerConfig,
} from '../db/mcp-servers';
import { ExternalMcpClientManager } from '../mcp/external-client';
import { parseBodyOrThrow, ValidationError, CreateMcpServerConfigSchema, UpdateMcpServerConfigSchema } from '../lib/validation';
import { json } from '../lib/response';

export function handleMcpServerRoutes(
    req: Request,
    url: URL,
    db: Database,
): Response | Promise<Response> | null {
    // GET /api/mcp-servers — list configs (optional ?agentId=xxx filter)
    if (url.pathname === '/api/mcp-servers' && req.method === 'GET') {
        const agentId = url.searchParams.get('agentId') ?? undefined;
        const configs = listMcpServerConfigs(db, agentId);
        return json(configs);
    }

    // POST /api/mcp-servers — create config
    if (url.pathname === '/api/mcp-servers' && req.method === 'POST') {
        return handleCreate(req, db);
    }

    // PUT /api/mcp-servers/:id — update config
    const putMatch = url.pathname.match(/^\/api\/mcp-servers\/([^/]+)$/);
    if (putMatch && req.method === 'PUT') {
        return handleUpdate(req, db, putMatch[1]);
    }

    // DELETE /api/mcp-servers/:id — delete config
    const deleteMatch = url.pathname.match(/^\/api\/mcp-servers\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
        const id = deleteMatch[1];
        const deleted = deleteMcpServerConfig(db, id);
        if (!deleted) return json({ error: 'MCP server config not found' }, 404);
        return json({ ok: true });
    }

    // POST /api/mcp-servers/:id/test — test connection
    const testMatch = url.pathname.match(/^\/api\/mcp-servers\/([^/]+)\/test$/);
    if (testMatch && req.method === 'POST') {
        return handleTest(db, testMatch[1]);
    }

    return null;
}

async function handleCreate(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateMcpServerConfigSchema);
        const config = createMcpServerConfig(db, data);
        return json(config, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleUpdate(req: Request, db: Database, id: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateMcpServerConfigSchema);
        const config = updateMcpServerConfig(db, id, data);
        if (!config) return json({ error: 'MCP server config not found' }, 404);
        return json(config);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleTest(db: Database, id: string): Promise<Response> {
    const config = getMcpServerConfig(db, id);
    if (!config) return json({ error: 'MCP server config not found' }, 404);

    const manager = new ExternalMcpClientManager();
    try {
        const connections = await manager.connectAll([config]);
        if (connections.length === 0) {
            return json({ ok: false, error: 'Failed to connect to MCP server' }, 502);
        }

        const tools = connections[0].tools.map(t => ({
            name: t.name,
            description: t.description,
        }));

        return json({ ok: true, tools });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return json({ ok: false, error: msg }, 502);
    } finally {
        await manager.disconnectAll();
    }
}
