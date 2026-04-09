import type { Database } from 'bun:sqlite';
import { getAgent } from '../db/agents';
import {
  applyVariant,
  createVariant,
  deleteVariant,
  getAgentVariant,
  getVariant,
  listVariants,
  removeVariant,
  updateVariant,
} from '../db/variants';
import { json } from '../lib/response';
import {
  ApplyVariantSchema,
  CreateVariantSchema,
  parseBodyOrThrow,
  UpdateVariantSchema,
  ValidationError,
} from '../lib/validation';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';

export function handleVariantRoutes(
  req: Request,
  url: URL,
  db: Database,
  context?: RequestContext,
): Response | Promise<Response> | null {
  const path = url.pathname;
  const method = req.method;
  const tenantId = context?.tenantId ?? 'default';

  // ─── Variant CRUD ──────────────────────────────────────────────────────

  // GET /api/variants
  if (path === '/api/variants' && method === 'GET') {
    return json(listVariants(db));
  }

  // POST /api/variants
  if (path === '/api/variants' && method === 'POST') {
    if (context) {
      const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (denied) return denied;
    }
    return handleCreateVariant(req, db);
  }

  // GET/PUT/DELETE /api/variants/:id
  const variantMatch = path.match(/^\/api\/variants\/([^/]+)$/);
  if (variantMatch) {
    const id = variantMatch[1];

    if (method === 'GET') {
      const variant = getVariant(db, id);
      return variant ? json(variant) : json({ error: 'Not found' }, 404);
    }

    if (method === 'PUT') {
      if (context) {
        const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (denied) return denied;
      }
      return handleUpdateVariant(req, db, id);
    }

    if (method === 'DELETE') {
      if (context) {
        const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (denied) return denied;
      }
      const deleted = deleteVariant(db, id);
      if (!deleted) return json({ error: 'Not found' }, 404);
      return json({ ok: true });
    }
  }

  // ─── Agent-Variant Assignment ──────────────────────────────────────────

  // GET /api/agents/:id/variant
  const agentVariantGet = path.match(/^\/api\/agents\/([^/]+)\/variant$/);
  if (agentVariantGet && method === 'GET') {
    const agentId = agentVariantGet[1];
    const agent = getAgent(db, agentId, tenantId);
    if (!agent) return json({ error: 'Agent not found' }, 404);
    const variant = getAgentVariant(db, agentId);
    return json(variant);
  }

  // POST /api/agents/:id/variant — apply variant
  if (agentVariantGet && method === 'POST') {
    if (context) {
      const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (denied) return denied;
    }
    return handleApplyVariant(req, db, agentVariantGet[1], tenantId);
  }

  // DELETE /api/agents/:id/variant — remove variant
  if (agentVariantGet && method === 'DELETE') {
    if (context) {
      const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (denied) return denied;
    }
    const agentId = agentVariantGet[1];
    const agent = getAgent(db, agentId, tenantId);
    if (!agent) return json({ error: 'Agent not found' }, 404);
    const removed = removeVariant(db, agentId);
    if (!removed) return json({ error: 'No variant assigned' }, 404);
    return json({ ok: true });
  }

  return null;
}

async function handleCreateVariant(req: Request, db: Database): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, CreateVariantSchema);
    const variant = createVariant(db, data);
    return json(variant, 201);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

async function handleUpdateVariant(req: Request, db: Database, id: string): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, UpdateVariantSchema);
    const variant = updateVariant(db, id, data);
    if (!variant) return json({ error: 'Not found' }, 404);
    return json(variant);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

async function handleApplyVariant(req: Request, db: Database, agentId: string, tenantId: string): Promise<Response> {
  try {
    const agent = getAgent(db, agentId, tenantId);
    if (!agent) return json({ error: 'Agent not found' }, 404);

    const data = await parseBodyOrThrow(req, ApplyVariantSchema);
    const applied = applyVariant(db, agentId, data.variantId);
    if (!applied) return json({ error: 'Variant not found' }, 404);
    return json({ ok: true }, 201);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}
