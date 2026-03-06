/**
 * SessionResilienceManager — Handles session recovery, auto-resume after API
 * outages, restart with exponential backoff, and orphan pruning.
 *
 * Extracted from ProcessManager following the compose-by-delegation pattern
 * established in the EventBus / ApprovalManager decompositions.
 *
 * @module
 */
import type { Database } from 'bun:sqlite';
import type { Session } from '../../shared/types';
import type { ClaudeStreamEvent } from './types';
import type { ISessionEventBus } from './interfaces';
import { getSession, updateSessionPid, updateSessionStatus, updateSessionAgent } from '../db/sessions';
import { getAlgochatEnabledAgents } from '../db/agents';
import { createLogger } from '../lib/logger';

const log = createLogger('SessionResilienceManager');

// Auto-resume backoff: 5min → 15min → 45min → cap at 60min
const AUTO_RESUME_CHECK_MS = 60_000;
const AUTO_RESUME_BASE_MS = 5 * 60 * 1000;
const AUTO_RESUME_MULTIPLIER = 3;
const AUTO_RESUME_CAP_MS = 60 * 60 * 1000;
const AUTO_RESUME_MAX_ATTEMPTS = 10;

export const MAX_RESTARTS = 3;
const BACKOFF_BASE_MS = 5000;

// Orphan pruning interval
const ORPHAN_PRUNE_INTERVAL_MS = 5 * 60 * 1000;

export interface PausedSessionInfo {
    pausedAt: number;
    resumeAttempts: number;
    nextResumeAt: number;
}

export interface SessionResilienceCallbacks {
    /** Resume a session (start a fresh process with conversation history). */
    resumeProcess: (session: Session) => void;
    /** Stop a running session. */
    stopProcess: (sessionId: string) => void;
    /** Check whether a session has an active process. */
    isRunning: (sessionId: string) => boolean;
    /** Clear timer state for a session. */
    clearTimers: (sessionId: string) => void;
    /** Cancel approval requests for a session. */
    cancelApprovals: (sessionId: string) => void;
}

export class SessionResilienceManager {
    private readonly db: Database;
    private readonly eventBus: ISessionEventBus;
    private readonly callbacks: SessionResilienceCallbacks;

    private pausedSessions: Map<string, PausedSessionInfo> = new Map();
    private restartTimers: Set<ReturnType<typeof setTimeout>> = new Set();
    private autoResumeTimer: ReturnType<typeof setInterval> | null = null;
    private orphanPruneTimer: ReturnType<typeof setInterval> | null = null;

    constructor(db: Database, eventBus: ISessionEventBus, callbacks: SessionResilienceCallbacks) {
        this.db = db;
        this.eventBus = eventBus;
        this.callbacks = callbacks;
    }

    // ── API Outage Handling ──────────────────────────────────────────────

    /**
     * Pause a session due to an API outage. The session will be automatically
     * resumed when the API becomes available again (via startAutoResumeChecker).
     */
    handleApiOutage(sessionId: string): void {
        log.warn(`API outage detected — pausing session ${sessionId} (not counted toward restart budget)`);

        this.callbacks.clearTimers(sessionId);
        const now = Date.now();
        this.pausedSessions.set(sessionId, {
            pausedAt: now,
            resumeAttempts: 0,
            nextResumeAt: now + AUTO_RESUME_BASE_MS,
        });
        this.callbacks.cancelApprovals(sessionId);
        updateSessionPid(this.db, sessionId, null);
        updateSessionStatus(this.db, sessionId, 'paused');

        this.eventBus.emit(sessionId, {
            type: 'error',
            error: { message: `Session paused due to API outage — auto-resume in ${AUTO_RESUME_BASE_MS / 60_000}min`, type: 'api_outage' },
        } as ClaudeStreamEvent);

        this.eventBus.removeSessionSubscribers(sessionId);
    }

    // ── Manual Resume ────────────────────────────────────────────────────

    /**
     * Manually resume a paused session. Returns false if not paused.
     */
    resumeSession(sessionId: string): boolean {
        if (!this.pausedSessions.has(sessionId)) return false;

        this.pausedSessions.delete(sessionId);
        const session = getSession(this.db, sessionId);
        if (!session) {
            log.warn(`Cannot resume session ${sessionId} — not found in DB`);
            return false;
        }

        log.info(`Resuming paused session ${sessionId}`);
        this.callbacks.resumeProcess(session);
        return true;
    }

    isPaused(sessionId: string): boolean {
        return this.pausedSessions.has(sessionId);
    }

    getPausedSessionIds(): string[] {
        return [...this.pausedSessions.keys()];
    }

    get pausedSessionCount(): number {
        return this.pausedSessions.size;
    }

    deletePausedSession(sessionId: string): void {
        this.pausedSessions.delete(sessionId);
    }

    // ── Auto-Restart (crash recovery) ────────────────────────────────────

