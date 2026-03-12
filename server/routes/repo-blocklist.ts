import type { Database } from 'bun:sqlite';
import {
    listRepoBlocklist,
    addToRepoBlocklist,
    removeFromRepoBlocklist,
} from '../db/repo-blocklist';
import { parseBodyOrThrow, ValidationError, AddRepoBlocklistSchema } from '../lib/validation';
import { json } from '../lib/response';
import type { RequestContext } from '../middleware/guards';

export function handleRepoBlocklistRoutes(
    req: Request,
    url: URL,
    db: Database,
    context: RequestContext,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;
    const tenantId = context.tenantId;

    if (path === '/api/repo-blocklist' && method === 'GET') {
        return json(listRepoBlocklist(db, tenantId));
    }

    if (path === '/api/repo-blocklist' && method === 'POST') {
        return handleAdd(req, db, tenantId);
    }

    const match = path.match(/^\/api\/repo-blocklist\/(.+)$/);
    if (!match) return null;

    const repo = decodeURIComponent(match[1]).toLowerCase();

    if (method === 'DELETE') {
        const deleted = removeFromRepoBlocklist(db, repo, tenantId);
        return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }

    return null;
}

async function handleAdd(req: Request, db: Database, tenantId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, AddRepoBlocklistSchema);
        const entry = addToRepoBlocklist(db, data.repo, {
            reason: data.reason,
            source: data.source,
            prUrl: data.prUrl,
            tenantId,
        });
        return json(entry, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}
