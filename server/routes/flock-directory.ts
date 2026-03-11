/**
 * Flock Directory routes — Agent registry CRUD, search, heartbeat.
 */
import type { Database } from 'bun:sqlite';
import type { FlockDirectoryService } from '../flock-directory/service';
import type { RequestContext } from '../middleware/guards';
import type { FlockAgentStatus } from '../../shared/types/flock-directory';
import { json, badRequest, notFound, handleRouteError, safeNumParam } from '../lib/response';
import { parseBodyOrThrow, ValidationError, AlgorandAddressSchema, isAlgorandAddressFormat } from '../lib/validation';
import { z } from 'zod';

const RegisterAgentSchema = z.object({
    address: AlgorandAddressSchema,
    name: z.string().min(1),
    description: z.string().optional(),
    instanceUrl: z.string().url().optional(),
    capabilities: z.array(z.string()).optional(),
});

const UpdateAgentSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    instanceUrl: z.string().url().nullable().optional(),
    capabilities: z.array(z.string()).optional(),
});

export function handleFlockDirectoryRoutes(
    req: Request,
    url: URL,
    _db: Database,
    flockDirectory?: FlockDirectoryService | null,
    _context?: RequestContext,
): Response | Promise<Response> | null {
    if (!url.pathname.startsWith('/api/flock-directory')) return null;
    if (!flockDirectory) {
        return json({ error: 'Flock Directory not available' }, 503);
    }

    const path = url.pathname;
    const method = req.method;

    // ─── Search ──────────────────────────────────────────────────────────────

    if (path === '/api/flock-directory/search' && method === 'GET') {
        const query = url.searchParams.get('q') ?? undefined;
        const status = url.searchParams.get('status') as FlockAgentStatus | undefined;
        const capability = url.searchParams.get('capability') ?? undefined;
        const minRepParam = url.searchParams.get('minReputation');
        const minReputation = minRepParam !== null ? safeNumParam(minRepParam, 0) : undefined;
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam !== null ? safeNumParam(limitParam, 50) : undefined;
        const offsetParam = url.searchParams.get('offset');
        const offset = offsetParam !== null ? safeNumParam(offsetParam, 0) : undefined;

        return json(flockDirectory.search({
            query, status, capability, minReputation, limit, offset,
        }));
    }

    // ─── Stats ──────────────────────────────────────────────────────────────

    if (path === '/api/flock-directory/stats' && method === 'GET') {
        return json(flockDirectory.getStats());
    }

    // ─── List active agents ─────────────────────────────────────────────────

    if (path === '/api/flock-directory/agents' && method === 'GET') {
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam !== null ? safeNumParam(limitParam, 100) : undefined;
        const offsetParam = url.searchParams.get('offset');
        const offset = offsetParam !== null ? safeNumParam(offsetParam, 0) : undefined;
        return json(flockDirectory.listActive(limit, offset));
    }

    // ─── Register ───────────────────────────────────────────────────────────

    if (path === '/api/flock-directory/agents' && method === 'POST') {
        return (async () => {
            try {
                const body = await parseBodyOrThrow(req, RegisterAgentSchema);
                const agent = flockDirectory.register(body);
                return json(agent, 201);
            } catch (err) {
                if (err instanceof ValidationError) return badRequest(err.message);
                return handleRouteError(err);
            }
        })();
    }

    // ─── Lookup by ID ───────────────────────────────────────────────────────

    const agentMatch = path.match(/^\/api\/flock-directory\/agents\/([^/]+)$/);
    if (agentMatch) {
        const agentId = agentMatch[1];

        if (method === 'GET') {
            const agent = flockDirectory.getById(agentId);
            if (!agent) return notFound('Agent not found');
            return json(agent);
        }

        if (method === 'PATCH') {
            return (async () => {
                try {
                    const body = await parseBodyOrThrow(req, UpdateAgentSchema);
                    const updated = flockDirectory.update(agentId, body);
                    if (!updated) return notFound('Agent not found');
                    return json(updated);
                } catch (err) {
                    if (err instanceof ValidationError) return badRequest(err.message);
                    return handleRouteError(err);
                }
            })();
        }

        if (method === 'DELETE') {
            const ok = flockDirectory.deregister(agentId);
            if (!ok) return notFound('Agent not found or already deregistered');
            return json({ ok: true });
        }
    }

    // ─── Heartbeat ──────────────────────────────────────────────────────────

    const heartbeatMatch = path.match(/^\/api\/flock-directory\/agents\/([^/]+)\/heartbeat$/);
    if (heartbeatMatch && method === 'POST') {
        const ok = flockDirectory.heartbeat(heartbeatMatch[1]);
        if (!ok) return notFound('Agent not found');
        return json({ ok: true });
    }

    // ─── Lookup by address ──────────────────────────────────────────────────

    const addressMatch = path.match(/^\/api\/flock-directory\/lookup\/([^/]+)$/);
    if (addressMatch && method === 'GET') {
        const address = decodeURIComponent(addressMatch[1]).toUpperCase();
        if (!isAlgorandAddressFormat(address)) {
            return badRequest('Invalid Algorand address format');
        }
        const agent = flockDirectory.getByAddress(address);
        if (!agent) return notFound('Agent not found');
        return json(agent);
    }

    return null;
}
