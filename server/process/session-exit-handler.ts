/**
 * Session exit handling — processes session exits (clean or crash), saves
 * session summaries to memory, persists conversation summaries, cleans up
 * worktrees, and manages auto-restart for AlgoChat sessions.
 *
 * Extracted from manager.ts to isolate exit/cleanup logic from session lifecycle.
 *
 * @module
 */

import type { Database } from 'bun:sqlite';
import type { Session } from '../../shared/types';
import { saveMemory } from '../db/agent-memories';
import { getThreadIdForSession, updateThreadSessionSummary } from '../db/discord-thread-sessions';
import { recordObservation } from '../db/observations';
import { getProject } from '../db/projects';
import {
  addSessionMessage,
  getParticipantForSession,
  getSession,
  getSessionMessages,
  updateSessionPid,
  updateSessionStatus,
  updateSessionSummary,
} from '../db/sessions';
import { createLogger } from '../lib/logger';
import { cleanupEphemeralDir, type ResolvedDir } from '../lib/project-dir';
import { removeWorktree } from '../lib/worktree';
import { summarizeConversation } from './direct-process';
import type { ISessionEventBus } from './interfaces';
import type { SessionResilienceManager } from './session-resilience-manager';
import { MAX_RESTARTS } from './session-resilience-manager';
import type { SessionTimerManager } from './session-timer-manager';
import type { ClaudeStreamEvent } from './types';

const log = createLogger('SessionExitHandler');

/** Mutable session metadata tracked in-memory by the ProcessManager. */
export interface SessionMetaForExit {
  startedAt: number;
  source: string;
  restartCount: number;
  lastKnownCostUsd: number;
  turnCount: number;
  lastActivityAt: number;
  contextSummary?: string;
}

/** Dependencies needed by the exit handler. */
export interface ExitHandlerDeps {
  db: Database;
  eventBus: ISessionEventBus;
  broadcastFn: ((topic: string, data: string) => void) | null;
  processes: Map<string, { kill: () => void }>;
  sessionMeta: Map<string, SessionMetaForExit>;
  ephemeralDirs: Map<string, ResolvedDir>;
  resilienceManager: SessionResilienceManager;
  timerManager: SessionTimerManager;
  approvalManager: { cancelSession: (sessionId: string) => void };
  ownerQuestionManager: { cancelSession: (sessionId: string) => void };
  cleanupSessionState: (sessionId: string) => void;
}

/**
 * Handle a session process exit (clean or crash).
 *
 * Responsibilities:
 * - Update DB status and PID
 * - Log structured exit info
 * - Broadcast exit status to dashboard
 * - Record system messages for the session history
 * - Save session summary to memory (on clean exit)
 * - Persist conversation summary (always)
 * - Clean up chat worktrees
 * - Auto-restart AlgoChat sessions on crash (with exponential backoff)
 */
export function handleSessionExit(
  deps: ExitHandlerDeps,
  sessionId: string,
  code: number | null,
  errorMessage?: string,
): void {
  const meta = deps.sessionMeta.get(sessionId);
  const session = getSession(deps.db, sessionId);
  updateSessionPid(deps.db, sessionId, null);

  const status = code === 0 ? 'idle' : 'error';
  updateSessionStatus(deps.db, sessionId, status);

  // Structured logging for all session exits
  const durationMs = meta ? Date.now() - meta.startedAt : null;
  const exitInfo = {
    sessionId,
    name: session?.name ?? 'unknown',
    agentId: session?.agentId ?? 'unknown',
    source: meta?.source ?? session?.source ?? 'unknown',
    status,
    exitCode: code,
    durationMs,
    durationHuman: durationMs ? `${Math.round(durationMs / 1000)}s` : 'unknown',
    turnCount: meta?.turnCount ?? 0,
    restartCount: meta?.restartCount ?? 0,
    costUsd: meta?.lastKnownCostUsd ?? 0,
    errorMessage: errorMessage ?? null,
  };

  if (code !== 0) {
    log.error('Session exited abnormally', exitInfo);
  } else {
    log.info('Session exited cleanly', exitInfo);
  }

  // Broadcast exit status to dashboard
  if (deps.broadcastFn) {
    deps.broadcastFn('sessions', JSON.stringify({ type: 'session_status', sessionId, status }));
  }

  // Log unexpected exits as system messages so the user can see what happened
  if (code !== 0) {
    const detail = errorMessage ? `: ${errorMessage}` : '';
    const durationStr = durationMs ? ` after ${Math.round(durationMs / 1000)}s` : '';
    addSessionMessage(
      deps.db,
      sessionId,
      'system',
      `Session exited unexpectedly (code ${code})${detail}${durationStr}. Turns: ${meta?.turnCount ?? 0}. Send a message to resume.`,
    );
  } else if (meta) {
    // Clean exit — record it so the conversation shows the boundary
    const durationStr = durationMs ? ` after ${Math.round(durationMs / 1000)}s` : '';
    addSessionMessage(deps.db, sessionId, 'system', `Session completed${durationStr}. Turns: ${meta.turnCount}.`);
  }

  // Two-tier memory: auto-save session summary on clean exit
  if (code === 0) {
    saveSessionSummaryToMemory(deps.db, sessionId);
  }

  // Always persist conversation summary to session record (even on crash)
  persistConversationSummary(deps.db, sessionId);

  if (code !== 0) {
    const isAutoRestartable = meta?.source === 'algochat' && (meta?.restartCount ?? 0) < MAX_RESTARTS;
    deps.eventBus.emit(sessionId, {
      type: 'session_error',
      session_id: sessionId,
      error: {
        message: errorMessage || `Session crashed with exit code ${code}`,
        errorType: 'crash',
        severity: isAutoRestartable ? 'warning' : 'error',
        recoverable: true,
      },
    } as ClaudeStreamEvent);
  }

  deps.eventBus.emit(sessionId, {
    type: 'session_exited',
    session_id: sessionId,
    result: 'exited',
    total_cost_usd: 0,
    duration_ms: 0,
    num_turns: 0,
  } as ClaudeStreamEvent);

  // Clean up chat worktrees (work task worktrees are cleaned by WorkTaskService)
  cleanupChatWorktree(deps, sessionId);

  if (code !== 0 && meta?.source === 'algochat') {
    deps.processes.delete(sessionId);
    deps.eventBus.removeSessionSubscribers(sessionId);
    deps.resilienceManager.deletePausedSession(sessionId);
    deps.timerManager.cleanupSession(sessionId);
    deps.approvalManager.cancelSession(sessionId);
    const restarted = deps.resilienceManager.attemptRestart(sessionId, meta.restartCount);
    if (restarted) {
      meta.restartCount++;
      deps.sessionMeta.set(sessionId, meta);
    } else {
      deps.sessionMeta.delete(sessionId);
    }
  } else {
    deps.cleanupSessionState(sessionId);
  }
}

