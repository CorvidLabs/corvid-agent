/**
 * Council discussion business logic — extracted from routes/councils.ts.
 *
 * Contains all council lifecycle orchestration: launch, discussion rounds,
 * review, synthesis, auto-advance, and session waiting utilities.
 * Route handlers remain in routes/councils.ts and delegate here.
 */

import type { Database } from 'bun:sqlite';
import {
    getCouncil,
    createCouncilLaunch,
    getCouncilLaunch,
    updateCouncilLaunchStage,
    addCouncilLaunchLog,
    insertDiscussionMessage,
    getDiscussionMessages,
    updateCouncilLaunchDiscussionRound,
    updateDiscussionMessageTxid,
    updateCouncilLaunchChatSession,
} from '../db/councils';
import { createSession, getSession, getSessionMessages, listSessionsByCouncilLaunch } from '../db/sessions';
import { getAgent } from '../db/agents';
import { getProject } from '../db/projects';
import type { ProcessManager, EventCallback } from '../process/manager';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { CouncilLogLevel, CouncilLaunchLog, CouncilDiscussionMessage } from '../../shared/types';
import { createLogger } from '../lib/logger';
import { getModelPricing } from '../providers/cost-table';
import { NotFoundError } from '../lib/errors';
import { createEventContext, runWithEventContext } from '../observability/event-context';

const log = createLogger('CouncilDiscussion');

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

// ─── Timeout constants ───────────────────────────────────────────────────────

// Per-agent timeout budget. For cloud providers agents run truly in parallel, so a single
// budget is sufficient. For local Ollama (serialized inference), the budget is multiplied
// by agent count to account for queueing.
const PER_AGENT_ROUND_BUDGET_MS = 10 * 60 * 1000; // 10 minutes per agent per round
const MIN_ROUND_TIMEOUT_MS = 10 * 60 * 1000; // minimum 10 minutes per round
const MAX_DISCUSSION_TOTAL_MS = 3 * 60 * 60 * 1000; // hard cap at 3 hours

// ─── Launch logic ────────────────────────────────────────────────────────────

/** Launch result returned by launchCouncil(). */
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
    const ctx = createEventContext('council');
    return runWithEventContext(ctx, () => {
    const council = getCouncil(db, councilId);
    if (!council) throw new NotFoundError("Council", councilId);

    const project = getProject(db, projectId);
    if (!project) throw new NotFoundError("Project", projectId);

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
    }); // runWithEventContext
}

// ─── Stage-transition logic ──────────────────────────────────────────────────

