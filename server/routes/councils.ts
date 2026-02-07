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
    insertDiscussionMessage,
    getDiscussionMessages,
    updateCouncilLaunchDiscussionRound,
    updateDiscussionMessageTxid,
} from '../db/councils';
import { createSession, getSessionMessages, listSessionsByCouncilLaunch } from '../db/sessions';
import { getAgent } from '../db/agents';
import { getProject } from '../db/projects';
import type { ProcessManager, EventCallback } from '../process/manager';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { CouncilLogLevel, CouncilLaunchLog, CouncilDiscussionMessage } from '../../shared/types';
import { createLogger } from '../lib/logger';
import { parseBodyOrThrow, ValidationError, CreateCouncilSchema, UpdateCouncilSchema, LaunchCouncilSchema } from '../lib/validation';

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

type DiscussionMessageCallback = (message: CouncilDiscussionMessage) => void;
const discussionMessageListeners = new Set<DiscussionMessageCallback>();

export function onCouncilDiscussionMessage(cb: DiscussionMessageCallback): () => void {
    discussionMessageListeners.add(cb);
    return () => { discussionMessageListeners.delete(cb); };
}

function broadcastDiscussionMessage(message: CouncilDiscussionMessage): void {
    for (const cb of discussionMessageListeners) {
        try { cb(message); } catch { /* ignore */ }
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
    agentMessenger?: AgentMessenger | null,
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

        if (action === 'discussion-messages' && method === 'GET') {
            const launch = getCouncilLaunch(db, launchId);
            if (!launch) return json({ error: 'Not found' }, 404);
            return json(getDiscussionMessages(db, launchId));
        }

        if (action === 'abort' && method === 'POST') {
            return handleAbort(db, processManager, launchId);
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
        return handleLaunch(req, db, processManager, id, agentMessenger ?? null);
    }

    if (action === 'launches' && method === 'GET') {
        return json(listCouncilLaunches(db, id));
    }

    return null;
}

// ─── CRUD handlers ────────────────────────────────────────────────────────────

async function handleCreateCouncil(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateCouncilSchema);
        const council = createCouncil(db, data);
        return json(council, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}

async function handleUpdateCouncil(req: Request, db: Database, id: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateCouncilSchema);
        const council = updateCouncil(db, id, data);
        return council ? json(council) : json({ error: 'Not found' }, 404);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}

// ─── Launch handler ───────────────────────────────────────────────────────────

/** Launch result returned by the extracted launchCouncil() helper. */
export interface LaunchCouncilResult {
    launchId: string;
    sessionIds: string[];
}

/**
 * Core council launch logic extracted for reuse by both the REST API and
 * the AlgoChat `/council` command.
 */
export function launchCouncil(
    db: Database,
    processManager: ProcessManager,
    councilId: string,
    projectId: string,
    prompt: string,
    agentMessenger: AgentMessenger | null,
): LaunchCouncilResult {
    const council = getCouncil(db, councilId);
    if (!council) throw new Error('Council not found');

    const project = getProject(db, projectId);
    if (!project) throw new Error('Project not found');

    const launchId = crypto.randomUUID();
    createCouncilLaunch(db, { id: launchId, councilId, projectId, prompt });
    // Set total discussion rounds upfront so the UI knows from the start
    updateCouncilLaunchDiscussionRound(db, launchId, 0, council.discussionRounds ?? 2);

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

    // Auto-advance: watch for all member sessions to finish, then trigger discussion/review
    watchSessionsForAutoAdvance(db, processManager, launchId, sessionIds, 'member', agentMessenger);

    return { launchId, sessionIds };
}

async function handleLaunch(
    req: Request,
    db: Database,
    processManager: ProcessManager,
    councilId: string,
    agentMessenger: AgentMessenger | null,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, LaunchCouncilSchema);

        const result = launchCouncil(db, processManager, councilId, data.projectId, data.prompt, agentMessenger);
        return json(result, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        const msg = err instanceof Error ? err.message : String(err);
        // Preserve proper HTTP status codes for not-found errors
        const isNotFound = msg === 'Council not found' || msg === 'Project not found';
        return json({ error: msg }, isNotFound ? 404 : 400);
    }
}

// ─── Extracted stage-transition logic ─────────────────────────────────────────

