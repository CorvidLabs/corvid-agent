import type { Database } from 'bun:sqlite';
import type { Session } from '../../shared/types';
import type { ClaudeStreamEvent } from './types';
import { extractContentText } from './types';
import { startSdkProcess, type SdkProcess } from './sdk-process';
import { ApprovalManager } from './approval-manager';
import type { ApprovalRequestWire } from './approval-types';
import { getProject } from '../db/projects';
import { getAgent } from '../db/agents';
import { getSession, getSessionMessages, updateSessionPid, updateSessionStatus, updateSessionCost, addSessionMessage } from '../db/sessions';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentDirectory } from '../algochat/agent-directory';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { WorkTaskService } from '../work/service';
import { createCorvidMcpServer } from '../mcp/sdk-tools';
import type { McpToolContext } from '../mcp/tool-handlers';
import { recordApiCost, checkApiLimit } from '../db/spending';
import { createLogger } from '../lib/logger';

const log = createLogger('ProcessManager');

const AGENT_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS ?? String(30 * 60 * 1000), 10);
const MAX_RESTARTS = 3;
const BACKOFF_BASE_MS = 5000;
const STABLE_PERIOD_MS = 10 * 60 * 1000; // 10 minutes uptime resets restart counter

// Auto-resume backoff: 5min → 15min → 45min → cap at 60min
const AUTO_RESUME_CHECK_MS = 60_000; // Check every minute
const AUTO_RESUME_BASE_MS = 5 * 60 * 1000; // 5 minutes
const AUTO_RESUME_MULTIPLIER = 3;
const AUTO_RESUME_CAP_MS = 60 * 60 * 1000; // 1 hour max
const AUTO_RESUME_MAX_ATTEMPTS = 10;

export type EventCallback = (sessionId: string, event: ClaudeStreamEvent) => void;

// After this many user messages in a single process lifetime, kill and restart
// through the capped resume path to keep context size manageable.
//
// Rationale: Each "turn" (user message + assistant response + tool calls) grows
// the in-context prompt significantly. Empirically, ~8 turns keeps most sessions
// well under context-window limits while leaving headroom for tool outputs,
// system messages, and safety buffers. Revisit if model context windows change.
const MAX_TURNS_BEFORE_CONTEXT_RESET = 8;

interface SessionMeta {
    startedAt: number;
    source: string;
    restartCount: number;
    lastKnownCostUsd: number;
    /** Number of user messages sent to this live process instance. */
    turnCount: number;
}

interface PausedSessionInfo {
    pausedAt: number;
    resumeAttempts: number;
    nextResumeAt: number;
}

export class ProcessManager {
    private processes: Map<string, SdkProcess> = new Map();
    private subscribers: Map<string, Set<EventCallback>> = new Map();
    private globalSubscribers: Set<EventCallback> = new Set();
    private sessionMeta: Map<string, SessionMeta> = new Map();
    private db: Database;
    private timeoutTimer: ReturnType<typeof setInterval> | null = null;
    private sessionTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private stableTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private pausedSessions: Map<string, PausedSessionInfo> = new Map();
    private autoResumeTimer: ReturnType<typeof setInterval> | null = null;
    readonly approvalManager: ApprovalManager;

    // MCP services — set after AlgoChat init
    private mcpMessenger: AgentMessenger | null = null;
    private mcpDirectory: AgentDirectory | null = null;
    private mcpWalletService: AgentWalletService | null = null;
    private mcpEncryptionConfig: { serverMnemonic?: string | null; network?: string } = {};
    private mcpWorkTaskService: WorkTaskService | null = null;

    constructor(db: Database) {
        this.db = db;
        this.approvalManager = new ApprovalManager();
        this.approvalManager.setDatabase(db);
        this.cleanupStaleSessions();
        this.startTimeoutChecker();
        this.startAutoResumeChecker();
    }

