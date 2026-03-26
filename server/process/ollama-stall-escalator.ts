/**
 * OllamaStallEscalator — Detects when an Ollama-backed session stalls for N
 * consecutive turns and escalates it to the task queue.
 *
 * A "stall" is defined as a completed response turn that either:
 *   - Is a cheerleading response (per isCheerleadingResponse()), OR
 *   - Has no tool calls AND response text is below the minimum substantive length.
 *
 * When OLLAMA_STALL_THRESHOLD consecutive stalled turns are detected the
 * escalator will:
 *   1. Create a new work task in the queue for the same goal/prompt.
 *   2. Notify the user via the NotificationService (→ Discord/AlgoChat/WS).
 *   3. Mark the session as escalated in-memory (prevents double-escalation).
 *
 * The escalated task carries `escalated_from_session_id` in its requesterInfo
 * for traceability.
 *
 * Configuration (env vars):
 *   OLLAMA_STALL_THRESHOLD          — consecutive stalled turns before escalation (default 3)
 *   OLLAMA_STALL_ESCALATION_ENABLED — set "false" to disable entirely (default true)
 *
 * @module
 */

import type { Database } from 'bun:sqlite';
import type { ClaudeStreamEvent } from './types';
import { isSessionEndEvent } from './types';
import type { EventCallback } from './interfaces';
import { isStallTurn } from '../lib/session-analysis';
import { getSession } from '../db/sessions';
import { getAgent } from '../db/agents';
import { createWorkTask } from '../db/work-tasks';
import type { NotificationService } from '../notifications/service';
import { createLogger } from '../lib/logger';

const log = createLogger('OllamaStallEscalator');

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Number of consecutive stalled turns before escalation is triggered.
 * Override with OLLAMA_STALL_THRESHOLD env var.
 */
export const OLLAMA_STALL_THRESHOLD = parseInt(
    process.env.OLLAMA_STALL_THRESHOLD ?? '3',
    10,
);

/**
 * Whether auto-escalation is enabled.
 * Override with OLLAMA_STALL_ESCALATION_ENABLED=false to disable.
 */
export const OLLAMA_STALL_ESCALATION_ENABLED =
    process.env.OLLAMA_STALL_ESCALATION_ENABLED !== 'false';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal contract needed to attach to an event source. */
export interface IEventSubscribable {
    subscribeAll(callback: EventCallback): void;
    unsubscribeAll(callback: EventCallback): void;
}

interface SessionStallState {
    /** Events accumulated for the current response turn. */
    currentTurnEvents: ClaudeStreamEvent[];
    /** Number of consecutive stalled turns. */
    consecutiveStalledTurns: number;
    /** True once this session has been escalated (prevents re-escalation). */
    escalated: boolean;
    /** True once a pre-escalation warning has been emitted. */
    warned: boolean;
    /** Cached provider for this session's agent ('ollama' | other). */
    providerType: string | null;
    /** Whether this is confirmed to be an Ollama session. */
    isOllamaSession: boolean;
}

// ─── Main class ───────────────────────────────────────────────────────────────

/**
 * Passive observer + active escalator for stalled Ollama sessions.
 *
 * Attach to any ProcessManager (or compatible event source) after construction.
 *
 * Usage:
 * ```ts
 * const escalator = new OllamaStallEscalator({ eventSource: processManager, db, notificationService });
 * // later (shutdown):
 * escalator.destroy(processManager);
 * ```
 */
export class OllamaStallEscalator {
    private readonly sessionState = new Map<string, SessionStallState>();
    private readonly boundCallback: EventCallback;
    private readonly db: Database;
    private readonly notificationService: NotificationService;
    private readonly threshold: number;
    private readonly enabled: boolean;
    private readonly _getSession: typeof getSession;
    private readonly _getAgent: typeof getAgent;
    private readonly _createWorkTask: typeof createWorkTask;

