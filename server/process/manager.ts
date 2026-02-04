import type { Database } from 'bun:sqlite';
import type { Session } from '../../shared/types';
import type { ClaudeStreamEvent } from './types';
import { extractContentText } from './types';
import { startSdkProcess, type SdkProcess } from './sdk-process';
import { ApprovalManager } from './approval-manager';
import type { ApprovalRequestWire } from './approval-types';
import { getProject } from '../db/projects';
import { getAgent } from '../db/agents';
import { getSession, updateSessionPid, updateSessionStatus, updateSessionCost, addSessionMessage } from '../db/sessions';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { AgentWalletService } from '../algochat/agent-wallet';
import { createCorvidMcpServer } from '../mcp/sdk-tools';
import type { McpToolContext } from '../mcp/tool-handlers';
import { recordApiCost } from '../db/spending';
import { createLogger } from '../lib/logger';

const log = createLogger('ProcessManager');

const AGENT_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS ?? String(30 * 60 * 1000), 10);
const MAX_RESTARTS = 3;
const BACKOFF_BASE_MS = 5000;
const STABLE_PERIOD_MS = 10 * 60 * 1000; // 10 minutes uptime resets restart counter

export type EventCallback = (sessionId: string, event: ClaudeStreamEvent) => void;

interface SessionMeta {
    startedAt: number;
    source: string;
    restartCount: number;
    lastKnownCostUsd: number;
}

export class ProcessManager {
    private processes: Map<string, SdkProcess> = new Map();
    private subscribers: Map<string, Set<EventCallback>> = new Map();
    private globalSubscribers: Set<EventCallback> = new Set();
    private sessionMeta: Map<string, SessionMeta> = new Map();
    private db: Database;
    private timeoutTimer: ReturnType<typeof setInterval> | null = null;
    private stableTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private pausedSessions: Set<string> = new Set();
    readonly approvalManager: ApprovalManager;

    // MCP services — set after AlgoChat init
    private mcpMessenger: AgentMessenger | null = null;
    private mcpDirectory: AgentDirectory | null = null;
    private mcpWalletService: AgentWalletService | null = null;
    private mcpEncryptionConfig: { serverMnemonic?: string | null; network?: string } = {};

    constructor(db: Database) {
        this.db = db;
        this.approvalManager = new ApprovalManager();
        this.approvalManager.setDatabase(db);
        this.cleanupStaleSessions();
        this.startTimeoutChecker();
    }

    /** Register MCP-related services so agent sessions get corvid_* tools. */
    setMcpServices(
        messenger: AgentMessenger,
        directory: AgentDirectory,
        walletService: AgentWalletService,
        encryptionConfig?: { serverMnemonic?: string | null; network?: string },
    ): void {
        this.mcpMessenger = messenger;
        this.mcpDirectory = directory;
        this.mcpWalletService = walletService;
        this.mcpEncryptionConfig = encryptionConfig ?? {};
        log.info('MCP services registered — agent sessions will receive corvid_* tools');
    }

    /** Build an McpToolContext for a given agent, or null if MCP services aren't available. */
    private buildMcpContext(agentId: string, sessionSource?: string, sessionId?: string): McpToolContext | null {
        if (!this.mcpMessenger || !this.mcpDirectory || !this.mcpWalletService) return null;
        return {
            agentId,
            db: this.db,
            agentMessenger: this.mcpMessenger,
            agentDirectory: this.mcpDirectory,
            agentWalletService: this.mcpWalletService,
            sessionSource,
            serverMnemonic: this.mcpEncryptionConfig.serverMnemonic,
            network: this.mcpEncryptionConfig.network,
            emitStatus: sessionId
                ? (message: string) => this.emitEvent(sessionId, { type: 'tool_status', message } as unknown as ClaudeStreamEvent)
                : undefined,
        };
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
        const resolvedPrompt = prompt ?? session.initialPrompt;

        // All agents route through SDK path so they receive MCP tools (corvid_*)
        this.startSdkProcessWrapped(session, project, agent, resolvedPrompt);
    }

