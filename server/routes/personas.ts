import type { Database } from 'bun:sqlite';
import { getAgent } from '../db/agents';
import {
  assignPersona,
  createPersona,
  deletePersona,
  getAgentPersonas,
  getPersona,
  listPersonas,
  unassignPersona,
  updatePersona,
} from '../db/personas';
import { checkInjection } from '../lib/injection-guard';
import { json } from '../lib/response';
import {
  AssignPersonaSchema,
  CreatePersonaSchema,
  parseBodyOrThrow,
  UpdatePersonaSchema,
  ValidationError,
} from '../lib/validation';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';

export function handlePersonaRoutes(
  req: Request,
  url: URL,
  db: Database,
  context?: RequestContext,
): Response | Promise<Response> | null {
  const path = url.pathname;
  const method = req.method;
  const tenantId = context?.tenantId ?? 'default';

  // ─── Persona CRUD ──────────────────────────────────────────────────────

  // GET /api/personas
  if (path === '/api/personas' && method === 'GET') {
    return json(listPersonas(db));
  }

  // POST /api/personas
  if (path === '/api/personas' && method === 'POST') {
    if (context) {
      const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (denied) return denied;
    }
    return handleCreatePersona(req, db);
  }

  // GET/PUT/DELETE /api/personas/:id
  const personaMatch = path.match(/^\/api\/personas\/([^/]+)$/);
  if (personaMatch) {
    const id = personaMatch[1];

    if (method === 'GET') {
      const persona = getPersona(db, id);
      return persona ? json(persona) : json({ error: 'Not found' }, 404);
    }

    if (method === 'PUT') {
      if (context) {
        const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (denied) return denied;
      }
      return handleUpdatePersona(req, db, id);
    }

    if (method === 'DELETE') {
      if (context) {
        const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (denied) return denied;
      }
      const deleted = deletePersona(db, id);
      if (!deleted) return json({ error: 'Not found' }, 404);
      return json({ ok: true });
    }
  }

  // ─── Agent-Persona Assignment ──────────────────────────────────────────

  // GET /api/agents/:id/personas
  const agentPersonasGet = path.match(/^\/api\/agents\/([^/]+)\/personas$/);
  if (agentPersonasGet && method === 'GET') {
    const agentId = agentPersonasGet[1];
    const agent = getAgent(db, agentId, tenantId);
    if (!agent) return json({ error: 'Agent not found' }, 404);
    return json(getAgentPersonas(db, agentId));
  }

  // POST /api/agents/:id/personas
  if (agentPersonasGet && method === 'POST') {
    if (context) {
      const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (denied) return denied;
    }
    return handleAssignPersona(req, db, agentPersonasGet[1], tenantId);
  }

  // DELETE /api/agents/:id/personas/:personaId
  const agentPersonaDelete = path.match(/^\/api\/agents\/([^/]+)\/personas\/([^/]+)$/);
  if (agentPersonaDelete && method === 'DELETE') {
    if (context) {
      const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
      if (denied) return denied;
    }
    const agentId = agentPersonaDelete[1];
    const personaId = agentPersonaDelete[2];
    const agent = getAgent(db, agentId, tenantId);
    if (!agent) return json({ error: 'Agent not found' }, 404);

    const removed = unassignPersona(db, agentId, personaId);
    if (!removed) return json({ error: 'Assignment not found' }, 404);
    return json({ ok: true });
  }

  // ─── Singular /persona endpoint (upsert + assign for agent) ────────────

  const singularMatch = path.match(/^\/api\/agents\/([^/]+)\/persona$/);
  if (singularMatch) {
    const agentId = singularMatch[1];

    // GET /api/agents/:id/persona — returns first persona or null
    if (method === 'GET') {
      const agent = getAgent(db, agentId, tenantId);
      if (!agent) return json({ error: 'Agent not found' }, 404);

      const personas = getAgentPersonas(db, agentId);
      return json(personas[0] ?? null);
    }

    // PUT /api/agents/:id/persona — upsert persona and assign to agent
    if (method === 'PUT') {
      if (context) {
        const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (denied) return denied;
      }
      return handleUpsertAgentPersona(req, db, agentId, tenantId);
    }

    // DELETE /api/agents/:id/persona — unassign all personas from agent
    if (method === 'DELETE') {
      if (context) {
        const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (denied) return denied;
      }
      const agent = getAgent(db, agentId, tenantId);
      if (!agent) return json({ error: 'Agent not found' }, 404);

      const personas = getAgentPersonas(db, agentId);
      for (const p of personas) {
        unassignPersona(db, agentId, p.id);
        deletePersona(db, p.id);
      }
      return json({ ok: true });
    }
  }

  return null;
}

async function handleCreatePersona(req: Request, db: Database): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, CreatePersonaSchema);
    const textToScan = [data.voiceGuidelines, data.background, ...(data.exampleMessages ?? [])]
      .filter(Boolean)
      .join(' ');
    if (textToScan) {
      const injectionDenied = checkInjection(db, textToScan, 'persona_create', req);
      if (injectionDenied) return injectionDenied;
    }
    const persona = createPersona(db, data);
    return json(persona, 201);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

async function handleUpdatePersona(req: Request, db: Database, id: string): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, UpdatePersonaSchema);
    const textToScan = [data.voiceGuidelines, data.background, ...(data.exampleMessages ?? [])]
      .filter(Boolean)
      .join(' ');
    if (textToScan) {
      const injectionDenied = checkInjection(db, textToScan, 'persona_update', req);
      if (injectionDenied) return injectionDenied;
    }
    const persona = updatePersona(db, id, data);
    if (!persona) return json({ error: 'Not found' }, 404);
    return json(persona);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

async function handleAssignPersona(req: Request, db: Database, agentId: string, tenantId: string): Promise<Response> {
  try {
    const agent = getAgent(db, agentId, tenantId);
    if (!agent) return json({ error: 'Agent not found' }, 404);

    const data = await parseBodyOrThrow(req, AssignPersonaSchema);
    const assigned = assignPersona(db, agentId, data.personaId, data.sortOrder ?? 0);
    if (!assigned) return json({ error: 'Persona not found' }, 404);
    return json({ ok: true }, 201);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

async function handleUpsertAgentPersona(
  req: Request,
  db: Database,
  agentId: string,
  tenantId: string,
): Promise<Response> {
  try {
    const agent = getAgent(db, agentId, tenantId);
    if (!agent) return json({ error: 'Agent not found' }, 404);

    const data = await parseBodyOrThrow(req, UpdatePersonaSchema);
    const textToScan = [data.voiceGuidelines, data.background, ...(data.exampleMessages ?? [])]
      .filter(Boolean)
      .join(' ');
    if (textToScan) {
      const injectionDenied = checkInjection(db, textToScan, 'persona_upsert', req);
      if (injectionDenied) return injectionDenied;
    }

    // Check if agent already has a persona assigned
    const existing = getAgentPersonas(db, agentId);
    if (existing.length > 0) {
      // Update the existing persona
      const updated = updatePersona(db, existing[0].id, data);
      return json(updated);
    }

    // Create a new persona and assign it
    const persona = createPersona(db, {
      name: `${agent.name} Persona`,
      archetype: data.archetype,
      traits: data.traits,
      voiceGuidelines: data.voiceGuidelines,
      background: data.background,
      exampleMessages: data.exampleMessages,
    });
    assignPersona(db, agentId, persona.id);
    return json(persona, 201);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}