function triggerReview(
    db: Database,
    processManager: ProcessManager,
    launchId: string,
): { ok: true; reviewSessionIds: string[] } | { ok: false; error: string; status: number } {
    const launch = getCouncilLaunch(db, launchId);
    if (!launch) return { ok: false, error: 'Launch not found', status: 404 };

    if (launch.stage !== 'responding' && launch.stage !== 'discussing') {
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

/**
 * Collect the last assistant response from each source session, labelled by agent name.
 * Prefers reviewer sessions over member sessions when both exist.
 */
function aggregateSessionResponses(db: Database, allSessions: ReturnType<typeof listSessionsByCouncilLaunch>): string[] {
    const reviewSessions = allSessions.filter((s) => s.councilRole === 'reviewer');
    const memberSessions = allSessions.filter((s) => s.councilRole === 'member');
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
    return parts;
}

function finishWithAggregatedSynthesis(db: Database, launchId: string): void {
    const allSessions = listSessionsByCouncilLaunch(db, launchId);
    const parts = aggregateSessionResponses(db, allSessions);

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

    // Collect discussion messages if any
    const discussionMsgs = getDiscussionMessages(db, launchId);
    const discussionSection = discussionMsgs.length > 0
        ? `\n\n## Council Discussion\n\n${formatDiscussionMessages(discussionMsgs)}`
        : '';

    const synthesisPrompt = `You are the chairman of a council. Your job is to produce a final, synthesized answer based on the council's responses, discussion, and peer reviews.

Original question: "${launch.prompt}"

## Council Responses

${memberResponses}${discussionSection}

## Peer Reviews

${reviewSummaries}

## Your Task

Produce a final, comprehensive answer that incorporates the best elements from all responses, discussion points, and addresses any concerns raised in the reviews. Be thorough and balanced.`;

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

function handleAbort(db: Database, processManager: ProcessManager, launchId: string): Response {
    const launch = getCouncilLaunch(db, launchId);
    if (!launch) return json({ error: 'Launch not found' }, 404);
    if (launch.stage === 'complete') return json({ error: 'Launch already complete' }, 400);

    emitLog(db, launchId, 'warn', `Council manually ended from stage '${launch.stage}'`);

    // Kill all running sessions for this launch
    const allSessions = listSessionsByCouncilLaunch(db, launchId);
    let killed = 0;
    for (const session of allSessions) {
        if (processManager.isRunning(session.id)) {
            processManager.stopProcess(session.id);
            killed++;
        }
    }
    emitLog(db, launchId, 'info', `Stopped ${killed} running session(s)`);

    // Aggregate whatever responses exist (prefer reviews > member responses)
    const parts = aggregateSessionResponses(db, allSessions);

    const synthesis = parts.length > 0
        ? `[Council ended manually]\n\n${parts.join('\n\n---\n\n')}`
        : '[Council ended manually] (No responses were produced)';

    updateCouncilLaunchStage(db, launchId, 'complete', synthesis);
    emitLog(db, launchId, 'stage', 'Council ended manually', `Aggregated ${parts.length} response(s)`);
    broadcastStageChange(launchId, 'complete');

    return json({ ok: true, killed, aggregated: parts.length });
}

// ─── Discussion orchestration ─────────────────────────────────────────────────

function triggerDiscussion(
    db: Database,
    processManager: ProcessManager,
    agentMessenger: AgentMessenger | null,
    launchId: string,
): void {
    const launch = getCouncilLaunch(db, launchId);
    if (!launch) return;
    if (launch.stage === 'discussing') {
        emitLog(db, launchId, 'info', 'Discussion already in progress, skipping');
        return;
    }
    if (launch.stage !== 'responding') return;

    const council = getCouncil(db, launch.councilId);
    if (!council) return;

    const discussionRounds = council.discussionRounds ?? 2;

    // If 0 rounds, skip directly to review (backward compat)
    if (discussionRounds === 0) {
        emitLog(db, launchId, 'info', 'Discussion rounds set to 0, skipping to review');
        const result = triggerReview(db, processManager, launchId);
        if (!result.ok) {
            emitLog(db, launchId, 'warn', `Auto-review failed: ${result.error}`);
        }
        return;
    }

    // Collect member responses
    const memberSessions = listSessionsByCouncilLaunch(db, launchId)
        .filter((s) => s.councilRole === 'member');

    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const memberResponses: { agentId: string; agentName: string; label: string; content: string }[] = [];

    for (let i = 0; i < memberSessions.length; i++) {
        const session = memberSessions[i];
        const messages = getSessionMessages(db, session.id);
        const assistantMsgs = messages.filter((m) => m.role === 'assistant');
        const lastMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
        const agent = getAgent(db, session.agentId ?? '');
        memberResponses.push({
            agentId: session.agentId ?? '',
            agentName: agent?.name ?? session.agentId?.slice(0, 8) ?? 'Agent',
            label: `Response ${labels[i] ?? String(i + 1)}`,
            content: lastMsg?.content ?? '(no response)',
        });
    }

    updateCouncilLaunchDiscussionRound(db, launchId, 1, discussionRounds);
    updateCouncilLaunchStage(db, launchId, 'discussing');
    broadcastStageChange(launchId, 'discussing');
    emitLog(db, launchId, 'stage', `Starting discussion stage`, `${discussionRounds} rounds, ${council.agentIds.length} agents`);

    // Run discussion rounds asynchronously
    runDiscussionRounds(db, processManager, agentMessenger, launchId, launch.prompt, memberResponses, discussionRounds, council)
        .catch((err) => {
            const errMsg = err instanceof Error ? err.message : String(err);
            emitLog(db, launchId, 'error', 'Discussion rounds failed', errMsg);
            // Fall through to review anyway
            const result = triggerReview(db, processManager, launchId);
            if (!result.ok) {
                emitLog(db, launchId, 'warn', `Fallback review failed: ${result.error}`);
            }
        });
}

async function runDiscussionRounds(
    db: Database,
    processManager: ProcessManager,
    agentMessenger: AgentMessenger | null,
    launchId: string,
    originalPrompt: string,
    memberResponses: { agentId: string; agentName: string; label: string; content: string }[],
    totalRounds: number,
    council: import('../../shared/types').Council,
): Promise<void> {
    const discussionStartTime = Date.now();

    for (let round = 1; round <= totalRounds; round++) {
        // Check overall discussion timeout
        if (Date.now() - discussionStartTime > DISCUSSION_TOTAL_TIMEOUT_MS) {
            emitLog(db, launchId, 'warn', `Discussion timed out after ${Math.round((Date.now() - discussionStartTime) / 60000)} minutes, skipping remaining rounds`);
            break;
        }
        updateCouncilLaunchDiscussionRound(db, launchId, round);
        broadcastStageChange(launchId, 'discussing');
        emitLog(db, launchId, 'info', `Discussion round ${round}/${totalRounds}`);

        const priorDiscussion = getDiscussionMessages(db, launchId);
        const discusserSessionIds: string[] = [];

        // Get the project ID from the launch
        const currentLaunch = getCouncilLaunch(db, launchId);
        const projectId = currentLaunch?.projectId ?? '';

        // Map agentId → sessionId for agents that successfully started
        const agentSessionMap = new Map<string, string>();

        for (let i = 0; i < council.agentIds.length; i++) {
            const agentId = council.agentIds[i];
            const agent = getAgent(db, agentId);
            const agentName = agent?.name ?? agentId.slice(0, 8);
            const prompt = buildDiscussionPrompt(originalPrompt, memberResponses, priorDiscussion, round);

            const session = createSession(db, {
                projectId,
                agentId,
                name: `Discussion R${round}: ${council.name} - ${agentName}`,
                initialPrompt: prompt,
                councilLaunchId: launchId,
                councilRole: 'discusser' as const,
            });

            try {
                processManager.startProcess(session);
                discusserSessionIds.push(session.id);
                agentSessionMap.set(agentId, session.id);
                emitLog(db, launchId, 'info', `Started discusser session for ${agentName} (R${round})`, session.id);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                emitLog(db, launchId, 'error', `Failed to start discusser for ${agentName}`, errMsg);
            }

            // Stagger process spawns to avoid overwhelming the API
            if (i < council.agentIds.length - 1) {
                await new Promise((r) => setTimeout(r, 500));
            }
        }

        // Wait for all successfully started discusser sessions to finish
        if (discusserSessionIds.length === 0) {
            emitLog(db, launchId, 'warn', `No discusser sessions started for round ${round}/${totalRounds}`);
        } else {
            await waitForSessions(processManager, discusserSessionIds);
        }

        // Extract responses and store as discussion messages
        for (const agentId of council.agentIds) {
            const sessionId = agentSessionMap.get(agentId);
            const agent = getAgent(db, agentId);
            const agentName = agent?.name ?? agentId.slice(0, 8);

            if (!sessionId) {
                // Session failed to start — insert a placeholder message
                const discMsg = insertDiscussionMessage(db, {
                    launchId,
                    agentId,
                    agentName,
                    round,
                    content: '(agent session failed to start)',
                });
                broadcastDiscussionMessage(discMsg);
                continue;
            }

            const messages = getSessionMessages(db, sessionId);
            const assistantMsgs = messages.filter((m) => m.role === 'assistant');
            const lastMsg = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
            const content = lastMsg?.content ?? '(no discussion response)';

            const discMsg = insertDiscussionMessage(db, {
                launchId,
                agentId,
                agentName,
                round,
                content,
                sessionId,
            });

            broadcastDiscussionMessage(discMsg);

            // Best-effort on-chain send (fire-and-forget)
            if (agentMessenger) {
                sendDiscussionOnChain(agentMessenger, agentId, council.agentIds, content, discMsg.id, db).catch(() => {
                    // Ignore on-chain failures
                });
            }
        }
    }

    // All rounds complete — advance to review
    emitLog(db, launchId, 'info', `All ${totalRounds} discussion rounds complete, advancing to review`);
    const result = triggerReview(db, processManager, launchId);
    if (!result.ok) {
        emitLog(db, launchId, 'warn', `Post-discussion review failed: ${result.error}`);
    }
}

function buildDiscussionPrompt(
    originalPrompt: string,
    memberResponses: { agentId: string; agentName: string; label: string; content: string }[],
    priorDiscussion: CouncilDiscussionMessage[],
    round: number,
): string {
    const responsesText = memberResponses
        .map((r) => `### ${r.agentName} (${r.label})\n${r.content}`)
        .join('\n\n---\n\n');

    let priorText = '';
    if (priorDiscussion.length > 0) {
        priorText = `\n\n## Prior Discussion (includes all participants, including your own previous messages)\n\n${formatDiscussionMessages(priorDiscussion)}`;
    }

    return `You are participating in a council discussion (Round ${round}).

## Original Question
${originalPrompt}

## Member Responses
${responsesText}${priorText}

## Your Task
React to the other members' responses. You may:
- Ask clarifying questions
- Challenge points you disagree with
- Build on ideas you find promising
- Propose alternatives

Keep your response focused and concise.`;
}

function formatDiscussionMessages(messages: CouncilDiscussionMessage[]): string {
    const byRound = new Map<number, CouncilDiscussionMessage[]>();
    for (const msg of messages) {
        const list = byRound.get(msg.round) ?? [];
        list.push(msg);
        byRound.set(msg.round, list);
    }

    const parts: string[] = [];
    for (const [round, msgs] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
        parts.push(`### Round ${round}\n\n${msgs.map((m) => `**${m.agentName}:** ${m.content}`).join('\n\n')}`);
    }
    return parts.join('\n\n---\n\n');
}

const DISCUSSION_SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per round
const DISCUSSION_TOTAL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes max for all rounds combined

function waitForSessions(processManager: ProcessManager, sessionIds: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
        let settled = false;
        const pending = new Set(sessionIds);
        const callbacks = new Map<string, EventCallback>();

        const finish = (): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            for (const [sid, cb] of callbacks) {
                processManager.unsubscribe(sid, cb);
            }
            callbacks.clear();
            resolve();
        };

        const checkDone = (): void => {
            if (pending.size === 0) finish();
        };

        // Timeout: resolve even if some sessions are stuck
        const timer = setTimeout(() => {
            if (!settled) {
                const timedOut = Array.from(pending);
                log.warn(`waitForSessions timed out with ${timedOut.length} sessions still pending: ${timedOut.join(', ')}`);
                finish();
            }
        }, DISCUSSION_SESSION_TIMEOUT_MS);

        // Subscribe FIRST, then check isRunning — this closes the race window
        // where a process exits between the isRunning check and subscribe call.
        for (const sessionId of sessionIds) {
            const callback: EventCallback = (sid, event) => {
                if (sid !== sessionId) return;
                if (event.type === 'session_exited' || event.type === 'session_stopped') {
                    pending.delete(sessionId);
                    checkDone();
                }
            };
            callbacks.set(sessionId, callback);
            processManager.subscribe(sessionId, callback);

            // If the process already exited before we subscribed, handle it now
            if (!processManager.isRunning(sessionId)) {
                pending.delete(sessionId);
            }
        }

        checkDone();
    });
}