/**
 * Save a session summary to long-term memory on clean exit.
 * Two-tier memory architecture: saves to SQLite with status='pending',
 * then MemorySyncService picks it up and syncs to localnet AlgoChat.
 * Fire-and-forget — errors are logged but do not block session cleanup.
 */
export function saveSessionSummaryToMemory(db: Database, sessionId: string): void {
  try {
    const session = getSession(db, sessionId);
    if (!session?.agentId) return;

    const messages = getSessionMessages(db, sessionId);
    if (messages.length === 0) return;

    // Build a summary from the conversation
    const userMsgs = messages.filter((m) => m.role === 'user');
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    if (userMsgs.length === 0) return;

    const summary = summarizeConversation(
      messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content })),
    );

    const key = `session:${sessionId}:${new Date().toISOString().slice(0, 10)}`;
    const content = [
      `Session ${sessionId} (${session.source ?? 'unknown'} source)`,
      `Duration: ${userMsgs.length} user messages, ${assistantMsgs.length} assistant responses`,
      summary,
    ].join('\n');

    saveMemory(db, {
      agentId: session.agentId,
      key,
      content,
    });

    log.info('Session summary saved to memory', { sessionId, key });
  } catch (err) {
    log.warn('Failed to save session summary to memory', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Save a context summary as a short-term observation so it enters the
 * memory graduation pipeline (short-term → long-term → on-chain).
 */
export function saveContextSummaryObservation(db: Database, session: Session, summary: string): void {
  try {
    const participant = getParticipantForSession(db, session.id);
    const counterparty = participant ? ` with ${participant}` : '';
    const content = `Conversation summary (${session.source ?? 'unknown'}${counterparty}, session ${session.id}):\n${summary}`;

    recordObservation(db, {
      agentId: session.agentId!,
      source: 'session',
      sourceId: session.id,
      content,
      suggestedKey: `conv-summary:${session.id}`,
      relevanceScore: 2.0,
    });

    log.info('Saved context summary as observation', { sessionId: session.id });
  } catch (err) {
    log.warn('Failed to save context summary observation', {
      sessionId: session.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Persist a conversation summary to the session record so that when a new
 * session is created in the same thread, it can carry over context.
 * Runs on every exit (including crashes) — fire-and-forget.
 */
export function persistConversationSummary(db: Database, sessionId: string): void {
  try {
    const messages = getSessionMessages(db, sessionId);
    const conversational = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    if (conversational.length === 0) return;

    const summary = summarizeConversation(conversational.map((m) => ({ role: m.role, content: m.content })));
    updateSessionSummary(db, sessionId, summary);

    // Also persist to the thread session mapping (durable — survives session deletion)
    const threadId = getThreadIdForSession(db, sessionId);
    if (threadId) {
      updateThreadSessionSummary(db, threadId, summary);
    }

    log.debug('Persisted conversation summary to session', { sessionId });
  } catch (err) {
    log.warn('Failed to persist conversation summary', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Clean up worktrees created for chat sessions (not work tasks).
 * Chat worktree directories contain `/chat-` in the path.
 * Also cleans up ephemeral project directories.
 * Fire-and-forget — errors are logged but do not block session cleanup.
 */
export function cleanupChatWorktree(deps: Pick<ExitHandlerDeps, 'db' | 'ephemeralDirs'>, sessionId: string): void {
  // Clean up ephemeral project directories
  const ephemeral = deps.ephemeralDirs.get(sessionId);
  if (ephemeral) {
    deps.ephemeralDirs.delete(sessionId);
    cleanupEphemeralDir(ephemeral).catch((err) => {
      log.warn('Failed to clean up ephemeral directory', {
        sessionId,
        dir: ephemeral.dir,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // Clean up chat worktrees
  const session = getSession(deps.db, sessionId);
  if (!session?.workDir?.includes('/chat-')) return;

  const project = session.projectId ? getProject(deps.db, session.projectId) : null;
  if (!project?.workingDir) return;

  removeWorktree(project.workingDir, session.workDir, { cleanBranch: true }).catch((err) => {
    log.warn('Failed to clean up chat worktree', {
      sessionId,
      workDir: session.workDir,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
