import type { Database } from 'bun:sqlite';
import {
    listCouncils,
    getCouncil,
    createCouncil,
    updateCouncil,
    deleteCouncil,
    createCouncilLaunch,
    getCouncilLaunch,
    listCouncilLaunches,
    updateCouncilLaunchStage,
    addCouncilLaunchLog,
    getCouncilLaunchLogs,
} from '../db/councils';
import { createSession, getSessionMessages, listSessionsByCouncilLaunch } from '../db/sessions';
import { getAgent } from '../db/agents';
import { getProject } from '../db/projects';
import type { ProcessManager, EventCallback } from '../process/manager';
import type { CouncilLogLevel, CouncilLaunchLog } from '../../shared/types';
import { createLogger } from '../lib/logger';

const log = createLogger('CouncilRoutes');

// ─── WS broadcast callbacks ──────────────────────────────────────────────────

type StageChangeCallback = (launchId: string, stage: string, sessionIds?: string[]) => void;
const stageChangeListeners = new Set<StageChangeCallback>();

export function onCouncilStageChange(cb: StageChangeCallback): () => void {
    stageChangeListeners.add(cb);
    return () => { stageChangeListeners.delete(cb); };
}

function broadcastStageChange(launchId: string, stage: string, sessionIds?: string[]): void {
    for (const cb of stageChangeListeners) {
        try { cb(launchId, stage, sessionIds); } catch { /* ignore */ }
    }
}

type LogCallback = (logEntry: CouncilLaunchLog) => void;
const logListeners = new Set<LogCallback>();

export function onCouncilLog(cb: LogCallback): () => void {
    logListeners.add(cb);
    return () => { logListeners.delete(cb); };
}

function broadcastLog(entry: CouncilLaunchLog): void {
    for (const cb of logListeners) {
        try { cb(entry); } catch { /* ignore */ }
    }
}

