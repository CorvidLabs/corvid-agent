/**
 * Council synthesis & review business logic — extracted from councils/discussion.ts.
 *
 * Contains review orchestration, response aggregation, and chairman synthesis.
 * Discussion orchestration and event infrastructure remain in discussion.ts.
 */

import type { Database } from 'bun:sqlite';
import {
    getCouncil,
    getCouncilLaunch,
    updateCouncilLaunchStage,
    getDiscussionMessages,
} from '../db/councils';
import { createSession, getSessionMessages, listSessionsByCouncilLaunch } from '../db/sessions';
import { getAgent } from '../db/agents';
import type { ProcessManager, EventCallback } from '../process/manager';
import type { CouncilDiscussionMessage } from '../../shared/types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Callback for emitting structured council log entries. */
export type EmitLogFn = (db: Database, launchId: string, level: import('../../shared/types').CouncilLogLevel, message: string, detail?: string) => void;

/** Callback for broadcasting stage changes to WS clients. */
export type BroadcastStageChangeFn = (launchId: string, stage: string, sessionIds?: string[]) => void;

/** Optional auto-advance watcher injected by the orchestration layer. */
export type WatchAutoAdvanceFn = (
    db: Database,
    processManager: ProcessManager,
    launchId: string,
    sessionIds: string[],
    role: 'member' | 'reviewer',
) => void;

// ─── Review logic ─────────────────────────────────────────────────────────────

export function triggerReview(
    db: Database,
    processManager: ProcessManager,
    launchId: string,
    emitLog: EmitLogFn,
    broadcastStageChange: BroadcastStageChangeFn,
    watchAutoAdvance?: WatchAutoAdvanceFn,
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
    if (watchAutoAdvance) {
        watchAutoAdvance(db, processManager, launchId, reviewSessionIds, 'reviewer');
    }

    return { ok: true, reviewSessionIds };
}

// ─── Aggregation logic ────────────────────────────────────────────────────────

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

export function finishWithAggregatedSynthesis(
    db: Database,
    launchId: string,
    emitLog: EmitLogFn,
    broadcastStageChange: BroadcastStageChangeFn,
): void {
    const allSessions = listSessionsByCouncilLaunch(db, launchId);
    const parts = aggregateSessionResponses(db, allSessions);

    const synthesis = parts.length > 0
        ? parts.join('\n\n---\n\n')
        : '(No responses were produced by council members)';

    updateCouncilLaunchStage(db, launchId, 'complete', synthesis);
    emitLog(db, launchId, 'stage', 'Council complete', `Aggregated synthesis from ${parts.length} responses`);
    broadcastStageChange(launchId, 'complete');
}

// ─── Synthesis logic ──────────────────────────────────────────────────────────

export function triggerSynthesis(
    db: Database,
    processManager: ProcessManager,
    launchId: string,
    emitLog: EmitLogFn,
    broadcastStageChange: BroadcastStageChangeFn,
    formatDiscussionMessages: (messages: CouncilDiscussionMessage[]) => string,
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
