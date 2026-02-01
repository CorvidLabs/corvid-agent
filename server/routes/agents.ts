import type { Database } from 'bun:sqlite';
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent } from '../db/agents';

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export function handleAgentRoutes(
    req: Request,
    url: URL,
    db: Database,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    if (path === '/api/agents' && method === 'GET') {
        return json(listAgents(db));
    }

    if (path === '/api/agents' && method === 'POST') {
        return handleCreate(req, db);
    }

    const match = path.match(/^\/api\/agents\/([^/]+)$/);
    if (!match) return null;

    const id = match[1];

    if (method === 'GET') {
        const agent = getAgent(db, id);
        return agent ? json(agent) : json({ error: 'Not found' }, 404);
    }

    if (method === 'PUT') {
        return handleUpdate(req, db, id);
    }

    if (method === 'DELETE') {
        const deleted = deleteAgent(db, id);
        return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }

    return null;
}

async function handleCreate(req: Request, db: Database): Promise<Response> {
    const body = await req.json();
    if (!body.name) {
        return json({ error: 'name is required' }, 400);
    }
    const agent = createAgent(db, body);
    return json(agent, 201);
}

async function handleUpdate(req: Request, db: Database, id: string): Promise<Response> {
    const body = await req.json();
    const agent = updateAgent(db, id, body);
    return agent ? json(agent) : json({ error: 'Not found' }, 404);
}