    /**
     * Attempt to restart a crashed session with exponential backoff.
     * Returns false if max restarts exceeded.
     */
    attemptRestart(sessionId: string, restartCount: number): boolean {
        if (restartCount >= MAX_RESTARTS) {
            log.warn(`Max restarts reached for session ${sessionId}`, { restarts: restartCount });
            return false;
        }

        const backoffMs = BACKOFF_BASE_MS * Math.pow(3, restartCount);

        log.info(`Scheduling restart for session ${sessionId}`, {
            attempt: restartCount + 1,
            backoffMs,
        });

        const timer = setTimeout(() => {
            this.restartTimers.delete(timer);
            const session = getSession(this.db, sessionId);
            if (!session) {
                log.warn(`Cannot restart session ${sessionId} — not found in DB`);
                return;
            }

            if (session.status === 'stopped') {
                log.info(`Session ${sessionId} was stopped, skipping restart`);
                return;
            }

            if (this.callbacks.isRunning(sessionId)) return;

            // For algochat sessions, resolve the current algochat-enabled agent
            if (session.source === 'algochat' && session.agentId) {
                const agents = getAlgochatEnabledAgents(this.db);
                const currentAgent = agents.find((a) => a.algochatAuto) ?? agents[0];
                if (currentAgent && currentAgent.id !== session.agentId) {
                    log.info(`Reassigning session ${sessionId} from agent ${session.agentId} to ${currentAgent.id} (${currentAgent.name})`);
                    updateSessionAgent(this.db, sessionId, currentAgent.id);
                    session.agentId = currentAgent.id;
                }
            }

            log.info(`Auto-restarting session ${sessionId}`, { attempt: restartCount + 1 });
            this.callbacks.resumeProcess(session);
        }, backoffMs);
        this.restartTimers.add(timer);

        return true;
    }

    // ── Auto-Resume Checker (API outage recovery) ────────────────────────

    /**
     * Start the periodic checker that attempts to resume paused sessions
     * with exponential backoff. Checks API health before resuming.
     */
    startAutoResumeChecker(): void {
        this.autoResumeTimer = setInterval(() => {
            if (this.pausedSessions.size === 0) return;

            const now = Date.now();
            const dueSessionIds: string[] = [];

            for (const [sessionId, info] of this.pausedSessions) {
                if (now < info.nextResumeAt) continue;

                if (info.resumeAttempts >= AUTO_RESUME_MAX_ATTEMPTS) {
                    log.warn(`Giving up auto-resume for session ${sessionId} after ${info.resumeAttempts} attempts`);
                    this.pausedSessions.delete(sessionId);
                    updateSessionStatus(this.db, sessionId, 'error');
                    this.eventBus.emit(sessionId, {
                        type: 'error',
                        error: { message: `Auto-resume abandoned after ${info.resumeAttempts} attempts`, type: 'auto_resume_exhausted' },
                    } as ClaudeStreamEvent);
                    continue;
                }

                dueSessionIds.push(sessionId);
            }

            if (dueSessionIds.length === 0) return;

            this.checkApiHealth().then((healthy) => {
                if (!healthy) {
                    log.debug(`API health check failed — deferring auto-resume for ${dueSessionIds.length} session(s)`);
                    return;
                }

                for (const sessionId of dueSessionIds) {
                    const info = this.pausedSessions.get(sessionId);
                    if (!info) continue;

                    const backoffMs = Math.min(
                        AUTO_RESUME_BASE_MS * Math.pow(AUTO_RESUME_MULTIPLIER, info.resumeAttempts),
                        AUTO_RESUME_CAP_MS,
                    );
                    info.resumeAttempts++;
                    info.nextResumeAt = Date.now() + backoffMs;

                    log.info(`Auto-resuming paused session ${sessionId}`, {
                        attempt: info.resumeAttempts,
                        nextRetryMin: Math.round(backoffMs / 60_000),
                    });

                    const resumed = this.resumeSession(sessionId);
                    if (!resumed) {
                        log.warn(`Auto-resume failed for session ${sessionId}`);
                    }
                }
            }).catch((err) => {
                log.warn('Auto-resume health check error', { error: err instanceof Error ? err.message : String(err) });
            });
        }, AUTO_RESUME_CHECK_MS);
    }

    // ── Orphan Pruner ────────────────────────────────────────────────────

    /**
     * Start the periodic orphan pruner that cleans up subscriber and metadata
     * entries for sessions with no active process and not paused.
     */
    startOrphanPruner(
        pruneCallback: () => number,
    ): void {
        this.orphanPruneTimer = setInterval(() => {
            const pruned = pruneCallback();
            if (pruned > 0) {
                log.info(`Orphan pruner cleaned ${pruned} stale entries`);
            }
        }, ORPHAN_PRUNE_INTERVAL_MS);
    }

    // ── API Health Check ─────────────────────────────────────────────────

    /** Quick connectivity check to the Anthropic API. Returns true if reachable. */
    async checkApiHealth(): Promise<boolean> {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
                signal: AbortSignal.timeout(10_000),
            });
            return response.status < 500;
        } catch {
            return false;
        }
    }

    // ── Shutdown ─────────────────────────────────────────────────────────

    shutdown(): void {
        if (this.autoResumeTimer) {
            clearInterval(this.autoResumeTimer);
            this.autoResumeTimer = null;
        }
        if (this.orphanPruneTimer) {
            clearInterval(this.orphanPruneTimer);
            this.orphanPruneTimer = null;
        }
        for (const timer of this.restartTimers) {
            clearTimeout(timer);
        }
        this.restartTimers.clear();
        this.pausedSessions.clear();
    }
}