    constructor(opts: {
        eventSource: IEventSubscribable;
        db: Database;
        notificationService: NotificationService;
        /** Override threshold (used in tests). Defaults to OLLAMA_STALL_THRESHOLD. */
        threshold?: number;
        /** Override enabled flag (used in tests). Defaults to OLLAMA_STALL_ESCALATION_ENABLED. */
        enabled?: boolean;
        /** Override for testing — avoids mock.module leaks. */
        getSession?: typeof getSession;
        /** Override for testing — avoids mock.module leaks. */
        getAgent?: typeof getAgent;
        /** Override for testing — avoids mock.module leaks. */
        createWorkTask?: typeof createWorkTask;
    }) {
        this.db = opts.db;
        this.notificationService = opts.notificationService;
        this.threshold = opts.threshold ?? OLLAMA_STALL_THRESHOLD;
        this.enabled = opts.enabled ?? OLLAMA_STALL_ESCALATION_ENABLED;
        this._getSession = opts.getSession ?? getSession;
        this._getAgent = opts.getAgent ?? getAgent;
        this._createWorkTask = opts.createWorkTask ?? createWorkTask;

        this.boundCallback = (sessionId, event) => this.handleEvent(sessionId, event);
        opts.eventSource.subscribeAll(this.boundCallback);

        if (!this.enabled) {
            log.info('OllamaStallEscalator disabled via OLLAMA_STALL_ESCALATION_ENABLED=false');
        }
    }

    /**
     * Returns the number of consecutive stalled turns for the given session.
     * Returns 0 for unknown sessions.
     */
    getConsecutiveStalledTurns(sessionId: string): number {
        return this.sessionState.get(sessionId)?.consecutiveStalledTurns ?? 0;
    }

    /**
     * Returns true if this session has already been escalated.
     */
    isEscalated(sessionId: string): boolean {
        return this.sessionState.get(sessionId)?.escalated ?? false;
    }

    /**
     * Returns true if a pre-escalation warning has been emitted for this session.
     */
    isWarned(sessionId: string): boolean {
        return this.sessionState.get(sessionId)?.warned ?? false;
    }