export function triggerReview(
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
export function aggregateSessionResponses(db: Database, allSessions: ReturnType<typeof listSessionsByCouncilLaunch>): string[] {
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

export function finishWithAggregatedSynthesis(db: Database, launchId: string): void {
    const allSessions = listSessionsByCouncilLaunch(db, launchId);
    const parts = aggregateSessionResponses(db, allSessions);

    const synthesis = parts.length > 0
        ? parts.join('\n\n---\n\n')
        : '(No responses were produced by council members)';

    updateCouncilLaunchStage(db, launchId, 'complete', synthesis);
    emitLog(db, launchId, 'stage', 'Council complete', `Aggregated synthesis from ${parts.length} responses`);
    broadcastStageChange(launchId, 'complete');
}

export function triggerSynthesis(
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

// ─── Abort logic ─────────────────────────────────────────────────────────────

export function abortCouncil(
    db: Database,
    processManager: ProcessManager,
    launchId: string,
): { ok: true; killed: number; aggregated: number } | { ok: false; error: string; status: number } {
    const launch = getCouncilLaunch(db, launchId);
    if (!launch) return { ok: false, error: 'Launch not found', status: 404 };
    if (launch.stage === 'complete') return { ok: false, error: 'Launch already complete', status: 400 };

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

    return { ok: true, killed, aggregated: parts.length };
}

// ─── Follow-up chat logic ────────────────────────────────────────────────────

export interface CouncilChatResult {
    ok: true;
    sessionId: string;
    created: boolean;
}

export interface CouncilChatError {
    ok: false;
    error: string;
    status: number;
}

export function startCouncilChat(
    db: Database,
    processManager: ProcessManager,
    launchId: string,
    message: string,
): CouncilChatResult | CouncilChatError {
    const launch = getCouncilLaunch(db, launchId);
    if (!launch) return { ok: false, error: 'Launch not found', status: 404 };
    if (launch.stage !== 'complete') return { ok: false, error: 'Council must be complete before chatting', status: 400 };
    if (!launch.synthesis) return { ok: false, error: 'No synthesis available to chat about', status: 400 };

    const council = getCouncil(db, launch.councilId);

    // If a chat session already exists, resume it with the new message
    if (launch.chatSessionId) {
        const existingSession = getSession(db, launch.chatSessionId);
        if (existingSession) {
            processManager.resumeProcess(existingSession, message);
            return { ok: true, sessionId: existingSession.id, created: false };
        }
    }

    // Pick the chairman agent, or fall back to first council member
    const chatAgentId = council?.chairmanAgentId ?? council?.agentIds[0] ?? null;

    // Collect discussion context
    const discussionMsgs = getDiscussionMessages(db, launchId);
    const discussionSection = discussionMsgs.length > 0
        ? `\n\n## Council Discussion\n\n${formatDiscussionMessages(discussionMsgs)}`
        : '';

    const systemContext = `You are a council advisor. A council has completed deliberation and produced a final decision. Your role is to answer follow-up questions about this decision, explain the reasoning, and discuss implications.

## Original Question
${launch.prompt}

## Council Decision
${launch.synthesis}${discussionSection}

## Instructions
Answer the user's questions about the council's decision. Draw from the synthesis, discussion, and original prompt to provide thorough, helpful responses. If the user asks about something not covered by the council's deliberation, you may offer your own analysis while noting it goes beyond what the council discussed.`;

    const chatPrompt = `${systemContext}\n\n---\n\nUser question: ${message}`;

    const session = createSession(db, {
        projectId: launch.projectId,
        agentId: chatAgentId ?? undefined,
        name: `Council Chat: ${launch.prompt.slice(0, 50)}${launch.prompt.length > 50 ? '...' : ''}`,
        initialPrompt: chatPrompt,
        councilLaunchId: launchId,
        councilRole: 'chairman',
    });

    updateCouncilLaunchChatSession(db, launchId, session.id);

    try {
        processManager.startProcess(session);
    } catch (err) {
        log.error('Failed to start council chat session', { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: 'Failed to start chat session', status: 500 };
    }

    return { ok: true, sessionId: session.id, created: true };
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

    // Determine if any agent uses local Ollama — Ollama serializes inference internally,
    // so even though sessions start in parallel, they queue behind each other.
    // Cloud providers (Anthropic, OpenAI, Ollama cloud) run truly in parallel.
    const agentCount = council.agentIds.length;
    const hasLocalOllama = council.agentIds.some((agentId) => {
        const agent = getAgent(db, agentId);
        if (!agent?.model) return false;
        if (agent.provider === 'ollama') {
            const pricing = getModelPricing(agent.model);
            return !pricing?.isCloud; // local Ollama (not cloud-proxied)
        }
        return false;
    });

    // If any agent uses local Ollama, scale timeout by agent count (serialized queue).
    // Otherwise, agents run truly in parallel — single-agent budget is enough.
    const perRoundTimeout = hasLocalOllama
        ? Math.max(MIN_ROUND_TIMEOUT_MS, agentCount * PER_AGENT_ROUND_BUDGET_MS)
        : Math.max(MIN_ROUND_TIMEOUT_MS, PER_AGENT_ROUND_BUDGET_MS);
    const totalTimeout = Math.min(totalRounds * perRoundTimeout, MAX_DISCUSSION_TOTAL_MS);
    const mode = hasLocalOllama ? `${agentCount} agents, Ollama serialized` : `${agentCount} agents parallel`;
    log.info(`Discussion timeouts: ${Math.round(perRoundTimeout / 60000)}m/round, ${Math.round(totalTimeout / 60000)}m total (${mode}, ${totalRounds} rounds)`);

    for (let round = 1; round <= totalRounds; round++) {
        // Check overall discussion timeout
        if (Date.now() - discussionStartTime > totalTimeout) {
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

        // Spawn all discusser sessions in parallel (no stagger delay)
        for (const agentId of council.agentIds) {
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
        }

        // Wait for all successfully started discusser sessions in parallel
        if (discusserSessionIds.length === 0) {
            emitLog(db, launchId, 'warn', `No discusser sessions started for round ${round}/${totalRounds}`);
        } else {
            const waitResult = await waitForSessions(processManager, discusserSessionIds, perRoundTimeout);
            if (waitResult.timedOut.length > 0) {
                for (const timedOutSessionId of waitResult.timedOut) {
                    const timedOutAgentId = [...agentSessionMap.entries()].find(([, sid]) => sid === timedOutSessionId)?.[0];
                    const timedOutAgent = timedOutAgentId ? getAgent(db, timedOutAgentId) : null;
                    const timedOutName = timedOutAgent?.name ?? timedOutAgentId?.slice(0, 8) ?? 'unknown';
                    emitLog(db, launchId, 'warn', `Discusser ${timedOutName} timed out in round ${round}`, timedOutSessionId);
                    try { processManager.stopProcess(timedOutSessionId); } catch { /* already stopped */ }
                }
                emitLog(db, launchId, 'info',
                    `Round ${round} completed: ${waitResult.completed.length} responded, ${waitResult.timedOut.length} timed out`);
            }
        }

        // Extract responses and store as discussion messages
        for (const agentId of council.agentIds) {
            const sessionId = agentSessionMap.get(agentId);
            const agent = getAgent(db, agentId);
            const agentName = agent?.name ?? agentId.slice(0, 8);

            if (!sessionId) {
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

            // Best-effort on-chain send (fire-and-forget, but log failures)
            if (agentMessenger) {
                sendDiscussionOnChain(agentMessenger, agentId, council.agentIds, content, discMsg.id, db).catch((err) => {
                    log.error('Failed to send discussion message on-chain', {
                        launchId,
                        agentId,
                        messageId: discMsg.id,
                        round,
                        error: err instanceof Error ? err.message : String(err),
                    });
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

export function buildDiscussionPrompt(
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
React to the other members' responses and advance the discussion. You MUST:
- Take a clear position — agree or disagree with specific points
- Add NEW information, analysis, or trade-offs not yet raised
- If you disagree with someone, explain WHY with a concrete argument

Do NOT:
- Repeat points already made by yourself or others
- Ask questions that were already asked in prior rounds
- Summarize what others said — they can read their own responses

Keep your response focused, concise, and original.`;
}

export function formatDiscussionMessages(messages: CouncilDiscussionMessage[]): string {
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

// ─── Session waiting utility ─────────────────────────────────────────────────

/** Result of waiting for a set of sessions — indicates which completed and which timed out. */
export interface WaitForSessionsResult {
    /** Session IDs that completed (exited or stopped) before the timeout. */
    completed: string[];
    /** Session IDs still running when the timeout fired. */
    timedOut: string[];
}

export function waitForSessions(processManager: ProcessManager, sessionIds: string[], timeoutMs?: number): Promise<WaitForSessionsResult> {
    return new Promise<WaitForSessionsResult>((resolve) => {
        let settled = false;
        const pending = new Set(sessionIds);
        const completed: string[] = [];
        const callbacks = new Map<string, EventCallback>();

        const finish = (): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            for (const [sid, cb] of callbacks) {
                processManager.unsubscribe(sid, cb);
            }
            callbacks.clear();
            resolve({ completed, timedOut: Array.from(pending) });
        };

        const markCompleted = (sessionId: string): void => {
            if (pending.delete(sessionId)) {
                completed.push(sessionId);
            }
        };

        const checkDone = (): void => {
            if (pending.size === 0) finish();
        };

        // Timeout: resolve even if some sessions are stuck
        const effectiveTimeout = timeoutMs ?? MIN_ROUND_TIMEOUT_MS;
        const timer = setTimeout(() => {
            if (!settled) {
                const timedOutIds = Array.from(pending);
                log.warn(`waitForSessions timed out (${Math.round(effectiveTimeout / 60000)}m) with ${timedOutIds.length} sessions still pending: ${timedOutIds.join(', ')}`);
                finish();
            }
        }, effectiveTimeout);

        // Subscribe FIRST, then check isRunning — this closes the race window
        // where a process exits between the isRunning check and subscribe call.
        for (const sessionId of sessionIds) {
            const callback: EventCallback = (sid, event) => {
                if (sid !== sessionId) return;
                if (event.type === 'session_exited' || event.type === 'session_stopped') {
                    markCompleted(sessionId);
                    checkDone();
                }
            };
            callbacks.set(sessionId, callback);
            processManager.subscribe(sessionId, callback);

            // If the process already exited before we subscribed, handle it now
            if (!processManager.isRunning(sessionId)) {
                markCompleted(sessionId);
            }
        }

        checkDone();
    });
}

// ─── On-chain messaging ──────────────────────────────────────────────────────

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
    let settled = false;

    // Safety timeout: scale with session count (serialized Ollama agents need ~10 min each)
    const WATCHER_TIMEOUT_MS = Math.max(30 * 60 * 1000, sessionIds.length * PER_AGENT_ROUND_BUDGET_MS);
    const watcherTimer = setTimeout(() => {
        if (settled || pending.size === 0) return;
        const stuck = Array.from(pending);
        emitLog(db, launchId, 'warn', `${role} watcher timed out with ${stuck.length} sessions still pending — force-advancing`);
        for (const sid of stuck) {
            try { processManager.stopProcess(sid); } catch { /* already stopped */ }
        }
        pending.clear();
        advance();
    }, WATCHER_TIMEOUT_MS);

    const cleanup = (): void => {
        settled = true;
        clearTimeout(watcherTimer);
        for (const [sid, cb] of callbacks) {
            processManager.unsubscribe(sid, cb);
        }
        callbacks.clear();
    };

    const advance = (): void => {
        if (settled) return;
        cleanup();

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

    const checkAllDone = (): void => {
        if (pending.size === 0) advance();
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
