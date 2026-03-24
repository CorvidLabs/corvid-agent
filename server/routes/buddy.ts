/**
 * Buddy mode REST API routes.
 *
 * Manages buddy pairings (which agents can pair) and
 * buddy sessions (active/completed buddy conversations).
 */

import type { Database } from 'bun:sqlite';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import {
    createBuddyPairing,
    getBuddyPairing,
    listBuddyPairings,
    updateBuddyPairing,
    deleteBuddyPairing,
    listBuddySessions,
    getBuddySession,
    listBuddyMessages,
} from '../db/buddy';
import { getAgent } from '../db/agents';
import { json } from '../lib/response';
import type { BuddyRole } from '../../shared/types/buddy';

export function handleBuddyRoutes(
    req: Request,
    url: URL,
    db: Database,
    context?: RequestContext,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;
    const tenantId = context?.tenantId ?? 'default';

    // ─── Buddy Pairings (per-agent) ─────────────────────────────────────

    // GET /api/agents/:id/buddy-pairings
    const pairingsListMatch = path.match(/^\/api\/agents\/([^/]+)\/buddy-pairings$/);
    if (pairingsListMatch && method === 'GET') {
        const agentId = pairingsListMatch[1];
        const agent = getAgent(db, agentId, tenantId);
        if (!agent) return json({ error: 'Agent not found' }, 404);
        return json(listBuddyPairings(db, agentId));
    }

    // POST /api/agents/:id/buddy-pairings
    if (pairingsListMatch && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleCreatePairing(req, db, pairingsListMatch[1], tenantId);
    }

    // GET/PUT/DELETE /api/buddy-pairings/:id
    const pairingMatch = path.match(/^\/api\/buddy-pairings\/([^/]+)$/);
    if (pairingMatch) {
        const id = pairingMatch[1];

        if (method === 'GET') {
            const pairing = getBuddyPairing(db, id);
            return pairing ? json(pairing) : json({ error: 'Not found' }, 404);
        }

        if (method === 'PUT') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleUpdatePairing(req, db, id);
        }

        if (method === 'DELETE') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            deleteBuddyPairing(db, id);
            return json({ ok: true });
        }
    }

    // ─── Buddy Sessions ─────────────────────────────────────────────────

    // GET /api/buddy-sessions
    if (path === '/api/buddy-sessions' && method === 'GET') {
        const leadAgentId = url.searchParams.get('leadAgentId') ?? undefined;
        const buddyAgentId = url.searchParams.get('buddyAgentId') ?? undefined;
        const workTaskId = url.searchParams.get('workTaskId') ?? undefined;
        const status = url.searchParams.get('status') as 'active' | 'completed' | 'failed' | undefined;
        const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
        return json(listBuddySessions(db, { leadAgentId, buddyAgentId, workTaskId, status, limit }));
    }

    // GET /api/buddy-sessions/:id
    const sessionMatch = path.match(/^\/api\/buddy-sessions\/([^/]+)$/);
    if (sessionMatch && method === 'GET') {
        const session = getBuddySession(db, sessionMatch[1]);
        return session ? json(session) : json({ error: 'Not found' }, 404);
    }

    // GET /api/buddy-sessions/:id/messages
    const messagesMatch = path.match(/^\/api\/buddy-sessions\/([^/]+)\/messages$/);
    if (messagesMatch && method === 'GET') {
        const session = getBuddySession(db, messagesMatch[1]);
        if (!session) return json({ error: 'Session not found' }, 404);
        return json(listBuddyMessages(db, messagesMatch[1]));
    }

    return null;
}

async function handleCreatePairing(
    req: Request,
    db: Database,
    agentId: string,
    tenantId: string,
): Promise<Response> {
    const agent = getAgent(db, agentId, tenantId);
    if (!agent) return json({ error: 'Agent not found' }, 404);

    const body = await req.json() as { buddyAgentId?: string; maxRounds?: number; buddyRole?: BuddyRole };
    if (!body.buddyAgentId) return json({ error: 'buddyAgentId is required' }, 400);

    const buddyAgent = getAgent(db, body.buddyAgentId, tenantId);
    if (!buddyAgent) return json({ error: 'Buddy agent not found' }, 404);

    if (agentId === body.buddyAgentId) return json({ error: 'An agent cannot be its own buddy' }, 400);

    try {
        const pairing = createBuddyPairing(db, agentId, body.buddyAgentId, {
            maxRounds: body.maxRounds,
            buddyRole: body.buddyRole,
        });
        return json(pairing, 201);
    } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE')) {
            return json({ error: 'Pairing already exists' }, 409);
        }
        throw err;
    }
}

async function handleUpdatePairing(
    req: Request,
    db: Database,
    id: string,
): Promise<Response> {
    const pairing = getBuddyPairing(db, id);
    if (!pairing) return json({ error: 'Not found' }, 404);

    const body = await req.json() as { enabled?: boolean; maxRounds?: number; buddyRole?: BuddyRole };
    updateBuddyPairing(db, id, body);
    const updated = getBuddyPairing(db, id);
    return json(updated);
}
