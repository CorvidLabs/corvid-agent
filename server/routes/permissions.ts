/**
 * Permission Broker API routes — manage capability grants for agents.
 *
 * All endpoints require ADMIN_API_KEY authentication (handled by the route guard).
 *
 * POST /api/permissions/grant      — Grant a capability to an agent
 * POST /api/permissions/revoke     — Revoke a specific grant or all grants for an agent
 * GET  /api/permissions/:agentId   — List active grants for an agent
 * POST /api/permissions/check      — Check if an agent can use a tool
 * POST /api/permissions/emergency-revoke — Revoke ALL grants for an agent immediately
 */

import type { Database } from 'bun:sqlite';
import { PermissionBroker } from '../permissions/broker';
import { TOOL_ACTION_MAP } from '../permissions/types';
import { json, badRequest, notFound } from '../lib/response';

export function handlePermissionRoutes(
    req: Request,
    url: URL,
    db: Database,
): Response | Promise<Response> | null {
    if (!url.pathname.startsWith('/api/permissions')) return null;

    const broker = new PermissionBroker(db);
    const method = req.method;

    // POST /api/permissions/grant
    if (url.pathname === '/api/permissions/grant' && method === 'POST') {
        return handleGrant(req, broker);
    }

    // POST /api/permissions/revoke
    if (url.pathname === '/api/permissions/revoke' && method === 'POST') {
        return handleRevoke(req, broker);
    }

    // POST /api/permissions/emergency-revoke
    if (url.pathname === '/api/permissions/emergency-revoke' && method === 'POST') {
        return handleEmergencyRevoke(req, broker);
    }

    // POST /api/permissions/check
    if (url.pathname === '/api/permissions/check' && method === 'POST') {
        return handleCheck(req, broker);
    }

    // GET /api/permissions/actions — list the action taxonomy
    if (url.pathname === '/api/permissions/actions' && method === 'GET') {
        return json({ actions: TOOL_ACTION_MAP });
    }

    // GET /api/permissions/:agentId — list active grants
    const agentMatch = url.pathname.match(/^\/api\/permissions\/([^/]+)$/);
    if (agentMatch && method === 'GET') {
        const agentId = agentMatch[1];
        const tenantId = url.searchParams.get('tenant_id') ?? 'default';
        const includeHistory = url.searchParams.get('history') === 'true';

        const grants = includeHistory
            ? broker.getGrantHistory(agentId, tenantId)
            : broker.getGrants(agentId, tenantId);

        return json({ agentId, grants, count: grants.length });
    }

    return notFound('Permission endpoint not found');
}

async function handleGrant(req: Request, broker: PermissionBroker): Promise<Response> {
    const body = await req.json().catch(() => null);
    if (!body) return badRequest('Invalid JSON body');

    const { agent_id, action, granted_by, reason, expires_at, tenant_id } = body;
    if (!agent_id || !action) return badRequest('agent_id and action are required');

    const grant = await broker.grant({
        agentId: agent_id,
        action,
        grantedBy: granted_by ?? 'api',
        reason: reason ?? '',
        expiresAt: expires_at ?? null,
        tenantId: tenant_id ?? 'default',
    });

    return json({ grant }, 201);
}

async function handleRevoke(req: Request, broker: PermissionBroker): Promise<Response> {
    const body = await req.json().catch(() => null);
    if (!body) return badRequest('Invalid JSON body');

    const { grant_id, agent_id, action, revoked_by, reason, tenant_id } = body;
    if (!grant_id && !agent_id) return badRequest('grant_id or agent_id is required');

    const affected = broker.revoke({
        grantId: grant_id,
        agentId: agent_id,
        action,
        revokedBy: revoked_by ?? 'api',
        reason,
        tenantId: tenant_id ?? 'default',
    });

    return json({ affected });
}

async function handleEmergencyRevoke(req: Request, broker: PermissionBroker): Promise<Response> {
    const body = await req.json().catch(() => null);
    if (!body) return badRequest('Invalid JSON body');

    const { agent_id, revoked_by, reason } = body;
    if (!agent_id) return badRequest('agent_id is required');

    const affected = broker.emergencyRevoke(
        agent_id,
        revoked_by ?? 'api',
        reason ?? 'Emergency revocation via API',
    );

    return json({ affected, emergency: true });
}

async function handleCheck(req: Request, broker: PermissionBroker): Promise<Response> {
    const body = await req.json().catch(() => null);
    if (!body) return badRequest('Invalid JSON body');

    const { agent_id, tool_name, session_id, tenant_id } = body;
    if (!agent_id || !tool_name) return badRequest('agent_id and tool_name are required');

    const result = await broker.checkTool(agent_id, tool_name, {
        sessionId: session_id,
        tenantId: tenant_id ?? 'default',
    });

    return json({ ...result });
}
