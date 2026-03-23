import type { Database } from 'bun:sqlite';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import {
    listPersonas, getPersona, createPersona, updatePersona, deletePersona,
    getAgentPersonas, assignPersona, unassignPersona,
} from '../db/personas';
import { getAgent } from '../db/agents';
import { checkInjection } from '../lib/injection-guard';
import { parseBodyOrThrow, ValidationError, CreatePersonaSchema, UpdatePersonaSchema, AssignPersonaSchema } from '../lib/validation';
import { json } from '../lib/response';

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

    // ─── Backward Compatibility ────────────────────────────────────────────

    // GET /api/agents/:id/persona (singular — returns first persona or null)
    const legacyGet = path.match(/^\/api\/agents\/([^/]+)\/persona$/);
    if (legacyGet && method === 'GET') {
        const agentId = legacyGet[1];
        const agent = getAgent(db, agentId, tenantId);
        if (!agent) return json({ error: 'Agent not found' }, 404);

        const personas = getAgentPersonas(db, agentId);
        return json(personas[0] ?? null);
    }

    return null;
}

async function handleCreatePersona(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreatePersonaSchema);
        const textToScan = [data.voiceGuidelines, data.background, ...(data.exampleMessages ?? [])].filter(Boolean).join(' ');
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
        const textToScan = [data.voiceGuidelines, data.background, ...(data.exampleMessages ?? [])].filter(Boolean).join(' ');
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