    private startSdkProcessWrapped(session: Session, project: import('../../shared/types').Project, agent: import('../../shared/types').Agent | null, prompt: string): void {
        // Build MCP servers for this agent session
        const mcpServers = session.agentId
            ? (() => {
                const ctx = this.buildMcpContext(session.agentId, session.source, session.id);
                return ctx ? [createCorvidMcpServer(ctx)] : undefined;
            })()
            : undefined;

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
                onApiOutage: () => this.handleApiOutage(session.id),
                mcpServers,
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

    private registerProcess(session: Session, process: SdkProcess): void {
        this.processes.set(session.id, process);
        this.sessionMeta.set(session.id, {
            startedAt: Date.now(),
            source: (session as { source?: string }).source ?? 'web',
            restartCount: this.sessionMeta.get(session.id)?.restartCount ?? 0,
            lastKnownCostUsd: this.sessionMeta.get(session.id)?.lastKnownCostUsd ?? 0,
        });
        updateSessionPid(this.db, session.id, process.pid);
        updateSessionStatus(this.db, session.id, 'running');

        // Start stable period timer — resets restart counter after sustained uptime
        this.startStableTimer(session.id);

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

        // Start a fresh process — our session IDs are not Claude conversation IDs,
        // so --resume would fail. Instead, re-send the prompt (or initial prompt).
        const resumePrompt = prompt ?? session.initialPrompt ?? undefined;

        const mcpServers = session.agentId
            ? (() => {
                const ctx = this.buildMcpContext(session.agentId, session.source, session.id);
                return ctx ? [createCorvidMcpServer(ctx)] : undefined;
            })()
            : undefined;

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
                onApiOutage: () => this.handleApiOutage(session.id),
                mcpServers,
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

        this.sessionMeta.set(session.id, {
            startedAt: Date.now(),
            source: (session as { source?: string }).source ?? 'web',
            restartCount: this.sessionMeta.get(session.id)?.restartCount ?? 0,
            lastKnownCostUsd: this.sessionMeta.get(session.id)?.lastKnownCostUsd ?? 0,
        });
        const proc = this.processes.get(session.id);
        if (proc) {
            updateSessionPid(this.db, session.id, proc.pid);
        }
        updateSessionStatus(this.db, session.id, 'running');

        // Start stable period timer — resets restart counter after sustained uptime
        this.startStableTimer(session.id);
    }

    stopProcess(sessionId: string): void {
        const cp = this.processes.get(sessionId);
        if (cp) {
            cp.kill();
            this.processes.delete(sessionId);
            this.sessionMeta.delete(sessionId);
            this.clearStableTimer(sessionId);
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
        for (const timer of this.stableTimers.values()) {
            clearTimeout(timer);
        }
        this.stableTimers.clear();
        this.approvalManager.shutdown();
        for (const [sessionId] of this.processes) {
            this.stopProcess(sessionId);
        }
    }

    private handleApiOutage(sessionId: string): void {
        log.warn(`API outage detected — pausing session ${sessionId} (not counted toward restart budget)`);

        const cp = this.processes.get(sessionId);
        if (cp) {
            cp.kill();
            this.processes.delete(sessionId);
        }

        this.clearStableTimer(sessionId);
        this.pausedSessions.add(sessionId);
        this.approvalManager.cancelSession(sessionId);
        updateSessionPid(this.db, sessionId, null);
        updateSessionStatus(this.db, sessionId, 'paused');

        this.emitEvent(sessionId, {
            type: 'error',
            error: { message: 'Session paused due to API outage — use POST /api/sessions/:id/resume to restart', type: 'api_outage' },
        } as ClaudeStreamEvent);
    }

    resumeSession(sessionId: string): boolean {
        if (!this.pausedSessions.has(sessionId)) return false;

        this.pausedSessions.delete(sessionId);
        const session = getSession(this.db, sessionId);
        if (!session) {
            log.warn(`Cannot resume session ${sessionId} — not found in DB`);
            return false;
        }

        // Reset restart counter for a clean slate after resume
        const meta = this.sessionMeta.get(sessionId);
        if (meta) {
            meta.restartCount = 0;
        }

        log.info(`Resuming paused session ${sessionId}`);
        this.resumeProcess(session);
        return true;
    }

    isPaused(sessionId: string): boolean {
        return this.pausedSessions.has(sessionId);
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

            // Record daily API cost delta
            const meta = this.sessionMeta.get(sessionId);
            if (meta) {
                const delta = event.total_cost_usd - meta.lastKnownCostUsd;
                if (delta > 0) {
                    try {
                        recordApiCost(this.db, delta);
                    } catch (err) {
                        log.warn(`Failed to record API cost`, { error: err instanceof Error ? err.message : String(err) });
                    }
                }
                meta.lastKnownCostUsd = event.total_cost_usd;
            }
        }

        this.emitEvent(sessionId, event);
    }

    private handleExit(sessionId: string, code: number | null): void {
        log.info(`Process exited for session ${sessionId}`, { code });
        const meta = this.sessionMeta.get(sessionId);
        this.processes.delete(sessionId);
        this.clearStableTimer(sessionId);
        this.approvalManager.cancelSession(sessionId);
        updateSessionPid(this.db, sessionId, null);

        const status = code === 0 ? 'idle' : 'error';
        updateSessionStatus(this.db, sessionId, status);

        this.emitEvent(sessionId, {
            type: 'session_exited',
            session_id: sessionId,
            result: 'exited',
            total_cost_usd: 0,
            duration_ms: 0,
            num_turns: 0,
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

    private startStableTimer(sessionId: string): void {
        this.clearStableTimer(sessionId);
        const timer = setTimeout(() => {
            this.stableTimers.delete(sessionId);
            const meta = this.sessionMeta.get(sessionId);
            if (meta && meta.restartCount > 0) {
                log.info(`Session ${sessionId} stable for ${STABLE_PERIOD_MS / 1000}s, resetting restart counter`, {
                    previousCount: meta.restartCount,
                });
                meta.restartCount = 0;
            }
        }, STABLE_PERIOD_MS);
        this.stableTimers.set(sessionId, timer);
    }

    private clearStableTimer(sessionId: string): void {
        const timer = this.stableTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.stableTimers.delete(sessionId);
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