    /** Register MCP-related services so agent sessions get corvid_* tools. */
    setMcpServices(
        messenger: AgentMessenger,
        directory: AgentDirectory,
        walletService: AgentWalletService,
        encryptionConfig?: { serverMnemonic?: string | null; network?: string },
        workTaskService?: WorkTaskService,
    ): void {
        this.mcpMessenger = messenger;
        this.mcpDirectory = directory;
        this.mcpWalletService = walletService;
        this.mcpEncryptionConfig = encryptionConfig ?? {};
        this.mcpWorkTaskService = workTaskService ?? null;
        log.info('MCP services registered — agent sessions will receive corvid_* tools');
    }

    /** Build an McpToolContext for a given agent, or null if MCP services aren't available. */
    private buildMcpContext(agentId: string, sessionSource?: string, sessionId?: string, depth?: number): McpToolContext | null {
        if (!this.mcpMessenger || !this.mcpDirectory || !this.mcpWalletService) return null;
        return {
            agentId,
            db: this.db,
            agentMessenger: this.mcpMessenger,
            agentDirectory: this.mcpDirectory,
            agentWalletService: this.mcpWalletService,
            depth,
            sessionSource,
            serverMnemonic: this.mcpEncryptionConfig.serverMnemonic,
            network: this.mcpEncryptionConfig.network,
            workTaskService: this.mcpWorkTaskService ?? undefined,
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

    startProcess(session: Session, prompt?: string, options?: { depth?: number }): void {
        if (this.processes.has(session.id)) {
            this.stopProcess(session.id);
        }

        // Enforce daily API budget before starting a new session
        try {
            checkApiLimit(this.db, 0);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.warn(`Budget limit reached, refusing to start session ${session.id}`, { error: message });
            updateSessionStatus(this.db, session.id, 'error');
            this.emitEvent(session.id, {
                type: 'error',
                error: { message, type: 'budget_error' },
            } as ClaudeStreamEvent);
            return;
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
        this.startSdkProcessWrapped(session, project, agent, resolvedPrompt, options?.depth);
    }

    private startSdkProcessWrapped(session: Session, project: import('../../shared/types').Project, agent: import('../../shared/types').Agent | null, prompt: string, depth?: number): void {
        // Use session-level workDir override (e.g. git worktree for work tasks)
        const effectiveProject = session.workDir
            ? { ...project, workingDir: session.workDir }
            : project;

        // Build MCP servers for this agent session
        const mcpServers = session.agentId
            ? (() => {
                const ctx = this.buildMcpContext(session.agentId, session.source, session.id, depth);
                return ctx ? [createCorvidMcpServer(ctx)] : undefined;
            })()
            : undefined;

        let sp: SdkProcess;
        try {
            sp = startSdkProcess({
                session,
                project: effectiveProject,
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
            turnCount: 0,
        });
        updateSessionPid(this.db, session.id, process.pid);
        updateSessionStatus(this.db, session.id, 'running');

        // Start stable period timer — resets restart counter after sustained uptime
        this.startStableTimer(session.id);

        // Start per-session timeout — fires exactly at AGENT_TIMEOUT_MS
        this.startSessionTimeout(session.id);

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
            const meta = this.sessionMeta.get(session.id);
            if (meta && meta.turnCount >= MAX_TURNS_BEFORE_CONTEXT_RESET) {
                // Context has grown too large — kill process so it restarts
                // through buildResumePrompt with the capped message window.
                log.info(`Context reset: killing session ${session.id} after ${meta.turnCount} turns`);
                const cp = this.processes.get(session.id);
                cp?.kill();
                this.processes.delete(session.id);
                updateSessionPid(this.db, session.id, null);
                // Fall through to restart below
            } else {
                // Process still running, send message instead
                if (prompt) {
                    this.sendMessage(session.id, prompt);
                }
                return;
            }
        }

        const project = getProject(this.db, session.projectId);
        if (!project) return;

        const agent = session.agentId ? getAgent(this.db, session.agentId) : null;

        // Start a fresh process — our session IDs are not Claude conversation IDs,
        // so --resume would fail. Build a prompt that includes conversation history
        // so the agent has context from prior exchanges.
        const resumePrompt = this.buildResumePrompt(session, prompt);

        // Persist the new prompt after building the resume prompt to avoid
        // duplication (buildResumePrompt fetches history from DB, then appends
        // the new prompt separately)
        if (prompt) {
            addSessionMessage(this.db, session.id, 'user', prompt);
        }

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
            turnCount: 0,
        });
        const proc = this.processes.get(session.id);
        if (proc) {
            updateSessionPid(this.db, session.id, proc.pid);
        }
        updateSessionStatus(this.db, session.id, 'running');

        // Start stable period timer — resets restart counter after sustained uptime
        this.startStableTimer(session.id);

        // Start per-session timeout — fires exactly at AGENT_TIMEOUT_MS
        this.startSessionTimeout(session.id);
    }

    private buildResumePrompt(session: Session, newPrompt?: string): string {
        const messages = getSessionMessages(this.db, session.id);

        // No history — just use the prompt as-is
        if (messages.length === 0) return newPrompt ?? session.initialPrompt ?? '';

        // Build a conversation history block (cap at last 20 messages to stay within limits)
        const recent = messages.slice(-20);
        const historyLines = recent
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => {
                const role = m.role === 'user' ? 'User' : 'Assistant';
                // Truncate very long messages to keep the prompt reasonable
                const text = m.content.length > 2000 ? m.content.slice(0, 2000) + '...' : m.content;
                return `[${role}]: ${text}`;
            });

        const instruction = newPrompt
            ? 'The following is the conversation history from this session. Use it for context when responding to the new message.'
            : 'The following is the conversation history from this session. The session was interrupted — continue the conversation based on the history above.';

        const parts = [
            '<conversation_history>',
            instruction,
            '',
            ...historyLines,
            '</conversation_history>',
        ];

        if (newPrompt) {
            parts.push('', newPrompt);
        }

        return parts.join('\n');
    }

