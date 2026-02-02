import type { Database } from 'bun:sqlite';
import type { Session } from '../../shared/types';
import type { ClaudeStreamEvent } from './types';
import { extractContentText } from './types';
import { spawnClaudeProcess, type ClaudeProcess } from './claude-process';
import { startSdkProcess, type SdkProcess } from './sdk-process';
import { ApprovalManager } from './approval-manager';
import type { ApprovalRequestWire } from './approval-types';
import { getProject } from '../db/projects';
import { getAgent } from '../db/agents';
import { getSession, updateSessionPid, updateSessionStatus, updateSessionCost, addSessionMessage } from '../db/sessions';
import { createLogger } from '../lib/logger';

const log = createLogger('ProcessManager');

const AGENT_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS ?? String(30 * 60 * 1000), 10);
const MAX_RESTARTS = 3;
const BACKOFF_BASE_MS = 5000;

/** Permission modes that bypass approval and use the raw CLI spawn path. */
const BYPASS_MODES = new Set(['bypassPermissions', 'dontAsk', 'acceptEdits', 'full-auto']);

export type EventCallback = (sessionId: string, event: ClaudeStreamEvent) => void;

interface SessionMeta {
    startedAt: number;
    source: string;
    restartCount: number;
}

export class ProcessManager {
    private processes: Map<string, ClaudeProcess | SdkProcess> = new Map();
    private subscribers: Map<string, Set<EventCallback>> = new Map();
    private globalSubscribers: Set<EventCallback> = new Set();
    private sessionMeta: Map<string, SessionMeta> = new Map();
    private db: Database;
    private timeoutTimer: ReturnType<typeof setInterval> | null = null;
    readonly approvalManager: ApprovalManager;

    constructor(db: Database) {
        this.db = db;
        this.approvalManager = new ApprovalManager();
        this.cleanupStaleSessions();
        this.startTimeoutChecker();
    }

    /**
     * On startup, reset any sessions stuck in 'running' status from a previous
     * server instance. Their processes no longer exist.
     */
    private cleanupStaleSessions(): void {
        const result = this.db.query(
            `UPDATE sessions SET status = 'idle', pid = NULL WHERE status = 'running'`
        ).run();
        if (result.changes > 0) {
            log.info(`Reset ${result.changes} stale session(s) from previous run`);
        }
    }

    startProcess(session: Session, prompt?: string): void {
        if (this.processes.has(session.id)) {
            this.stopProcess(session.id);
        }

        const project = getProject(this.db, session.projectId);
        if (!project) {
            this.emitEvent(session.id, {
                type: 'error',
                error: { message: `Project ${session.projectId} not found`, type: 'not_found' },
            } as ClaudeStreamEvent);
            return;
        }

        const agent = session.agentId ? getAgent(this.db, session.agentId) : null;
        const permissionMode = agent?.permissionMode ?? 'default';
        const resolvedPrompt = prompt ?? session.initialPrompt;

        // Dispatch: full-auto / bypassPermissions → raw CLI, others → Agent SDK
        if (BYPASS_MODES.has(permissionMode)) {
            this.startCliProcess(session, project, agent, resolvedPrompt);
        } else {
            this.startSdkProcessWrapped(session, project, agent, resolvedPrompt);
        }
    }

