import type { Database } from 'bun:sqlite';
import { addToAllowlist, listAllowlist, removeFromAllowlist, updateAllowlistEntry } from '../db/allowlist';
import { json } from '../lib/response';
import {
  AddAllowlistSchema,
  isAlgorandAddressFormat,
  parseBodyOrThrow,
  UpdateAllowlistSchema,
  ValidationError,
} from '../lib/validation';

let _algosdk: typeof import('algosdk').default | null = null;
async function getAlgosdk() {
  if (!_algosdk) _algosdk = (await import('algosdk')).default;
  return _algosdk;
}

export function handleAllowlistRoutes(req: Request, url: URL, db: Database): Response | Promise<Response> | null {
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
  if (!isAlgorandAddressFormat(address)) {
    return json({ error: 'Invalid Algorand address format' }, 400);
  }

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
    // Schema already trims/uppercases and validates format; checksum validation below
    const algosdk = await getAlgosdk();
    if (!algosdk.isValidAddress(data.address)) {
      return json({ error: 'Invalid Algorand address checksum' }, 400);
    }
    const entry = addToAllowlist(db, data.address, data.label);
    return json(entry, 201);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}

async function handleUpdate(req: Request, db: Database, address: string): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, UpdateAllowlistSchema);

    const entry = updateAllowlistEntry(db, address, String(data.label));
    return entry ? json(entry) : json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }
}
