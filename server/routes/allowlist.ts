import type { Database } from 'bun:sqlite';
import {
    listAllowlist,
    addToAllowlist,
    updateAllowlistEntry,
    removeFromAllowlist,
} from '../db/allowlist';
import { parseBodyOrThrow, ValidationError, AddAllowlistSchema, UpdateAllowlistSchema } from '../lib/validation';

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

let _algosdk: typeof import('algosdk').default | null = null;
async function getAlgosdk() {
    if (!_algosdk) _algosdk = (await import('algosdk')).default;
    return _algosdk;
}

export function handleAllowlistRoutes(
    req: Request,
    url: URL,
    db: Database,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    if (path === '/api/allowlist' && method === 'GET') {
        return json(listAllowlist(db));
    }

    if (path === '/api/allowlist' && method === 'POST') {
        return handleAdd(req, db);
    }

    const match = path.match(/^\/api\/allowlist\/([^/]+)$/);
    if (!match) return null;

    const address = decodeURIComponent(match[1]).toUpperCase();

    if (method === 'PUT') {
        return handleUpdate(req, db, address);
    }

    if (method === 'DELETE') {
        const deleted = removeFromAllowlist(db, address);
        return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }

    return null;
}

async function handleAdd(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, AddAllowlistSchema);

        const address = data.address.trim().toUpperCase();
        const algosdk = await getAlgosdk();
        if (!algosdk.isValidAddress(address)) {
            return json({ error: 'Invalid Algorand address' }, 400);
        }
        const entry = addToAllowlist(db, address, data.label);
        return json(entry, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}

async function handleUpdate(req: Request, db: Database, address: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateAllowlistSchema);

        const entry = updateAllowlistEntry(db, address, String(data.label));
        return entry ? json(entry) : json({ error: 'Not found' }, 404);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}