    private startCliProcess(session: Session, project: import('../../shared/types').Project, agent: import('../../shared/types').Agent | null, prompt: string): void {
        let cp: ClaudeProcess;
        try {
            cp = spawnClaudeProcess({
                session,
                project,
                agent,
                prompt,
                onEvent: (event) => this.handleEvent(session.id, event),
                onExit: (code) => this.handleExit(session.id, code),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Failed to spawn claude for session ${session.id}`, { error: message });
            updateSessionStatus(this.db, session.id, 'error');
            this.emitEvent(session.id, {
                type: 'error',
                error: { message: `Failed to spawn claude: ${message}`, type: 'spawn_error' },
            } as ClaudeStreamEvent);
            return;
        }

        this.registerProcess(session, cp);
    }

    private startSdkProcessWrapped(session: Session, project: import('../../shared/types').Project, agent: import('../../shared/types').Agent | null, prompt: string): void {
        let sp: SdkProcess;
        try {
            sp = startSdkProcess({
                session,
                project,
                agent,
                prompt,
                approvalManager: this.approvalManager,
                onEvent: (event) => this.handleEvent(session.id, event),
                onExit: (code) => this.handleExit(session.id, code),
                onApprovalRequest: (request) => this.handleApprovalRequest(session.id, request),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Failed to start SDK process for session ${session.id}`, { error: message });
            updateSessionStatus(this.db, session.id, 'error');
            this.emitEvent(session.id, {
                type: 'error',
                error: { message: `Failed to start SDK process: ${message}`, type: 'spawn_error' },
            } as ClaudeStreamEvent);
            return;
        }

        this.registerProcess(session, sp);
    }

    private registerProcess(session: Session, process: ClaudeProcess | SdkProcess): void {
        this.processes.set(session.id, process);
        this.sessionMeta.set(session.id, {
            startedAt: Date.now(),
            source: (session as { source?: string }).source ?? 'web',
            restartCount: this.sessionMeta.get(session.id)?.restartCount ?? 0,
        });
        updateSessionPid(this.db, session.id, process.pid);
        updateSessionStatus(this.db, session.id, 'running');

        log.info(`Started process for session ${session.id}`, { pid: process.pid });

        this.emitEvent(session.id, {
            type: 'session_started',
            session_id: session.id,
        } as ClaudeStreamEvent);
    }

    private handleApprovalRequest(sessionId: string, request: ApprovalRequestWire): void {
        this.emitEvent(sessionId, {
            type: 'approval_request',
            ...request,
        } as unknown as ClaudeStreamEvent);
    }

    resumeProcess(session: Session, prompt?: string): void {
        if (this.processes.has(session.id)) {
            // Process still running, send message instead
            if (prompt) {
                this.sendMessage(session.id, prompt);
            }
            return;
        }

        const project = getProject(this.db, session.projectId);
        if (!project) return;

        const agent = session.agentId ? getAgent(this.db, session.agentId) : null;
        const permissionMode = agent?.permissionMode ?? 'default';

        // Start a fresh process — our session IDs are not Claude conversation IDs,
        // so --resume would fail. Instead, re-send the prompt (or initial prompt).
        const resumePrompt = prompt ?? session.initialPrompt ?? undefined;

        if (BYPASS_MODES.has(permissionMode)) {
            let cp: ClaudeProcess;
            try {
                cp = spawnClaudeProcess({
                    session,
                    project,
                    agent,
                    prompt: resumePrompt,
                    onEvent: (event) => this.handleEvent(session.id, event),
                    onExit: (code) => this.handleExit(session.id, code),
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.error(`Failed to resume claude for session ${session.id}`, { error: message });
                updateSessionStatus(this.db, session.id, 'error');
                this.emitEvent(session.id, {
                    type: 'error',
                    error: { message: `Failed to resume claude: ${message}`, type: 'spawn_error' },
                } as ClaudeStreamEvent);
                return;
            }

            this.processes.set(session.id, cp);
        } else {
            let sp: SdkProcess;
            try {
                sp = startSdkProcess({
                    session,
                    project,
                    agent,
                    prompt: resumePrompt ?? '',
                    approvalManager: this.approvalManager,
                    onEvent: (event) => this.handleEvent(session.id, event),
                    onExit: (code) => this.handleExit(session.id, code),
                    onApprovalRequest: (request) => this.handleApprovalRequest(session.id, request),
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.error(`Failed to resume SDK process for session ${session.id}`, { error: message });
                updateSessionStatus(this.db, session.id, 'error');
                this.emitEvent(session.id, {
                    type: 'error',
                    error: { message: `Failed to resume SDK process: ${message}`, type: 'spawn_error' },
                } as ClaudeStreamEvent);
                return;
            }

            this.processes.set(session.id, sp);
        }

        this.sessionMeta.set(session.id, {
            startedAt: Date.now(),
            source: (session as { source?: string }).source ?? 'web',
            restartCount: this.sessionMeta.get(session.id)?.restartCount ?? 0,
        });
        const proc = this.processes.get(session.id);
        if (proc) {
            updateSessionPid(this.db, session.id, proc.pid);
        }
        updateSessionStatus(this.db, session.id, 'running');
    }

    stopProcess(sessionId: string): void {
        const cp = this.processes.get(sessionId);
        if (cp) {
            cp.kill();
            this.processes.delete(sessionId);
            this.sessionMeta.delete(sessionId);
            this.approvalManager.cancelSession(sessionId);
            updateSessionPid(this.db, sessionId, null);
            updateSessionStatus(this.db, sessionId, 'stopped');

            this.emitEvent(sessionId, {
                type: 'session_stopped',
                session_id: sessionId,
            } as ClaudeStreamEvent);
        }
    }

    sendMessage(sessionId: string, content: string): boolean {
        const cp = this.processes.get(sessionId);
        if (!cp) return false;

        const sent = cp.sendMessage(content);
        if (!sent) {
            log.warn(`Failed to write to stdin for session ${sessionId}`);
            return false;
        }

        addSessionMessage(this.db, sessionId, 'user', content);
        return true;
    }

    isRunning(sessionId: string): boolean {
        return this.processes.has(sessionId);
    }

    subscribe(sessionId: string, callback: EventCallback): void {
        let subs = this.subscribers.get(sessionId);
        if (!subs) {
            subs = new Set();
            this.subscribers.set(sessionId, subs);
        }
        subs.add(callback);
    }

    unsubscribe(sessionId: string, callback: EventCallback): void {
        const subs = this.subscribers.get(sessionId);
        if (subs) {
            subs.delete(callback);
            if (subs.size === 0) {
                this.subscribers.delete(sessionId);
            }
        }
    }

    subscribeAll(callback: EventCallback): void {
        this.globalSubscribers.add(callback);
    }

    unsubscribeAll(callback: EventCallback): void {
        this.globalSubscribers.delete(callback);
    }

    getActiveSessionIds(): string[] {
        return [...this.processes.keys()];
    }

    shutdown(): void {
        if (this.timeoutTimer) {
            clearInterval(this.timeoutTimer);
            this.timeoutTimer = null;
        }
        this.approvalManager.shutdown();
        for (const [sessionId] of this.processes) {
            this.stopProcess(sessionId);
        }
    }

    private handleEvent(sessionId: string, event: ClaudeStreamEvent): void {
        // Persist assistant messages
        if (event.type === 'assistant' && event.message?.content) {
            const text = extractContentText(event.message.content);
            if (text) {
                addSessionMessage(this.db, sessionId, 'assistant', text);
            }
        }

        // Track cost (fields are at top level of result events)
        if (event.total_cost_usd !== undefined) {
            updateSessionCost(
                this.db,
                sessionId,
                event.total_cost_usd,
                event.num_turns ?? 0,
            );
        }

        this.emitEvent(sessionId, event);
    }

    private handleExit(sessionId: string, code: number | null): void {
        log.info(`Process exited for session ${sessionId}`, { code });
        const meta = this.sessionMeta.get(sessionId);
        this.processes.delete(sessionId);
        this.approvalManager.cancelSession(sessionId);
        updateSessionPid(this.db, sessionId, null);

        const status = code === 0 ? 'idle' : 'error';
        updateSessionStatus(this.db, sessionId, status);

        this.emitEvent(sessionId, {
            type: 'session_exited',
            session_id: sessionId,
            result: { cost_usd: 0, duration_ms: 0, num_turns: 0 },
        } as ClaudeStreamEvent);

        // Auto-restart for AlgoChat sessions on non-zero exit
        if (code !== 0 && meta?.source === 'algochat') {
            this.attemptRestart(sessionId, meta);
        } else {
            this.sessionMeta.delete(sessionId);
        }
    }

    private attemptRestart(sessionId: string, meta: SessionMeta): void {
        if (meta.restartCount >= MAX_RESTARTS) {
            log.warn(`Max restarts reached for session ${sessionId}`, { restarts: meta.restartCount });
            this.sessionMeta.delete(sessionId);
            return;
        }

        const backoffMs = BACKOFF_BASE_MS * Math.pow(3, meta.restartCount);
        meta.restartCount++;
        this.sessionMeta.set(sessionId, meta);

        log.info(`Scheduling restart for session ${sessionId}`, {
            attempt: meta.restartCount,
            backoffMs,
        });

        setTimeout(() => {
            const session = getSession(this.db, sessionId);
            if (!session) {
                log.warn(`Cannot restart session ${sessionId} — not found in DB`);
                this.sessionMeta.delete(sessionId);
                return;
            }

            // Only restart if not already running (user may have manually restarted)
            if (this.processes.has(sessionId)) return;

            log.info(`Auto-restarting session ${sessionId}`, { attempt: meta.restartCount });
            this.resumeProcess(session);
        }, backoffMs);
    }

    private emitEvent(sessionId: string, event: ClaudeStreamEvent): void {
        const subs = this.subscribers.get(sessionId);
        if (subs) {
            for (const cb of subs) {
                try {
                    cb(sessionId, event);
                } catch (err) {
                    log.error('Subscriber callback threw', {
                        sessionId,
                        eventType: event.type,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        }
        for (const cb of this.globalSubscribers) {
            try {
                cb(sessionId, event);
            } catch (err) {
                log.error('Global subscriber callback threw', {
                    sessionId,
                    eventType: event.type,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    private startTimeoutChecker(): void {
        this.timeoutTimer = setInterval(() => {
            const now = Date.now();
            for (const [sessionId, meta] of this.sessionMeta) {
                if (!this.processes.has(sessionId)) continue;
                const elapsed = now - meta.startedAt;
                if (elapsed > AGENT_TIMEOUT_MS) {
                    log.warn(`Session ${sessionId} exceeded timeout`, {
                        elapsedMs: elapsed,
                        timeoutMs: AGENT_TIMEOUT_MS,
                    });
                    this.stopProcess(sessionId);
                }
            }
        }, 60_000);
    }
}
