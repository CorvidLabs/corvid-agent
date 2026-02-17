import type { Database } from 'bun:sqlite';
import {
    listBundles, getBundle, createBundle, updateBundle, deleteBundle,
    getAgentBundles, assignBundle, unassignBundle,
} from '../db/skill-bundles';
import { getAgent } from '../db/agents';
import { parseBodyOrThrow, ValidationError, CreateSkillBundleSchema, UpdateSkillBundleSchema, AssignSkillBundleSchema } from '../lib/validation';
import { json } from '../lib/response';

export function handleSkillBundleRoutes(
    req: Request,
    url: URL,
    db: Database,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    // ─── Bundle CRUD ──────────────────────────────────────────────────────

    // GET /api/skill-bundles
    if (path === '/api/skill-bundles' && method === 'GET') {
        return json(listBundles(db));
    }

    // POST /api/skill-bundles
    if (path === '/api/skill-bundles' && method === 'POST') {
        return handleCreateBundle(req, db);
    }

    // GET/PUT/DELETE /api/skill-bundles/:id
    const bundleMatch = path.match(/^\/api\/skill-bundles\/([^/]+)$/);
    if (bundleMatch) {
        const id = bundleMatch[1];

        if (method === 'GET') {
            const bundle = getBundle(db, id);
            return bundle ? json(bundle) : json({ error: 'Not found' }, 404);
        }

        if (method === 'PUT') {
            return handleUpdateBundle(req, db, id);
        }

        if (method === 'DELETE') {
            const deleted = deleteBundle(db, id);
            if (!deleted) return json({ error: 'Not found or is a preset bundle' }, 404);
            return json({ ok: true });
        }
    }

    // ─── Agent-Bundle Assignment ──────────────────────────────────────────

    // GET /api/agents/:id/skills
    const agentSkillsGet = path.match(/^\/api\/agents\/([^/]+)\/skills$/);
    if (agentSkillsGet && method === 'GET') {
        const agentId = agentSkillsGet[1];
        const agent = getAgent(db, agentId);
        if (!agent) return json({ error: 'Agent not found' }, 404);
        return json(getAgentBundles(db, agentId));
    }

    // POST /api/agents/:id/skills
    if (agentSkillsGet && method === 'POST') {
        return handleAssignBundle(req, db, agentSkillsGet[1]);
    }

    // DELETE /api/agents/:id/skills/:bundleId
    const agentSkillDelete = path.match(/^\/api\/agents\/([^/]+)\/skills\/([^/]+)$/);
    if (agentSkillDelete && method === 'DELETE') {
        const agentId = agentSkillDelete[1];
        const bundleId = agentSkillDelete[2];
        const agent = getAgent(db, agentId);
        if (!agent) return json({ error: 'Agent not found' }, 404);

        const removed = unassignBundle(db, agentId, bundleId);
        if (!removed) return json({ error: 'Assignment not found' }, 404);
        return json({ ok: true });
    }

    return null;
}

async function handleCreateBundle(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateSkillBundleSchema);
        const bundle = createBundle(db, data);
        return json(bundle, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}

async function handleUpdateBundle(req: Request, db: Database, id: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateSkillBundleSchema);
        const bundle = updateBundle(db, id, data);
        if (!bundle) return json({ error: 'Not found' }, 404);
        return json(bundle);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}

async function handleAssignBundle(req: Request, db: Database, agentId: string): Promise<Response> {
    try {
        const agent = getAgent(db, agentId);
        if (!agent) return json({ error: 'Agent not found' }, 404);

        const data = await parseBodyOrThrow(req, AssignSkillBundleSchema);
        const assigned = assignBundle(db, agentId, data.bundleId, data.sortOrder ?? 0);
        if (!assigned) return json({ error: 'Bundle not found' }, 404);
        return json({ ok: true }, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}