    stopProcess(sessionId: string): void {
        const cp = this.processes.get(sessionId);
        if (cp) {
            cp.kill();
            this.processes.delete(sessionId);
            this.sessionMeta.delete(sessionId);
            this.clearStableTimer(sessionId);
            this.clearSessionTimeout(sessionId);
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

        // Track turns for context reset
        const meta = this.sessionMeta.get(sessionId);
        if (meta) meta.turnCount++;

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
        if (this.autoResumeTimer) {
            clearInterval(this.autoResumeTimer);
            this.autoResumeTimer = null;
        }
        for (const timer of this.stableTimers.values()) {
            clearTimeout(timer);
        }
        this.stableTimers.clear();
        for (const timer of this.sessionTimeouts.values()) {
            clearTimeout(timer);
        }
        this.sessionTimeouts.clear();
        this.pausedSessions.clear();
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
        const now = Date.now();
        this.pausedSessions.set(sessionId, {
            pausedAt: now,
            resumeAttempts: 0,
            nextResumeAt: now + AUTO_RESUME_BASE_MS,
        });
        this.approvalManager.cancelSession(sessionId);
        updateSessionPid(this.db, sessionId, null);
        updateSessionStatus(this.db, sessionId, 'paused');

        this.emitEvent(sessionId, {
            type: 'error',
            error: { message: `Session paused due to API outage — auto-resume in ${AUTO_RESUME_BASE_MS / 60_000}min`, type: 'api_outage' },
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

    getPausedSessionIds(): string[] {
        return [...this.pausedSessions.keys()];
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

                // Mid-session budget enforcement: stop session if daily limit exceeded
                try {
                    checkApiLimit(this.db, 0);
                } catch {
                    log.warn(`Daily budget exceeded mid-session — stopping session ${sessionId}`, {
                        sessionCost: event.total_cost_usd,
                    });
                    this.emitEvent(sessionId, {
                        type: 'error',
                        error: { message: 'Session stopped: daily API budget exhausted', type: 'budget_error' },
                    } as ClaudeStreamEvent);
                    this.stopProcess(sessionId);
                    return;
                }
            }
        }

        this.emitEvent(sessionId, event);
    }

    private handleExit(sessionId: string, code: number | null): void {
        log.info(`Process exited for session ${sessionId}`, { code });
        const meta = this.sessionMeta.get(sessionId);
        this.processes.delete(sessionId);
        this.clearStableTimer(sessionId);
        this.clearSessionTimeout(sessionId);
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

    private startSessionTimeout(sessionId: string): void {
        this.clearSessionTimeout(sessionId);
        const timer = setTimeout(() => {
            this.sessionTimeouts.delete(sessionId);
            if (!this.processes.has(sessionId)) return;
            const meta = this.sessionMeta.get(sessionId);
            const elapsed = meta ? Date.now() - meta.startedAt : AGENT_TIMEOUT_MS;
            log.warn(`Session ${sessionId} exceeded timeout`, {
                elapsedMs: elapsed,
                timeoutMs: AGENT_TIMEOUT_MS,
            });
            this.stopProcess(sessionId);
        }, AGENT_TIMEOUT_MS);
        this.sessionTimeouts.set(sessionId, timer);
    }

    private clearSessionTimeout(sessionId: string): void {
        const timer = this.sessionTimeouts.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.sessionTimeouts.delete(sessionId);
        }
    }

    /**
     * Polling fallback: catches sessions that somehow survive past their
     * per-session timeout (e.g. timer was lost due to a bug). Runs every 60s
     * as a safety net — the per-session setTimeout is the primary mechanism.
     */
    private startTimeoutChecker(): void {
        this.timeoutTimer = setInterval(() => {
            const now = Date.now();
            for (const [sessionId, meta] of this.sessionMeta) {
                if (!this.processes.has(sessionId)) continue;
                const elapsed = now - meta.startedAt;
                if (elapsed > AGENT_TIMEOUT_MS) {
                    log.warn(`Session ${sessionId} exceeded timeout (fallback checker)`, {
                        elapsedMs: elapsed,
                        timeoutMs: AGENT_TIMEOUT_MS,
                    });
                    this.stopProcess(sessionId);
                }
            }
        }, 60_000);
    }

    /** Quick connectivity check to the Anthropic API. Returns true if reachable. */
    private async checkApiHealth(): Promise<boolean> {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
                signal: AbortSignal.timeout(10_000),
            });
            // Any response (even 401/422) means the API is reachable.
            // Only network errors or timeouts indicate an outage.
            return response.status < 500;
        } catch {
            return false;
        }
    }

    /**
     * Periodically attempt to resume paused sessions with exponential backoff.
     * Backoff: 5min → 15min → 45min → cap at 60min, max 10 attempts then give up.
     * Checks API health before resuming to avoid burning attempts on a still-down API.
     */
    private startAutoResumeChecker(): void {
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
                    this.emitEvent(sessionId, {
                        type: 'error',
                        error: { message: `Auto-resume abandoned after ${info.resumeAttempts} attempts`, type: 'auto_resume_exhausted' },
                    } as ClaudeStreamEvent);
                    continue;
                }

                // Check budget before attempting resume
                try {
                    checkApiLimit(this.db, 0);
                } catch {
                    log.debug(`Skipping auto-resume for ${sessionId} — budget exhausted`);
                    continue;
                }

                dueSessionIds.push(sessionId);
            }

            if (dueSessionIds.length === 0) return;

            // Check API health once for all due sessions (avoid redundant requests)
            this.checkApiHealth().then((healthy) => {
                if (!healthy) {
                    log.debug(`API health check failed — deferring auto-resume for ${dueSessionIds.length} session(s)`);
                    // Don't increment attempt counter — API is still down
                    return;
                }

                for (const sessionId of dueSessionIds) {
                    const info = this.pausedSessions.get(sessionId);
                    if (!info) continue; // May have been manually resumed

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
}
