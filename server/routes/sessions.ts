import type { Database } from 'bun:sqlite';
import {
    listSessions,
    getSession,
    createSession,
    updateSession,
    deleteSession,
    getSessionMessages,
    addSessionMessage,
} from '../db/sessions';
import { getSessionMetrics } from '../db/session-metrics';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import { createLogger } from '../lib/logger';
import { parseBodyOrThrow, ValidationError, CreateSessionSchema, UpdateSessionSchema, ResumeSessionSchema } from '../lib/validation';
import { json } from '../lib/response';
import { recordAudit } from '../db/audit';
import { getClientIp } from '../middleware/rate-limit';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import { checkInjection } from '../lib/injection-guard';
import { getAgent } from '../db/agents';
import { buildOllamaComplexityWarning } from '../lib/ollama-complexity-warning';

const log = createLogger('SessionRoutes');

export async function handleSessionRoutes(
    req: Request,
    url: URL,
    db: Database,
    processManager: ProcessManager,
    context?: RequestContext,
    workTaskService?: WorkTaskService | null,
): Promise<Response | null> {
    const path = url.pathname;
    const method = req.method;

    const tenantId = context?.tenantId ?? 'default';

    if (path === '/api/sessions' && method === 'GET') {
        const projectId = url.searchParams.get('projectId') ?? undefined;
        return json(listSessions(db, projectId, tenantId));
    }

    if (path === '/api/sessions' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleCreate(req, db, processManager, tenantId);
    }

    const match = path.match(/^\/api\/sessions\/([^/]+)(\/(.+))?$/);
    if (!match) return null;

    const id = match[1];
    const action = match[3];

    if (!action) {
        if (method === 'GET') {
            const session = getSession(db, id, tenantId);
            return session ? json(session) : json({ error: 'Not found' }, 404);
        }
        if (method === 'PUT') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleUpdate(req, db, id, tenantId);
        }
        if (method === 'DELETE') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            processManager.stopProcess(id);
            const deleted = deleteSession(db, id, tenantId);
            return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
        }
    }

    if (action === 'messages' && method === 'GET') {
        return json(getSessionMessages(db, id, tenantId));
    }

    if (action === 'messages' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleAddMessage(req, db, id, tenantId);
    }

    if (action === 'stop' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleStop(req, db, processManager, id, tenantId);
    }

    if (action === 'resume' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleResume(req, db, processManager, id, tenantId);
    }

    if (action === 'escalate' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleEscalate(req, db, id, tenantId, workTaskService ?? null);
    }

    return null;
}

