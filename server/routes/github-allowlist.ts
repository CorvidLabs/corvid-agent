import type { Database } from 'bun:sqlite';
import {
    listGitHubAllowlist,
    addToGitHubAllowlist,
    updateGitHubAllowlistEntry,
    removeFromGitHubAllowlist,
} from '../db/github-allowlist';
import { parseBodyOrThrow, ValidationError, AddGitHubAllowlistSchema, UpdateGitHubAllowlistSchema } from '../lib/validation';
import { json } from '../lib/response';

export function handleGitHubAllowlistRoutes(
    req: Request,
    url: URL,
    db: Database,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    if (path === '/api/github-allowlist' && method === 'GET') {
        return json(listGitHubAllowlist(db));
    }

    if (path === '/api/github-allowlist' && method === 'POST') {
        return handleAdd(req, db);
    }

    const match = path.match(/^\/api\/github-allowlist\/([^/]+)$/);
    if (!match) return null;

    const username = decodeURIComponent(match[1]).toLowerCase();

    if (method === 'PUT') {
        return handleUpdate(req, db, username);
    }

    if (method === 'DELETE') {
        const deleted = removeFromGitHubAllowlist(db, username);
        return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }

    return null;
}

async function handleAdd(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, AddGitHubAllowlistSchema);
        const entry = addToGitHubAllowlist(db, data.username, data.label);
        return json(entry, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleUpdate(req: Request, db: Database, username: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateGitHubAllowlistSchema);
        const entry = updateGitHubAllowlistEntry(db, username, String(data.label));
        return entry ? json(entry) : json({ error: 'Not found' }, 404);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}
