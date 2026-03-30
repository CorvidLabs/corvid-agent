import type { Database } from 'bun:sqlite';
import {
  createMcpServerConfig,
  deleteMcpServerConfig,
  getMcpServerConfig,
  listMcpServerConfigs,
  updateMcpServerConfig,
} from '../db/mcp-servers';
import { json } from '../lib/response';
import {
  CreateMcpServerConfigSchema,
  parseBodyOrThrow,
  UpdateMcpServerConfigSchema,
  ValidationError,
} from '../lib/validation';
import { ExternalMcpClientManager } from '../mcp/external-client';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';

export function handleMcpServerRoutes(
  req: Request,
  url: URL,
  db: Database,
  context?: RequestContext,
): Response | Promise<Response> | null {
  const tenantId = context?.tenantId ?? 'default';

  // GET /api/mcp-servers — list configs (optional ?agentId=xxx filter)
  if (url.pathname === '/api/mcp-servers' && req.method === 'GET') {
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const configs = listMcpServerConfigs(db, agentId, tenantId);
    return json(configs);
  }

  // POST /api/mcp-servers — create config
  if (url.pathname === '/api/mcp-servers' && req.method === 'POST') {
    if (context) {
      const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (denied) return denied;
    }
    return handleCreate(req, db, tenantId);
  }

  // PUT /api/mcp-servers/:id — update config
  const putMatch = url.pathname.match(/^\/api\/mcp-servers\/([^/]+)$/);
  if (putMatch && req.method === 'PUT') {
    if (context) {
      const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (denied) return denied;
    }
    return handleUpdate(req, db, putMatch[1], tenantId);
  }

  // DELETE /api/mcp-servers/:id — delete config
  const deleteMatch = url.pathname.match(/^\/api\/mcp-servers\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    if (context) {
      const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (denied) return denied;
    }
    const id = deleteMatch[1];
    const deleted = deleteMcpServerConfig(db, id, tenantId);
    if (!deleted) return json({ error: 'MCP server config not found' }, 404);
    return json({ ok: true });
  }

  // POST /api/mcp-servers/:id/test — test connection
  const testMatch = url.pathname.match(/^\/api\/mcp-servers\/([^/]+)\/test$/);
  if (testMatch && req.method === 'POST') {
    if (context) {
      const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (denied) return denied;
    }
    return handleTest(db, testMatch[1], tenantId);
  }

  return null;
}

async function handleCreate(req: Request, db: Database, tenantId: string): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, CreateMcpServerConfigSchema);
    const config = createMcpServerConfig(db, data, tenantId);
    return json(config, 201);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

async function handleUpdate(req: Request, db: Database, id: string, tenantId: string): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, UpdateMcpServerConfigSchema);
    const config = updateMcpServerConfig(db, id, data, tenantId);
    if (!config) return json({ error: 'MCP server config not found' }, 404);
    return json(config);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

async function handleTest(db: Database, id: string, tenantId: string): Promise<Response> {
  const config = getMcpServerConfig(db, id, tenantId);
  if (!config) return json({ error: 'MCP server config not found' }, 404);

  const manager = new ExternalMcpClientManager();
  try {
    const connections = await manager.connectAll([config]);
    if (connections.length === 0) {
      return json({ ok: false, error: 'Failed to connect to MCP server' }, 502);
    }

    const tools = connections[0].tools.map((t) => ({
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