async function handleCreate(
    req: Request,
    db: Database,
    processManager: ProcessManager,
    tenantId: string = 'default',
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateSessionSchema);
        if (data.initialPrompt) {
            const injectionDenied = checkInjection(db, data.initialPrompt, 'session_create', req);
            if (injectionDenied) return injectionDenied;
        }
        const session = createSession(db, data, tenantId);

        const ip = getClientIp(req);
        recordAudit(db, 'session_create', ip, 'session', session.id, null, null, ip);

        if (data.initialPrompt) {
            try {
                processManager.startProcess(session);
            } catch (err) {
                log.error('Failed to start process', { sessionId: session.id, error: err instanceof Error ? err.message : String(err) });
                // Session is still created, just not started
            }
        }

        // Advisory: warn when Ollama model is used for a complex task.
        // Non-blocking — task proceeds regardless.
        let complexityWarning: string | undefined;
        if (data.agentId && data.initialPrompt) {
            const agent = getAgent(db, data.agentId, tenantId);
            if (agent) {
                const warning = buildOllamaComplexityWarning(
                    data.initialPrompt,
                    agent.model,
                    agent.provider,
                );
                if (warning) {
                    complexityWarning = warning;
                    log.warn('Ollama complexity advisory', { sessionId: session.id, model: agent.model, warning });
                    const ip = getClientIp(req);
                    recordAudit(db, 'session_ollama_complexity_warning', ip, 'session', session.id, JSON.stringify({ model: agent.model, provider: agent.provider }), null, ip);
                }
            }
        }

        return json(complexityWarning ? { ...session, complexityWarning } : session, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleAddMessage(req: Request, db: Database, id: string, tenantId: string): Promise<Response> {
    try {
        const session = getSession(db, id, tenantId);
        if (!session) return json({ error: 'Not found' }, 404);
        const body = await req.json() as { role?: string; content?: string };
        const role = body?.role;
        const content = body?.content;
        if (typeof role !== 'string' || !role) return json({ error: 'role is required' }, 400);
        if (typeof content !== 'string' || !content) return json({ error: 'content is required' }, 400);
        if (role !== 'user' && role !== 'assistant' && role !== 'system') {
            return json({ error: 'role must be user, assistant, or system' }, 400);
        }
        const message = addSessionMessage(db, id, role, content);
        return json(message, 201);
    } catch (err) {
        log.error('Failed to add session message', { error: err instanceof Error ? err.message : String(err) });
        return json({ error: 'Failed to add message' }, 500);
    }
}

async function handleUpdate(req: Request, db: Database, id: string, tenantId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateSessionSchema);
        const session = updateSession(db, id, data, tenantId);
        return session ? json(session) : json({ error: 'Not found' }, 404);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

function handleStop(
    req: Request,
    db: Database,
    processManager: ProcessManager,
    id: string,
    tenantId: string,
): Response {
    const session = getSession(db, id, tenantId);
    if (!session) return json({ error: 'Not found' }, 404);

    const ip = getClientIp(req);
    recordAudit(db, 'session_kill', ip, 'session', id, null, null, ip);

    processManager.stopProcess(id);
    return json({ ok: true });
}

async function handleResume(
    req: Request,
    db: Database,
    processManager: ProcessManager,
    id: string,
    tenantId: string,
): Promise<Response> {
    const session = getSession(db, id, tenantId);
    if (!session) return json({ error: 'Not found' }, 404);

    let prompt: string | undefined;
    try {
        const data = await parseBodyOrThrow(req, ResumeSessionSchema);
        prompt = data?.prompt;
    } catch {
        // Empty body is fine for resume
    }
    if (prompt) {
        const injectionDenied = checkInjection(db, prompt, 'session_resume', req);
        if (injectionDenied) return injectionDenied;
    }
    try {
        processManager.resumeProcess(session, prompt);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to resume process', { sessionId: session.id, error: message });
        return json({ ok: false, error: `Failed to resume: ${message}` }, 500);
    }
    return json({ ok: true });
}

/**
 * POST /api/sessions/:id/escalate
 * Creates a work task from a stalled session, retrying the original prompt
 * at a higher model tier.
 */
async function handleEscalate(
    req: Request,
    db: Database,
    sessionId: string,
    tenantId: string,
    workTaskService: WorkTaskService | null,
): Promise<Response> {
    if (!workTaskService) {
        return json({ error: 'Work task service not available' }, 503);
    }

    const session = getSession(db, sessionId, tenantId);
    if (!session) return json({ error: 'Session not found' }, 404);

    // Check session metrics for stall detection (use most recent metrics entry)
    const allMetrics = getSessionMetrics(db, sessionId);
    const metrics = allMetrics[allMetrics.length - 1];
    if (!metrics) {
        return json({ error: 'No metrics found for session — cannot determine escalation eligibility' }, 400);
    }

    const stallReasons = new Set(['stall_repeat', 'stall_same_tool', 'max_iterations']);
    if (!stallReasons.has(metrics.terminationReason) && !metrics.stallDetected) {
        return json({ error: 'Session did not stall — escalation not applicable' }, 400);
    }

    if (!session.agentId) {
        return json({ error: 'Session has no agent — cannot create work task' }, 400);
    }

    // Parse optional body for model tier override
    let modelTier: string | undefined;
    try {
        const body = await req.json() as { modelTier?: string };
        modelTier = body?.modelTier;
    } catch {
        // Empty body is fine
    }

    const prompt = session.initialPrompt || 'Continue the previous task.';
    const description = `[Escalated from session ${sessionId}] ${prompt.slice(0, 500)}`;

    try {
        const task = await workTaskService.create({
            agentId: session.agentId,
            description,
            projectId: session.projectId ?? undefined,
            source: 'web',
            sourceId: sessionId,
            modelTier: modelTier || 'sonnet',
            requesterInfo: {
                escalatedFrom: sessionId,
                originalTier: metrics.tier,
                stallType: metrics.stallType,
                terminationReason: metrics.terminationReason,
            },
        });

        const ip = getClientIp(req);
        recordAudit(db, 'work_task_create', ip, 'session', sessionId, null, null, ip);

        log.info('Session escalated to work task', {
            sessionId,
            taskId: task.id,
            fromTier: metrics.tier,
            toTier: modelTier || 'sonnet',
        });

        return json({
            ok: true,
            taskId: task.id,
            escalatedFrom: sessionId,
            modelTier: modelTier || 'sonnet',
        }, 201);
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error('Failed to escalate session', { sessionId, error: errorMsg });
        return json({ error: `Escalation failed: ${errorMsg}` }, 500);
    }
}
