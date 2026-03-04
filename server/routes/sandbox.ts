/**
 * Sandbox routes — Container management and policy configuration.
 */
import type { Database } from 'bun:sqlite';
import type { SandboxManager } from '../sandbox/manager';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import { getAgent } from '../db/agents';
import { getAgentPolicy, setAgentPolicy, removeAgentPolicy, listAgentPolicies } from '../sandbox/policy';
import { json, notFound, handleRouteError } from '../lib/response';
import { parseBodyOrThrow, ValidationError, SetSandboxPolicySchema, AssignSandboxSchema } from '../lib/validation';

export function handleSandboxRoutes(
    req: Request,
    url: URL,
    db: Database,
    sandboxManager?: SandboxManager | null,
    context?: RequestContext,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;
    const tenantId = context?.tenantId ?? 'default';

    // Pool stats
    if (path === '/api/sandbox/stats' && method === 'GET') {
        if (!sandboxManager || !sandboxManager.isEnabled()) {
            return json({ enabled: false, total: 0, warm: 0, assigned: 0, maxContainers: 0 });
        }
        return json(sandboxManager.getPoolStats());
    }

    // List all sandbox policies
    if (path === '/api/sandbox/policies' && method === 'GET') {
        return json(listAgentPolicies(db));
    }

    // Agent-specific policy
    const policyMatch = path.match(/^\/api\/sandbox\/policies\/([^/]+)$/);
    if (policyMatch) {
        const agentId = policyMatch[1];
        const agent = getAgent(db, agentId, tenantId);
        if (!agent) return json({ error: 'Agent not found' }, 404);

        if (method === 'GET') {
            const policy = getAgentPolicy(db, agentId);
            return json(policy);
        }

        if (method === 'PUT') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleSetPolicy(req, db, agentId);
        }

        if (method === 'DELETE') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            const removed = removeAgentPolicy(db, agentId);
            return removed ? json({ ok: true }) : notFound('No policy found for agent');
        }
    }

    // Assign container to session
    const assignMatch = path.match(/^\/api\/sandbox\/assign$/);
    if (assignMatch && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleAssign(req, sandboxManager);
    }

    // Release container
    const releaseMatch = path.match(/^\/api\/sandbox\/release\/([^/]+)$/);
    if (releaseMatch && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleRelease(releaseMatch[1], sandboxManager);
    }

    return null;
}

async function handleSetPolicy(req: Request, db: Database, agentId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, SetSandboxPolicySchema);
        setAgentPolicy(db, agentId, data as Record<string, number | string>);
        return json(getAgentPolicy(db, agentId));
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

async function handleAssign(
    req: Request,
    sandboxManager?: SandboxManager | null,
): Promise<Response> {
    if (!sandboxManager || !sandboxManager.isEnabled()) {
        return json({ error: 'Sandboxing is not enabled' }, 503);
    }

    try {
        const data = await parseBodyOrThrow(req, AssignSandboxSchema);

        const containerId = await sandboxManager.assignContainer(
            data.agentId,
            data.sessionId,
            data.workDir,
        );

        return json({ containerId }, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

async function handleRelease(
    sessionId: string,
    sandboxManager?: SandboxManager | null,
): Promise<Response> {
    if (!sandboxManager || !sandboxManager.isEnabled()) {
        return json({ error: 'Sandboxing is not enabled' }, 503);
    }

    try {
        await sandboxManager.releaseContainer(sessionId);
        return json({ ok: true });
    } catch (err) {
        return handleRouteError(err);
    }
}
