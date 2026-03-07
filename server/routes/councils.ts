import type { Database } from 'bun:sqlite';
import {
    listCouncils,
    getCouncil,
    createCouncil,
    updateCouncil,
    deleteCouncil,
    listCouncilLaunches,
    getCouncilLaunch,
    getCouncilLaunchLogs,
    getDiscussionMessages,
} from '../db/councils';
import type { ProcessManager } from '../process/manager';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import { parseBodyOrThrow, ValidationError, CreateCouncilSchema, UpdateCouncilSchema, LaunchCouncilSchema, CouncilChatSchema } from '../lib/validation';
import { json, handleRouteError } from '../lib/response';
import { NotFoundError } from '../lib/errors';
import {
    launchCouncil,
    triggerReview,
    triggerSynthesis,
    abortCouncil,
    startCouncilChat,
    onCouncilStageChange,
    onCouncilLog,
    onCouncilDiscussionMessage,
    onCouncilAgentError,
} from '../councils/discussion';
import type { LaunchCouncilResult } from '../councils/discussion';
import { waitForSessions, HEARTBEAT_INTERVAL_MS, SAFETY_TIMEOUT_MS } from '../councils/wait-sessions';
import type { WaitForSessionsResult, WaitForSessionsOptions } from '../councils/wait-sessions';

// Re-export business logic and types for external consumers
export { launchCouncil, onCouncilStageChange, onCouncilLog, onCouncilDiscussionMessage, onCouncilAgentError, waitForSessions, HEARTBEAT_INTERVAL_MS, SAFETY_TIMEOUT_MS };
export type { LaunchCouncilResult, WaitForSessionsResult, WaitForSessionsOptions };

// ─── Route handler ────────────────────────────────────────────────────────────

export function handleCouncilRoutes(
    req: Request,
    url: URL,
    db: Database,
    processManager: ProcessManager,
    agentMessenger?: AgentMessenger | null,
    context?: RequestContext,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;
    const tenantId = context?.tenantId ?? 'default';

    // Council CRUD
    if (path === '/api/councils' && method === 'GET') {
        return json(listCouncils(db, tenantId));
    }

    if (path === '/api/councils' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleCreateCouncil(req, db, tenantId);
    }

    // Council launches list (optional councilId filter)
    if (path === '/api/council-launches' && method === 'GET') {
        const councilId = url.searchParams.get('councilId') ?? undefined;
        return json(listCouncilLaunches(db, councilId, tenantId));
    }

    // Council launch by ID
    const launchMatch = path.match(/^\/api\/council-launches\/([^/]+)(\/(.+))?$/);
    if (launchMatch) {
        const launchId = launchMatch[1];
        const action = launchMatch[3];

        if (!action && method === 'GET') {
            const launch = getCouncilLaunch(db, launchId, tenantId);
            return launch ? json(launch) : json({ error: 'Not found' }, 404);
        }

        if (action === 'logs' && method === 'GET') {
            const launch = getCouncilLaunch(db, launchId, tenantId);
            if (!launch) return json({ error: 'Not found' }, 404);
            return json(getCouncilLaunchLogs(db, launchId));
        }

        if (action === 'discussion-messages' && method === 'GET') {
            const launch = getCouncilLaunch(db, launchId, tenantId);
            if (!launch) return json({ error: 'Not found' }, 404);
            return json(getDiscussionMessages(db, launchId));
        }

        if (action === 'abort' && method === 'POST') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleAbort(db, processManager, launchId);
        }

        if (action === 'review' && method === 'POST') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleReview(db, processManager, launchId);
        }

        if (action === 'synthesize' && method === 'POST') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleSynthesize(db, processManager, launchId);
        }

        if (action === 'chat' && method === 'POST') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleCouncilChat(req, db, processManager, launchId);
        }
    }

    // Single council routes
    const councilMatch = path.match(/^\/api\/councils\/([^/]+)(\/(.+))?$/);
    if (!councilMatch) return null;

    const id = councilMatch[1];
    const action = councilMatch[3];

    if (!action) {
        if (method === 'GET') {
            const council = getCouncil(db, id, tenantId);
            return council ? json(council) : json({ error: 'Not found' }, 404);
        }
        if (method === 'PUT') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleUpdateCouncil(req, db, id, tenantId);
        }
        if (method === 'DELETE') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            const deleted = deleteCouncil(db, id, tenantId);
            return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
        }
    }

    if (action === 'launch' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleLaunch(req, db, processManager, id, agentMessenger ?? null);
    }

    if (action === 'launches' && method === 'GET') {
        return json(listCouncilLaunches(db, id, tenantId));
    }

    return null;
}

// ─── CRUD handlers ────────────────────────────────────────────────────────────

async function handleCreateCouncil(req: Request, db: Database, tenantId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateCouncilSchema);
        const council = createCouncil(db, data, tenantId);
        return json(council, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleUpdateCouncil(req: Request, db: Database, id: string, tenantId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateCouncilSchema);
        const council = updateCouncil(db, id, data, tenantId);
        return council ? json(council) : json({ error: 'Not found' }, 404);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

// ─── Launch handler ───────────────────────────────────────────────────────────

async function handleLaunch(
    req: Request,
    db: Database,
    processManager: ProcessManager,
    councilId: string,
    agentMessenger: AgentMessenger | null,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, LaunchCouncilSchema);

        const result = launchCouncil(db, processManager, councilId, data.projectId, data.prompt, agentMessenger, {
            voteType: data.voteType,
            affectedPaths: data.affectedPaths,
        });
        return json(result, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        // Preserve proper HTTP status codes for known not-found errors
        if (err instanceof NotFoundError) {
            return json({ error: 'Not found' }, 404);
        }
        return handleRouteError(err);
    }
}

// ─── HTTP handlers that delegate to extracted logic ───────────────────────────

function handleReview(db: Database, processManager: ProcessManager, launchId: string): Response {
    const result = triggerReview(db, processManager, launchId);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ launchId, reviewSessionIds: result.reviewSessionIds });
}

function handleSynthesize(db: Database, processManager: ProcessManager, launchId: string): Response {
    const result = triggerSynthesis(db, processManager, launchId);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ launchId, synthesisSessionId: result.synthesisSessionId });
}

function handleAbort(db: Database, processManager: ProcessManager, launchId: string): Response {
    const result = abortCouncil(db, processManager, launchId);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ ok: true, killed: result.killed, aggregated: result.aggregated });
}

async function handleCouncilChat(
    req: Request,
    db: Database,
    processManager: ProcessManager,
    launchId: string,
): Promise<Response> {
    let body: { message: string };
    try {
        body = await parseBodyOrThrow(req, CouncilChatSchema);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }

    const result = startCouncilChat(db, processManager, launchId, body.message);
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ sessionId: result.sessionId, created: result.created }, result.created ? 201 : 200);
}