/** Persist a log entry and broadcast it to WS clients. */
function emitLog(db: Database, launchId: string, level: CouncilLogLevel, message: string, detail?: string): void {
    const entry = addCouncilLaunchLog(db, launchId, level, message, detail);
    broadcastLog(entry);
    // Also log to server console
    if (level === 'error') log.error(message, detail ? { detail } : undefined);
    else if (level === 'warn') log.warn(message, detail ? { detail } : undefined);
    else log.info(message, detail ? { detail } : undefined);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export function handleCouncilRoutes(
    req: Request,
    url: URL,
    db: Database,
    processManager: ProcessManager,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    // Council CRUD
    if (path === '/api/councils' && method === 'GET') {
        return json(listCouncils(db));
    }

    if (path === '/api/councils' && method === 'POST') {
        return handleCreateCouncil(req, db);
    }

    // Council launches list (optional councilId filter)
    if (path === '/api/council-launches' && method === 'GET') {
        const councilId = url.searchParams.get('councilId') ?? undefined;
        return json(listCouncilLaunches(db, councilId));
    }

    // Council launch by ID
    const launchMatch = path.match(/^\/api\/council-launches\/([^/]+)(\/(.+))?$/);
    if (launchMatch) {
        const launchId = launchMatch[1];
        const action = launchMatch[3];

        if (!action && method === 'GET') {
            const launch = getCouncilLaunch(db, launchId);
            return launch ? json(launch) : json({ error: 'Not found' }, 404);
        }

        if (action === 'logs' && method === 'GET') {
            const launch = getCouncilLaunch(db, launchId);
            if (!launch) return json({ error: 'Not found' }, 404);
            return json(getCouncilLaunchLogs(db, launchId));
        }

        if (action === 'review' && method === 'POST') {
            return handleReview(db, processManager, launchId);
        }

        if (action === 'synthesize' && method === 'POST') {
            return handleSynthesize(db, processManager, launchId);
        }
    }

    // Single council routes
    const councilMatch = path.match(/^\/api\/councils\/([^/]+)(\/(.+))?$/);
    if (!councilMatch) return null;

    const id = councilMatch[1];
    const action = councilMatch[3];

    if (!action) {
        if (method === 'GET') {
            const council = getCouncil(db, id);
            return council ? json(council) : json({ error: 'Not found' }, 404);
        }
        if (method === 'PUT') {
            return handleUpdateCouncil(req, db, id);
        }
        if (method === 'DELETE') {
            const deleted = deleteCouncil(db, id);
            return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
        }
    }

    if (action === 'launch' && method === 'POST') {
        return handleLaunch(req, db, processManager, id);
    }

    if (action === 'launches' && method === 'GET') {
        return json(listCouncilLaunches(db, id));
    }

    return null;
}

// ─── CRUD handlers ────────────────────────────────────────────────────────────

async function handleCreateCouncil(req: Request, db: Database): Promise<Response> {
    const body = await req.json();
    if (!body.name) {
        return json({ error: 'name is required' }, 400);
    }
    if (!Array.isArray(body.agentIds) || body.agentIds.length === 0) {
        return json({ error: 'agentIds must be a non-empty array' }, 400);
    }
    const council = createCouncil(db, body);
    return json(council, 201);
}

async function handleUpdateCouncil(req: Request, db: Database, id: string): Promise<Response> {
    const body = await req.json();
    const council = updateCouncil(db, id, body);
    return council ? json(council) : json({ error: 'Not found' }, 404);
}

// ─── Launch handler ───────────────────────────────────────────────────────────

async function handleLaunch(
    req: Request,
    db: Database,
    processManager: ProcessManager,
    councilId: string,
): Promise<Response> {
    const council = getCouncil(db, councilId);
    if (!council) return json({ error: 'Council not found' }, 404);

    const body = await req.json();
    const { projectId, prompt } = body;
    if (!projectId || !prompt) {
        return json({ error: 'projectId and prompt are required' }, 400);
    }

    const project = getProject(db, projectId);
    if (!project) return json({ error: 'Project not found' }, 404);

    const launchId = crypto.randomUUID();
    createCouncilLaunch(db, { id: launchId, councilId, projectId, prompt });

    emitLog(db, launchId, 'stage', `Council "${council.name}" launched`, `${council.agentIds.length} agents, prompt: "${prompt.slice(0, 100)}"`);

    const sessionIds: string[] = [];

    for (const agentId of council.agentIds) {
        const agent = getAgent(db, agentId);
        const agentName = agent?.name ?? agentId.slice(0, 8);
        const session = createSession(db, {
            projectId,
            agentId,
            name: `Council: ${council.name} - ${agentName}`,
            initialPrompt: prompt,
            councilLaunchId: launchId,
            councilRole: 'member',
        });
        sessionIds.push(session.id);

        try {
            processManager.startProcess(session);
            emitLog(db, launchId, 'info', `Started member session for ${agentName}`, session.id);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            emitLog(db, launchId, 'error', `Failed to start session for ${agentName}`, errMsg);
        }
    }

    // Auto-advance: watch for all member sessions to finish, then trigger review
    watchSessionsForAutoAdvance(db, processManager, launchId, sessionIds, 'member');

    return json({ launchId, sessionIds }, 201);
}

// ─── Extracted stage-transition logic ─────────────────────────────────────────

function triggerReview(
    db: Database,
    processManager: ProcessManager,
    launchId: string,
): { ok: true; reviewSessionIds: string[] } | { ok: false; error: string; status: number } {
    const launch = getCouncilLaunch(db, launchId);
    if (!launch) return { ok: false, error: 'Launch not found', status: 404 };

    if (launch.stage !== 'responding') {
        return { ok: false, error: `Cannot start review from stage '${launch.stage}'`, status: 400 };
    }

    const council = getCouncil(db, launch.councilId);
    if (!council) return { ok: false, error: 'Council not found', status: 404 };

    emitLog(db, launchId, 'stage', 'Starting peer review stage', `${council.agentIds.length} reviewers`);

    // Collect final assistant messages from each member session
    const memberSessions = listSessionsByCouncilLaunch(db, launchId)
        .filter((s) => s.councilRole === 'member');

    const responses: { agentId: string; label: string; content: string }[] = [];
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (let i = 0; i < memberSessions.length; i++) {
        const session = memberSessions[i];
        const messages = getSessionMessages(db, session.id);
        const assistantMsgs = messages.filter((m) => m.role === 'assistant');
        const lastMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
        const contentLen = lastMsg?.content?.length ?? 0;
        const agent = getAgent(db, session.agentId ?? '');
        emitLog(db, launchId, 'info', `Collected response from ${agent?.name ?? 'agent'}`, `${contentLen} chars`);
        responses.push({
            agentId: session.agentId ?? '',
            label: `Response ${labels[i] ?? String(i + 1)}`,
            content: lastMsg?.content ?? '(no response)',
        });
    }

    // Create review sessions for each agent
    const reviewSessionIds: string[] = [];

    for (let i = 0; i < council.agentIds.length; i++) {
        const agentId = council.agentIds[i];
        const otherResponses = responses
            .filter((r) => r.agentId !== agentId)
            .map((r) => `${r.label}:\n${r.content}`)
            .join('\n\n---\n\n');

        const reviewPrompt = `You are reviewing responses to the following question:\n\n"${launch.prompt}"\n\nBelow are anonymized responses from other council members. For each response, rate it 1-10 and explain your reasoning. Then provide your own improved answer.\n\n${otherResponses}`;

        const agent = getAgent(db, agentId);
        const agentName = agent?.name ?? agentId.slice(0, 8);
        const session = createSession(db, {
            projectId: launch.projectId,
            agentId,
            name: `Review: ${council.name} - ${agentName}`,
            initialPrompt: reviewPrompt,
            councilLaunchId: launchId,
            councilRole: 'reviewer',
        });
        reviewSessionIds.push(session.id);

        try {
            processManager.startProcess(session);
            emitLog(db, launchId, 'info', `Started reviewer session for ${agentName}`, session.id);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            emitLog(db, launchId, 'error', `Failed to start reviewer for ${agentName}`, errMsg);
        }
    }

    updateCouncilLaunchStage(db, launchId, 'reviewing');
    broadcastStageChange(launchId, 'reviewing', reviewSessionIds);

    // Auto-advance: watch reviewer sessions for completion, then trigger synthesis
    watchSessionsForAutoAdvance(db, processManager, launchId, reviewSessionIds, 'reviewer');

    return { ok: true, reviewSessionIds };
}

function finishWithAggregatedSynthesis(db: Database, launchId: string): void {
    const allSessions = listSessionsByCouncilLaunch(db, launchId);
    const reviewSessions = allSessions.filter((s) => s.councilRole === 'reviewer');
    const memberSessions = allSessions.filter((s) => s.councilRole === 'member');

    // Prefer review content; fall back to member responses
    const sourceSessions = reviewSessions.length > 0 ? reviewSessions : memberSessions;

    const parts: string[] = [];
    for (const session of sourceSessions) {
        const messages = getSessionMessages(db, session.id);
        const assistantMsgs = messages.filter((m) => m.role === 'assistant');
        const lastMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
        if (lastMsg?.content) {
            const agent = getAgent(db, session.agentId ?? '');
            const label = agent?.name ?? session.agentId?.slice(0, 8) ?? 'Agent';
            parts.push(`### ${label}\n\n${lastMsg.content}`);
        }
    }

    const synthesis = parts.length > 0
        ? parts.join('\n\n---\n\n')
        : '(No responses were produced by council members)';

    updateCouncilLaunchStage(db, launchId, 'complete', synthesis);
    emitLog(db, launchId, 'stage', 'Council complete', `Aggregated synthesis from ${parts.length} responses`);
    broadcastStageChange(launchId, 'complete');
}

function triggerSynthesis(
    db: Database,
    processManager: ProcessManager,
    launchId: string,
    chairmanOverride?: string,
): { ok: true; synthesisSessionId: string } | { ok: false; error: string; status: number } {
    const launch = getCouncilLaunch(db, launchId);
    if (!launch) return { ok: false, error: 'Launch not found', status: 404 };

    if (launch.stage !== 'reviewing') {
        return { ok: false, error: `Cannot synthesize from stage '${launch.stage}'`, status: 400 };
    }

    const council = getCouncil(db, launch.councilId);
    if (!council) return { ok: false, error: 'Council not found', status: 404 };

    const chairmanAgentId = chairmanOverride ?? council.chairmanAgentId;
    if (!chairmanAgentId) {
        return { ok: false, error: 'Council has no chairman agent assigned', status: 400 };
    }

    const chairmanAgent = getAgent(db, chairmanAgentId);
    emitLog(db, launchId, 'stage', 'Starting synthesis stage', `Chairman: ${chairmanAgent?.name ?? 'unknown'}`);

    const allSessions = listSessionsByCouncilLaunch(db, launchId);
    const memberSessions = allSessions.filter((s) => s.councilRole === 'member');
    const reviewSessions = allSessions.filter((s) => s.councilRole === 'reviewer');

    // Collect member responses
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const memberResponses = memberSessions.map((s, i) => {
        const messages = getSessionMessages(db, s.id);
        const assistantMsgs = messages.filter((m) => m.role === 'assistant');
        const lastMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
        return `Response ${labels[i] ?? String(i + 1)}:\n${lastMsg?.content ?? '(no response)'}`;
    }).join('\n\n---\n\n');

    // Collect review summaries
    const reviewSummaries = reviewSessions.map((s) => {
        const agent = getAgent(db, s.agentId ?? '');
        const messages = getSessionMessages(db, s.id);
        const assistantMsgs = messages.filter((m) => m.role === 'assistant');
        const lastMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
        return `Review by ${agent?.name ?? 'Agent'}:\n${lastMsg?.content ?? '(no review)'}`;
    }).join('\n\n---\n\n');

    const synthesisPrompt = `You are the chairman of a council. Your job is to produce a final, synthesized answer based on the council's responses and peer reviews.

Original question: "${launch.prompt}"

## Council Responses

${memberResponses}

## Peer Reviews

${reviewSummaries}

## Your Task

Produce a final, comprehensive answer that incorporates the best elements from all responses and addresses any concerns raised in the reviews. Be thorough and balanced.`;

    const session = createSession(db, {
        projectId: launch.projectId,
        agentId: chairmanAgentId,
        name: `Synthesis: ${council.name} - ${chairmanAgent?.name ?? 'Chairman'}`,
        initialPrompt: synthesisPrompt,
        councilLaunchId: launchId,
        councilRole: 'chairman',
    });

    // Watch for chairman session completion to store synthesis
    const callback: EventCallback = (sessionId, event) => {
        if (sessionId !== session.id) return;
        if (event.type === 'session_exited' || event.type === 'session_stopped') {
            const messages = getSessionMessages(db, session.id);
            const assistantMsgs = messages.filter((m) => m.role === 'assistant');
            const lastMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
            if (lastMsg) {
                updateCouncilLaunchStage(db, launchId, 'complete', lastMsg.content);
                emitLog(db, launchId, 'stage', 'Council complete', `Synthesis: ${lastMsg.content.length} chars`);
            } else {
                updateCouncilLaunchStage(db, launchId, 'complete', '(no synthesis produced)');
                emitLog(db, launchId, 'warn', 'Council complete — no synthesis produced');
            }
            broadcastStageChange(launchId, 'complete');
            processManager.unsubscribe(session.id, callback);
        }
    };

    processManager.subscribe(session.id, callback);

    try {
        processManager.startProcess(session);
        emitLog(db, launchId, 'info', `Started chairman session for ${chairmanAgent?.name ?? 'Chairman'}`, session.id);
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        emitLog(db, launchId, 'error', `Failed to start chairman session`, errMsg);
    }

    updateCouncilLaunchStage(db, launchId, 'synthesizing');
    broadcastStageChange(launchId, 'synthesizing', [session.id]);

    return { ok: true, synthesisSessionId: session.id };
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

// ─── Auto-advance watcher ─────────────────────────────────────────────────────

function watchSessionsForAutoAdvance(
    db: Database,
    processManager: ProcessManager,
    launchId: string,
    sessionIds: string[],
    role: 'member' | 'reviewer',
): void {
    const pending = new Set(sessionIds);
    const callbacks = new Map<string, EventCallback>();

    const checkAllDone = (): void => {
        if (pending.size > 0) return;

        // Clean up all subscriptions
        for (const [sid, cb] of callbacks) {
            processManager.unsubscribe(sid, cb);
        }
        callbacks.clear();

        // Verify launch is still in the expected stage before advancing
        const launch = getCouncilLaunch(db, launchId);
        if (!launch) return;

        if (role === 'member' && launch.stage === 'responding') {
            emitLog(db, launchId, 'info', 'All member sessions complete, auto-advancing to review');
            const result = triggerReview(db, processManager, launchId);
            if (!result.ok) {
                emitLog(db, launchId, 'warn', `Auto-review failed: ${result.error}`);
            }
        } else if (role === 'reviewer' && launch.stage === 'reviewing') {
            const council = getCouncil(db, launch.councilId);
            if (council?.chairmanAgentId) {
                emitLog(db, launchId, 'info', 'All reviewer sessions complete, auto-advancing to synthesis');
                const result = triggerSynthesis(db, processManager, launchId);
                if (!result.ok) {
                    emitLog(db, launchId, 'warn', `Auto-synthesis failed: ${result.error}`);
                }
            } else {
                // No chairman — use first agent as fallback synthesizer
                emitLog(db, launchId, 'info', 'No chairman set — using first agent as synthesizer');
                const firstAgentId = council?.agentIds[0];
                if (firstAgentId) {
                    const result = triggerSynthesis(db, processManager, launchId, firstAgentId);
                    if (!result.ok) {
                        emitLog(db, launchId, 'warn', `Auto-synthesis failed: ${result.error}`);
                        finishWithAggregatedSynthesis(db, launchId);
                    }
                } else {
                    finishWithAggregatedSynthesis(db, launchId);
                }
            }
        }
    };

    for (const sessionId of sessionIds) {
        if (!processManager.isRunning(sessionId)) {
            pending.delete(sessionId);
            continue;
        }

        const callback: EventCallback = (sid, event) => {
            if (sid !== sessionId) return;
            if (event.type === 'session_exited' || event.type === 'session_stopped') {
                pending.delete(sessionId);
                // Log session completion
                const roleLabel = role === 'member' ? 'Member' : 'Reviewer';
                emitLog(db, launchId, 'info', `${roleLabel} session exited`, `${pending.size} remaining`);
                checkAllDone();
            }
        };

        callbacks.set(sessionId, callback);
        processManager.subscribe(sessionId, callback);
    }

    checkAllDone();
}