    /**
     * Detach from the event source. Call during shutdown to prevent leaks.
     */
    destroy(eventSource: IEventSubscribable): void {
        eventSource.unsubscribeAll(this.boundCallback);
        this.sessionState.clear();
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private getOrCreateState(sessionId: string): SessionStallState {
        let state = this.sessionState.get(sessionId);
        if (!state) {
            state = {
                currentTurnEvents: [],
                consecutiveStalledTurns: 0,
                escalated: false,
                warned: false,
                providerType: null,
                isOllamaSession: false,
            };
            this.sessionState.set(sessionId, state);
        }
        return state;
    }

    /**
     * Resolve whether the session uses Ollama by looking up the session and
     * agent from the DB. Caches the result in state to avoid repeated DB hits.
     */
    private resolveIsOllamaSession(sessionId: string, state: SessionStallState): boolean {
        if (state.providerType !== null) {
            return state.isOllamaSession;
        }

        try {
            const session = this._getSession(this.db, sessionId);
            if (!session?.agentId) {
                state.providerType = '';
                state.isOllamaSession = false;
                return false;
            }

            const agent = this._getAgent(this.db, session.agentId);
            state.providerType = agent?.provider ?? '';
            state.isOllamaSession = state.providerType === 'ollama';
        } catch (err) {
            log.warn('Failed to resolve session provider', {
                sessionId,
                error: err instanceof Error ? err.message : String(err),
            });
            state.providerType = '';
            state.isOllamaSession = false;
        }

        return state.isOllamaSession;
    }

    private handleEvent(sessionId: string, event: ClaudeStreamEvent): void {
        if (!this.enabled) return;

        // Clean up per-session state on terminal events
        if (isSessionEndEvent(event)) {
            this.sessionState.delete(sessionId);
            return;
        }

        const state = this.getOrCreateState(sessionId);

        // Skip non-Ollama sessions (resolve lazily on first event)
        if (!this.resolveIsOllamaSession(sessionId, state)) return;

        // Skip sessions already escalated
        if (state.escalated) return;

        // Accumulate events for the current response turn
        state.currentTurnEvents.push(event);

        // On 'result' event, evaluate the completed turn
        if (event.type === 'result') {
            const turnEvents = state.currentTurnEvents;

            if (isStallTurn(turnEvents)) {
                state.consecutiveStalledTurns++;
                log.warn('Ollama session stalled turn detected', {
                    sessionId,
                    consecutiveStalledTurns: state.consecutiveStalledTurns,
                    threshold: this.threshold,
                });

                // Graduated response: warn one turn before escalation
                if (
                    !state.warned
                    && this.threshold > 1
                    && state.consecutiveStalledTurns >= this.threshold - 1
                    && state.consecutiveStalledTurns < this.threshold
                ) {
                    state.warned = true;
                    log.warn('Pre-escalation warning — Ollama session approaching stall threshold', {
                        sessionId,
                        consecutiveStalledTurns: state.consecutiveStalledTurns,
                        threshold: this.threshold,
                    });
                    // Notify at 'info' level so it's visible but not alarming
                    const agentId = this.resolveAgentId(sessionId);
                    if (agentId) {
                        this.notificationService
                            .notify({
                                agentId,
                                sessionId,
                                title: 'Session stall warning',
                                message:
                                    `The Ollama session has had ${state.consecutiveStalledTurns} consecutive unproductive turn(s). ` +
                                    `One more stall will trigger escalation to the task queue.`,
                                level: 'info',
                            })
                            .catch((err) => {
                                log.error('Failed to send stall warning notification', {
                                    sessionId,
                                    error: err instanceof Error ? err.message : String(err),
                                });
                            });
                    }
                }

                if (state.consecutiveStalledTurns >= this.threshold) {
                    this.triggerEscalation(sessionId, state);
                }
            } else {
                // Productive turn — reset stall counter
                state.consecutiveStalledTurns = 0;
            }

            // Reset turn accumulator
            state.currentTurnEvents = [];
        }
    }

    /**
     * Resolve the agentId for a session from the DB (used for notifications
     * outside of triggerEscalation which already fetches the session).
     */
    private resolveAgentId(sessionId: string): string | null {
        try {
            const session = this._getSession(this.db, sessionId);
            return session?.agentId ?? null;
        } catch {
            return null;
        }
    }

    private triggerEscalation(sessionId: string, state: SessionStallState): void {
        state.escalated = true; // Prevent double-escalation immediately

        log.info('Ollama stall threshold reached — escalating to task queue', {
            sessionId,
            consecutiveStalledTurns: state.consecutiveStalledTurns,
            threshold: this.threshold,
        });

        try {
            const session = this._getSession(this.db, sessionId);
            if (!session) {
                log.warn('Escalation aborted — session not found', { sessionId });
                return;
            }

            // Create a new work task for the same goal
            const task = this._createWorkTask(this.db, {
                agentId: session.agentId ?? '',
                projectId: session.projectId ?? '',
                description: session.initialPrompt ?? '(no prompt)',
                source: 'agent',
                requesterInfo: {
                    escalated_from_session_id: sessionId,
                    escalation_reason: 'ollama_stall',
                    stalled_turns: state.consecutiveStalledTurns,
                },
            });

            log.info('Escalation work task created', {
                sessionId,
                newTaskId: task.id,
            });

            // Notify the user asynchronously (fire-and-forget — notification service handles retry)
            const agentId = session.agentId ?? '';
            this.notificationService
                .notify({
                    agentId,
                    sessionId,
                    title: 'Session escalated to task queue',
                    message:
                        `The Ollama session stalled after ${state.consecutiveStalledTurns} consecutive unproductive turn(s). ` +
                        `The goal has been re-queued as work task \`${task.id}\` for continued processing.`,
                    level: 'warning',
                })
                .catch((err) => {
                    log.error('Failed to send escalation notification', {
                        sessionId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
        } catch (err) {
            log.error('Escalation failed', {
                sessionId,
                error: err instanceof Error ? err.message : String(err),
            });
            // Reset escalated flag so a future event can retry
            state.escalated = false;
        }
    }
}
