/**
 * Sandbox routes — Container management and policy configuration.
 */
import type { Database } from 'bun:sqlite';
import type { SandboxManager } from '../sandbox/manager';
import { getAgentPolicy, setAgentPolicy, removeAgentPolicy, listAgentPolicies } from '../sandbox/policy';
import { json, badRequest, notFound, handleRouteError } from '../lib/response';

export function handleSandboxRoutes(
    req: Request,
    url: URL,
    db: Database,
    sandboxManager?: SandboxManager | null,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

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

        if (method === 'GET') {
            const policy = getAgentPolicy(db, agentId);
            return json(policy);
        }

        if (method === 'PUT') {
            return handleSetPolicy(req, db, agentId);
        }

        if (method === 'DELETE') {
            const removed = removeAgentPolicy(db, agentId);
            return removed ? json({ ok: true }) : notFound('No policy found for agent');
        }
    }

    // Assign container to session
    const assignMatch = path.match(/^\/api\/sandbox\/assign$/);
    if (assignMatch && method === 'POST') {
        return handleAssign(req, sandboxManager);
    }

    // Release container
    const releaseMatch = path.match(/^\/api\/sandbox\/release\/([^/]+)$/);
    if (releaseMatch && method === 'POST') {
        return handleRelease(releaseMatch[1], sandboxManager);
    }

    return null;
}

async function handleSetPolicy(req: Request, db: Database, agentId: string): Promise<Response> {
    try {
        const body = await req.json() as Record<string, unknown>;
        const limits: Record<string, unknown> = {};

        if (typeof body.cpuLimit === 'number') limits.cpuLimit = body.cpuLimit;
        if (typeof body.memoryLimitMb === 'number') limits.memoryLimitMb = body.memoryLimitMb;
        if (typeof body.networkPolicy === 'string') limits.networkPolicy = body.networkPolicy;
        if (typeof body.timeoutSeconds === 'number') limits.timeoutSeconds = body.timeoutSeconds;

        setAgentPolicy(db, agentId, limits as Record<string, number | string>);
        return json(getAgentPolicy(db, agentId));
    } catch (err) {
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
        const body = await req.json() as { agentId: string; sessionId: string; workDir?: string };

        if (!body.agentId || !body.sessionId) {
            return badRequest('agentId and sessionId are required');
        }

        const containerId = await sandboxManager.assignContainer(
            body.agentId,
            body.sessionId,
            body.workDir,
        );

        return json({ containerId }, 201);
    } catch (err) {
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