async function sendDiscussionOnChain(
    agentMessenger: AgentMessenger,
    fromAgentId: string,
    allAgentIds: string[],
    content: string,
    messageId: number,
    db: Database,
): Promise<void> {
    // Send to all other council members in parallel (best-effort)
    const sends = allAgentIds
        .filter((id) => id !== fromAgentId)
        .map((toAgentId) =>
            agentMessenger.sendOnChainBestEffort(fromAgentId, toAgentId, content)
        );

    if (sends.length === 0) return;

    const results = await Promise.allSettled(sends);
    const firstTxid = results
        .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled')
        .map((r) => r.value)
        .find((v) => v != null);

    if (firstTxid) {
        updateDiscussionMessageTxid(db, messageId, firstTxid);
    }
}

// ─── Auto-advance watcher ─────────────────────────────────────────────────────

function watchSessionsForAutoAdvance(
    db: Database,
    processManager: ProcessManager,
    launchId: string,
    sessionIds: string[],
    role: 'member' | 'reviewer',
    agentMessenger?: AgentMessenger | null,
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
            emitLog(db, launchId, 'info', 'All member sessions complete, auto-advancing to discussion');
            triggerDiscussion(db, processManager, agentMessenger ?? null, launchId);
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

    // Subscribe FIRST, then check isRunning — closes the race window where
    // a process exits between the isRunning check and the subscribe call.
    for (const sessionId of sessionIds) {
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

        // If the process already exited before we subscribed, handle it now
        if (!processManager.isRunning(sessionId)) {
            pending.delete(sessionId);
        }
    }

    checkAllDone();
}
