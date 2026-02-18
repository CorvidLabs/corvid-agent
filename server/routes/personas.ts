import type { Database } from 'bun:sqlite';
import { getPersona, upsertPersona, deletePersona } from '../db/personas';
import { getAgent } from '../db/agents';
import { parseBodyOrThrow, ValidationError, UpsertPersonaSchema } from '../lib/validation';
import { json } from '../lib/response';

export function handlePersonaRoutes(
    req: Request,
    url: URL,
    db: Database,
): Response | Promise<Response> | null {
    // GET /api/agents/:id/persona
    const getMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/persona$/);
    if (getMatch && req.method === 'GET') {
        const agentId = getMatch[1];
        const agent = getAgent(db, agentId);
        if (!agent) return json({ error: 'Agent not found' }, 404);

        const persona = getPersona(db, agentId);
        if (!persona) return json({ error: 'No persona set' }, 404);
        return json(persona);
    }

    // PUT /api/agents/:id/persona
    const putMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/persona$/);
    if (putMatch && req.method === 'PUT') {
        return handleUpsert(req, db, putMatch[1]);
    }

    // DELETE /api/agents/:id/persona
    const deleteMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/persona$/);
    if (deleteMatch && req.method === 'DELETE') {
        const agentId = deleteMatch[1];
        const agent = getAgent(db, agentId);
        if (!agent) return json({ error: 'Agent not found' }, 404);

        const deleted = deletePersona(db, agentId);
        if (!deleted) return json({ error: 'No persona to delete' }, 404);
        return json({ ok: true });
    }

    return null;
}

async function handleUpsert(req: Request, db: Database, agentId: string): Promise<Response> {
    try {
        const agent = getAgent(db, agentId);
        if (!agent) return json({ error: 'Agent not found' }, 404);

        const data = await parseBodyOrThrow(req, UpsertPersonaSchema);
        const persona = upsertPersona(db, agentId, data);
        return json(persona);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}
