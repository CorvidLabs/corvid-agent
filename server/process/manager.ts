import type { Database } from 'bun:sqlite';
import type { Session } from '../../shared/types';
import type { ClaudeStreamEvent } from './types';
import { extractContentText } from './types';
import { startSdkProcess, type SdkProcess } from './sdk-process';
import { startDirectProcess } from './direct-process';
import { ApprovalManager } from './approval-manager';
import { OwnerQuestionManager } from './owner-question-manager';
import type { ApprovalRequestWire } from './approval-types';
import { getProject } from '../db/projects';
import { getAgent } from '../db/agents';
import { LlmProviderRegistry } from '../providers/registry';
import type { LlmProviderType } from '../providers/types';
import type { ScheduleActionType } from '../../shared/types/schedules';
import { hasClaudeAccess } from '../providers/router';
import { getSessionMessages, updateSessionPid, updateSessionStatus, updateSessionCost, addSessionMessage } from '../db/sessions';
import { McpServiceContainer, type McpServices } from './mcp-service-container';
import { resolveSessionConfig } from './session-config-resolver';
import { createCorvidMcpServer } from '../mcp/sdk-tools';
import { recordApiCost } from '../db/spending';
import { getActiveServersForAgent } from '../db/mcp-servers';
import { deductTurnCredits, getCreditConfig } from '../db/credits';
import { getParticipantForSession } from '../db/sessions';
import { createLogger } from '../lib/logger';
import { SessionEventBus } from './event-bus';
import { SessionTimerManager } from './session-timer-manager';
import { SessionResilienceManager, MAX_RESTARTS } from './session-resilience-manager';
import type { SandboxManager } from '../sandbox/manager';

// Re-export EventCallback from interfaces for backward compatibility —
// callers importing { EventCallback } from './manager' continue to work.
export type { EventCallback } from './interfaces';
import type { EventCallback } from './interfaces';

const log = createLogger('ProcessManager');

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
    /** Timestamp of last activity (event received). Used for inactivity-based timeout. */
    lastActivityAt: number;
}

export class ProcessManager {
    private processes: Map<string, SdkProcess> = new Map();
    private readonly eventBus = new SessionEventBus();
    private sessionMeta: Map<string, SessionMeta> = new Map();
    private db: Database;
    readonly approvalManager: ApprovalManager;
    readonly ownerQuestionManager: OwnerQuestionManager;
    private broadcastFn: ((topic: string, data: string) => void) | null = null;

    // Owner check — injected by AlgoChatBridge so credit deduction can be skipped for owners
    private isOwnerAddress: ((address: string) => boolean) | null = null;

    // MCP services — composed container set after AlgoChat init
    private readonly mcpServices = new McpServiceContainer();

    // Sandbox — optional container isolation for agent sessions
    private sandboxManager: SandboxManager | null = null;

    // Composed managers — delegated concerns
    private readonly timerManager: SessionTimerManager;
    private readonly resilienceManager: SessionResilienceManager;

    constructor(db: Database) {
        this.db = db;
        this.approvalManager = new ApprovalManager();
        this.approvalManager.setDatabase(db);
        this.ownerQuestionManager = new OwnerQuestionManager();
        this.ownerQuestionManager.setDatabase(db);

        this.timerManager = new SessionTimerManager({
            onTimeout: (sessionId) => this.stopProcess(sessionId),
            onStablePeriod: (sessionId) => {
                const meta = this.sessionMeta.get(sessionId);
                if (meta && meta.restartCount > 0) {
                    log.info(`Session ${sessionId} stable, resetting restart counter`, {
                        previousCount: meta.restartCount,
                    });
                    meta.restartCount = 0;
                }
            },
            isRunning: (sessionId) => this.processes.has(sessionId),
            getLastActivityAt: (sessionId) => this.sessionMeta.get(sessionId)?.lastActivityAt,
        });

        this.resilienceManager = new SessionResilienceManager(db, this.eventBus, {
            resumeProcess: (session) => this.resumeProcess(session),
            stopProcess: (sessionId) => this.stopProcess(sessionId),
            isRunning: (sessionId) => this.processes.has(sessionId),
            clearTimers: (sessionId) => this.timerManager.cleanupSession(sessionId),
            cancelApprovals: (sessionId) => this.approvalManager.cancelSession(sessionId),
        });

        this.cleanupStaleSessions();
        this.timerManager.startTimeoutChecker(() => [...this.sessionMeta.keys()]);
        this.resilienceManager.startAutoResumeChecker();
        this.resilienceManager.startOrphanPruner(() => this.pruneOrphans());
    }

    /** Set the broadcast function so MCP tools can publish to WS clients. */
    setBroadcast(fn: (topic: string, data: string) => void): void {
        this.broadcastFn = fn;
    }

    /** Set the owner check function so credit deduction can be skipped for owners. */
    setOwnerCheck(fn: (address: string) => boolean): void {
        this.isOwnerAddress = fn;
    }

    /** Register MCP-related services so agent sessions get corvid_* tools. */
    setMcpServices(services: McpServices): void {
        this.mcpServices.setServices(services);
    }

    /** Set the sandbox manager so sessions can be assigned containers. */
    setSandboxManager(manager: SandboxManager): void {
        this.sandboxManager = manager;
    }

    /** Build an McpToolContext for a given agent, or null if MCP services aren't available. */
    private buildMcpContext(agentId: string, sessionSource?: string, sessionId?: string, depth?: number, schedulerMode?: boolean, resolvedToolPermissions?: string[] | null, schedulerActionType?: ScheduleActionType) {
        return this.mcpServices.buildContext({
            agentId,
            db: this.db,
            sessionSource,
            sessionId,
            depth,
            schedulerMode,
            schedulerActionType,
            resolvedToolPermissions,
            emitStatus: sessionId
                ? (message: string) => this.eventBus.emit(sessionId, { type: 'tool_status', statusMessage: message })
                : undefined,
            extendTimeout: sessionId
                ? (additionalMs: number) => this.extendTimeout(sessionId, additionalMs)
                : undefined,
            broadcastOwnerMessage: this.broadcastFn
                ? (message: unknown) => this.broadcastFn!('owner', JSON.stringify(message))
                : undefined,
            ownerQuestionManager: this.ownerQuestionManager,
        });
    }

    /**
     * On startup, reset any sessions stuck in 'running' status from a previous
     * server instance. Their processes no longer exist.
     */
    private cleanupStaleSessions(): void {
        const result = this.db.query(
            `UPDATE sessions SET status = 'idle', pid = NULL WHERE status IN ('running', 'loading')`
        ).run();
        if (result.changes > 0) {
            log.info(`Reset ${result.changes} stale session(s) from previous run`);
        }
    }

    startProcess(session: Session, prompt?: string, options?: { depth?: number; schedulerMode?: boolean; schedulerActionType?: ScheduleActionType }): void {
        if (this.processes.has(session.id)) {
            this.stopProcess(session.id);
        }

        const project = session.projectId ? getProject(this.db, session.projectId) : null;
        if (session.projectId && !project) {
            this.eventBus.emit(session.id, {
                type: 'error',
                error: { message: `Project ${session.projectId} not found`, type: 'not_found' },
            } as ClaudeStreamEvent);
            return;
        }

        let effectiveAgent = session.agentId ? getAgent(this.db, session.agentId) : null;
        const resolvedPrompt = prompt ?? session.initialPrompt;

        // Route based on provider execution mode
        const providerType = effectiveAgent?.provider as LlmProviderType | undefined;
        const registry = LlmProviderRegistry.getInstance();
        let provider = providerType ? registry.get(providerType) : undefined;

        // Auto-fallback: no explicit provider + no Claude access -> try Ollama
        if (!provider && !providerType && !hasClaudeAccess()) {
            const ollamaFallback = registry.get('ollama');
            if (ollamaFallback) {
                log.info(`No Claude access -- falling back to Ollama for session ${session.id}`);
                provider = ollamaFallback;
                if (effectiveAgent && effectiveAgent.model && !effectiveAgent.model.includes(':') && !effectiveAgent.model.startsWith('qwen') && !effectiveAgent.model.startsWith('llama')) {
                    log.warn(`Agent model "${effectiveAgent.model}" is not an Ollama model -- will use Ollama default`, { agentId: effectiveAgent.id });
                    effectiveAgent = { ...effectiveAgent, model: ollamaFallback.getInfo().defaultModel };
                }
            }
        }

        // Use a minimal default project when session has no project
        const effectiveProject = project ?? {
            id: 'general',
            name: 'General',
            description: '',
            workingDir: process.cwd(),
            claudeMd: '',
            envVars: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        if (provider && provider.executionMode === 'direct') {
            this.startDirectProcessWrapped(session, effectiveProject, effectiveAgent, resolvedPrompt, provider, options?.depth, options?.schedulerMode, options?.schedulerActionType);
        } else {
            this.startSdkProcessWrapped(session, effectiveProject, effectiveAgent, resolvedPrompt, options?.depth, options?.schedulerMode, options?.schedulerActionType);
        }
    }

    private startSdkProcessWrapped(session: Session, project: import('../../shared/types').Project, agent: import('../../shared/types').Agent | null, prompt: string, depth?: number, schedulerMode?: boolean, schedulerActionType?: ScheduleActionType): void {
        const effectiveProject = session.workDir
            ? { ...project, workingDir: session.workDir }
            : project;

        const config = resolveSessionConfig(this.db, agent, session.agentId, session.projectId);

        const mcpServers = session.agentId
            ? (() => {
                const ctx = this.buildMcpContext(session.agentId, session.source, session.id, depth, schedulerMode, config.resolvedToolPermissions, schedulerActionType);
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
                personaPrompt: config.personaPrompt,
                skillPrompt: config.skillPrompt,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Failed to start SDK process for session ${session.id}`, { error: message });
            updateSessionStatus(this.db, session.id, 'error');
            this.eventBus.emit(session.id, {
                type: 'error',
                error: { message: `Failed to start SDK process: ${message}`, type: 'spawn_error' },
            } as ClaudeStreamEvent);
            this.eventBus.emit(session.id, {
                type: 'session_error',
                session_id: session.id,
                error: {
                    message: `Failed to start SDK process: ${message}`,
                    errorType: 'spawn_error',
                    severity: 'fatal',
                    recoverable: false,
                },
            } as ClaudeStreamEvent);
            return;
        }

        this.registerProcess(session, sp);
    }

    private startDirectProcessWrapped(
        session: Session,
        project: import('../../shared/types').Project,
        agent: import('../../shared/types').Agent | null,
        prompt: string,
        provider: import('../providers/types').LlmProvider,
        depth?: number,
        schedulerMode?: boolean,
        schedulerActionType?: ScheduleActionType,
    ): void {
        const effectiveProject = session.workDir
            ? { ...project, workingDir: session.workDir }
            : project;

        const config = resolveSessionConfig(this.db, agent, session.agentId, session.projectId);

        const mcpToolContext = session.agentId
            ? this.buildMcpContext(session.agentId, session.source, session.id, depth, schedulerMode, config.resolvedToolPermissions, schedulerActionType)
            : null;

        const externalMcpConfigs = session.agentId
            ? getActiveServersForAgent(this.db, session.agentId)
            : [];

        const councilModel = process.env.COUNCIL_MODEL;
        const modelOverride = (session.councilRole === 'chairman' && councilModel)
            ? councilModel
            : undefined;

        let sp: SdkProcess;
        try {
            const isPollSession = session.name.startsWith('Poll:');
            sp = startDirectProcess({
                session,
                project: effectiveProject,
                agent,
                prompt,
                provider,
                approvalManager: this.approvalManager,
                onEvent: (event) => this.handleEvent(session.id, event),
                onExit: (code) => this.handleExit(session.id, code),
                onApprovalRequest: (request) => this.handleApprovalRequest(session.id, request),
                mcpToolContext,
                extendTimeout: (ms) => this.extendTimeout(session.id, ms),
                personaPrompt: config.personaPrompt,
                skillPrompt: config.skillPrompt,
                modelOverride,
                externalMcpConfigs,
                toolAllowList: isPollSession ? ['run_command'] : undefined,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Failed to start direct process for session ${session.id}`, { error: message });
            updateSessionStatus(this.db, session.id, 'error');
            this.eventBus.emit(session.id, {
                type: 'error',
                error: { message: `Failed to start direct process: ${message}`, type: 'spawn_error' },
            } as ClaudeStreamEvent);
            this.eventBus.emit(session.id, {
                type: 'session_error',
                session_id: session.id,
                error: {
                    message: `Failed to start direct process: ${message}`,
                    errorType: 'spawn_error',
                    severity: 'fatal',
                    recoverable: false,
                },
            } as ClaudeStreamEvent);
            return;
        }

        this.registerProcess(session, sp);
    }

    private registerProcess(session: Session, process: SdkProcess): void {
        this.processes.set(session.id, process);
        const now = Date.now();
        this.sessionMeta.set(session.id, {
            startedAt: now,
            source: (session as { source?: string }).source ?? 'web',
            restartCount: this.sessionMeta.get(session.id)?.restartCount ?? 0,
            lastKnownCostUsd: this.sessionMeta.get(session.id)?.lastKnownCostUsd ?? 0,
            turnCount: 0,
            lastActivityAt: now,
        });
        updateSessionPid(this.db, session.id, process.pid);
        updateSessionStatus(this.db, session.id, 'running');

        const verify = this.db.query('SELECT status, pid FROM sessions WHERE id = ?').get(session.id) as { status: string; pid: number | null } | null;
        if (verify?.status !== 'running' || verify?.pid !== process.pid) {
            log.error(`registerProcess DB verification FAILED`, {
                sessionId: session.id,
                expected: { status: 'running', pid: process.pid },
                actual: verify,
            });
        }

        this.timerManager.startStableTimer(session.id);
        this.timerManager.startSessionTimeout(session.id);

        // Assign a sandbox container if enabled (async, best-effort)
        if (this.sandboxManager?.isEnabled() && session.agentId) {
            const workDir = (session as { workDir?: string }).workDir ?? null;
            this.sandboxManager.assignContainer(session.agentId, session.id, workDir).then((containerId) => {
                log.info(`Sandbox container assigned`, { sessionId: session.id, containerId: containerId.slice(0, 12) });
            }).catch((err) => {
                log.warn(`Failed to assign sandbox container`, {
                    sessionId: session.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }

        log.info(`Started process for session ${session.id}`, { pid: process.pid });

        this.eventBus.emit(session.id, {
            type: 'session_started',
            session_id: session.id,
        } as ClaudeStreamEvent);
    }

    private handleApprovalRequest(sessionId: string, request: ApprovalRequestWire): void {
        this.eventBus.emit(sessionId, {
            type: 'approval_request',
            ...request,
        });
    }

    resumeProcess(session: Session, prompt?: string): void {
        if (this.processes.has(session.id)) {
            const meta = this.sessionMeta.get(session.id);
            if (meta && meta.turnCount >= MAX_TURNS_BEFORE_CONTEXT_RESET) {
                log.info(`Context reset: killing session ${session.id} after ${meta.turnCount} turns`);
                const cp = this.processes.get(session.id);
                cp?.kill();
                this.processes.delete(session.id);
                updateSessionPid(this.db, session.id, null);
            } else {
                if (prompt) {
                    this.sendMessage(session.id, prompt);
                }
                return;
            }
        }

        const project = session.projectId ? getProject(this.db, session.projectId) : null;
        const effectiveProject = project ?? {
            id: 'general',
            name: 'General',
            description: '',
            workingDir: process.cwd(),
            claudeMd: '',
            envVars: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        let effectiveAgent = session.agentId ? getAgent(this.db, session.agentId) : null;

        const resumePrompt = this.buildResumePrompt(session, prompt);

        if (prompt) {
            addSessionMessage(this.db, session.id, 'user', prompt);
        }

        const providerType = effectiveAgent?.provider as LlmProviderType | undefined;
        const registry = LlmProviderRegistry.getInstance();
        let providerInstance = providerType ? registry.get(providerType) : undefined;

        if (!providerInstance && !providerType && !hasClaudeAccess()) {
            const ollamaFallback = registry.get('ollama');
            if (ollamaFallback) {
                log.info(`No Claude access -- falling back to Ollama for resumed session ${session.id}`);
                providerInstance = ollamaFallback;
                if (effectiveAgent && effectiveAgent.model && !effectiveAgent.model.includes(':') && !effectiveAgent.model.startsWith('qwen') && !effectiveAgent.model.startsWith('llama')) {
                    log.warn(`Agent model "${effectiveAgent.model}" is not an Ollama model -- will use Ollama default`, { agentId: effectiveAgent.id });
                    effectiveAgent = { ...effectiveAgent, model: ollamaFallback.getInfo().defaultModel };
                }
            }
        }

        const resumeConfig = resolveSessionConfig(this.db, effectiveAgent, session.agentId, session.projectId);

        let sp: SdkProcess;
        try {
            if (providerInstance && providerInstance.executionMode === 'direct') {
                const mcpToolContext = session.agentId
                    ? this.buildMcpContext(session.agentId, session.source, session.id, undefined, undefined, resumeConfig.resolvedToolPermissions)
                    : null;
                const councilModelResume = process.env.COUNCIL_MODEL;
                const modelOverrideResume = (session.councilRole === 'chairman' && councilModelResume)
                    ? councilModelResume
                    : undefined;
                sp = startDirectProcess({
                    session,
                    project: effectiveProject,
                    agent: effectiveAgent,
                    prompt: resumePrompt ?? '',
                    provider: providerInstance,
                    approvalManager: this.approvalManager,
                    onEvent: (event) => this.handleEvent(session.id, event),
                    onExit: (code) => this.handleExit(session.id, code),
                    onApprovalRequest: (request) => this.handleApprovalRequest(session.id, request),
                    mcpToolContext,
                    extendTimeout: (ms) => this.extendTimeout(session.id, ms),
                    personaPrompt: resumeConfig.personaPrompt,
                    skillPrompt: resumeConfig.skillPrompt,
                    modelOverride: modelOverrideResume,
                });
            } else {
                const mcpServers = session.agentId
                    ? (() => {
                        const ctx = this.buildMcpContext(session.agentId, session.source, session.id, undefined, undefined, resumeConfig.resolvedToolPermissions);
                        return ctx ? [createCorvidMcpServer(ctx)] : undefined;
                    })()
                    : undefined;
                sp = startSdkProcess({
                    session,
                    project: effectiveProject,
                    agent: effectiveAgent,
                    prompt: resumePrompt ?? '',
                    approvalManager: this.approvalManager,
                    onEvent: (event) => this.handleEvent(session.id, event),
                    onExit: (code) => this.handleExit(session.id, code),
                    onApprovalRequest: (request) => this.handleApprovalRequest(session.id, request),
                    onApiOutage: () => this.handleApiOutage(session.id),
                    mcpServers,
                    personaPrompt: resumeConfig.personaPrompt,
                    skillPrompt: resumeConfig.skillPrompt,
                });
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Failed to resume process for session ${session.id}`, { error: message });
            updateSessionStatus(this.db, session.id, 'error');
            this.eventBus.emit(session.id, {
                type: 'error',
                error: { message: `Failed to resume process: ${message}`, type: 'spawn_error' },
            } as ClaudeStreamEvent);
            return;
        }

        this.processes.set(session.id, sp);

        const now = Date.now();
        this.sessionMeta.set(session.id, {
            startedAt: now,
            source: (session as { source?: string }).source ?? 'web',
            restartCount: this.sessionMeta.get(session.id)?.restartCount ?? 0,
            lastKnownCostUsd: this.sessionMeta.get(session.id)?.lastKnownCostUsd ?? 0,
            turnCount: 0,
            lastActivityAt: now,
        });
        const proc = this.processes.get(session.id);
        if (proc) {
            updateSessionPid(this.db, session.id, proc.pid);
        }
        updateSessionStatus(this.db, session.id, 'running');

        this.timerManager.startStableTimer(session.id);
        this.timerManager.startSessionTimeout(session.id);

        // Assign a sandbox container if enabled (async, best-effort)
        if (this.sandboxManager?.isEnabled() && session.agentId) {
            const workDir = (session as { workDir?: string }).workDir ?? null;
            this.sandboxManager.assignContainer(session.agentId, session.id, workDir).then((containerId) => {
                log.info(`Sandbox container assigned on resume`, { sessionId: session.id, containerId: containerId.slice(0, 12) });
            }).catch((err) => {
                log.warn(`Failed to assign sandbox container on resume`, {
                    sessionId: session.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }
    }

    private buildResumePrompt(session: Session, newPrompt?: string): string {
        const messages = getSessionMessages(this.db, session.id);

        if (messages.length === 0) return newPrompt ?? session.initialPrompt ?? '';

        const recent = messages.slice(-20);
        const historyLines = recent
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => {
                const role = m.role === 'user' ? 'User' : 'Assistant';
                const text = m.content.length > 2000 ? m.content.slice(0, 2000) + '...' : m.content;
                return `[${role}]: ${text}`;
            });

        const instruction = newPrompt
            ? 'The following is the conversation history from this session. Use it for context when responding to the new message.'
            : 'The following is the conversation history from this session. The session was interrupted -- continue the conversation based on the history above.';

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
            updateSessionPid(this.db, sessionId, null);
            updateSessionStatus(this.db, sessionId, 'stopped');

            this.eventBus.emit(sessionId, {
                type: 'session_stopped',
                session_id: sessionId,
            } as ClaudeStreamEvent);

            this.cleanupSessionState(sessionId);
        }
    }

    /**
     * Remove all in-memory state for a session. Idempotent -- safe to call
     * multiple times or for sessions that have already been partially cleaned.
     *
     * This is the single source of truth for memory cleanup. All exit paths
     * (stopProcess, handleExit, shutdown) should funnel through here.
     */
    cleanupSessionState(sessionId: string): void {
        this.processes.delete(sessionId);
        this.sessionMeta.delete(sessionId);
        this.eventBus.removeSessionSubscribers(sessionId);
        this.resilienceManager.deletePausedSession(sessionId);
        this.timerManager.cleanupSession(sessionId);
        this.approvalManager.cancelSession(sessionId);
        this.ownerQuestionManager.cancelSession(sessionId);

        // Release sandbox container if one was assigned
        if (this.sandboxManager?.isEnabled()) {
            this.sandboxManager.releaseContainer(sessionId).catch((err) => {
                log.warn(`Failed to release sandbox container`, {
                    sessionId,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }
    }

    /**
     * Get a snapshot of in-memory Map sizes for monitoring / testing.
     */
    getMemoryStats(): {
        processes: number;
        subscribers: number;
        sessionMeta: number;
        pausedSessions: number;
        sessionTimeouts: number;
        stableTimers: number;
        globalSubscribers: number;
    } {
        const timerStats = this.timerManager.getStats();
        return {
            processes: this.processes.size,
            subscribers: this.eventBus.getSubscriberCount(),
            sessionMeta: this.sessionMeta.size,
            pausedSessions: this.resilienceManager.pausedSessionCount,
            sessionTimeouts: timerStats.sessionTimeouts,
            stableTimers: timerStats.stableTimers,
            globalSubscribers: this.eventBus.getGlobalSubscriberCount(),
        };
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

        const meta = this.sessionMeta.get(sessionId);
        if (meta) meta.turnCount++;

        return true;
    }

    isRunning(sessionId: string): boolean {
        return this.processes.has(sessionId);
    }

    subscribe(sessionId: string, callback: EventCallback): void {
        this.eventBus.subscribe(sessionId, callback);
        if (this.processes.has(sessionId)) {
            callback(sessionId, { type: 'thinking', thinking: true } as ClaudeStreamEvent);
        }
    }

    unsubscribe(sessionId: string, callback: EventCallback): void {
        this.eventBus.unsubscribe(sessionId, callback);
    }

    subscribeAll(callback: EventCallback): void {
        this.eventBus.subscribeAll(callback);
    }

    unsubscribeAll(callback: EventCallback): void {
        this.eventBus.unsubscribeAll(callback);
    }

    getActiveSessionIds(): string[] {
        return [...this.processes.keys()];
    }

    shutdown(): void {
        this.timerManager.shutdown();
        this.resilienceManager.shutdown();
        this.approvalManager.shutdown();
        this.ownerQuestionManager.shutdown();

        for (const [sessionId] of this.processes) {
            this.stopProcess(sessionId);
        }

        this.eventBus.clearAllSessionSubscribers();
        this.sessionMeta.clear();
    }

    private handleApiOutage(sessionId: string): void {
        const cp = this.processes.get(sessionId);
        if (cp) {
            cp.kill();
            this.processes.delete(sessionId);
        }
        this.resilienceManager.handleApiOutage(sessionId);
    }

    resumeSession(sessionId: string): boolean {
        const resumed = this.resilienceManager.resumeSession(sessionId);
        if (resumed) {
            const meta = this.sessionMeta.get(sessionId);
            if (meta) {
                meta.restartCount = 0;
            }
        }
        return resumed;
    }

    isPaused(sessionId: string): boolean {
        return this.resilienceManager.isPaused(sessionId);
    }

    getPausedSessionIds(): string[] {
        return this.resilienceManager.getPausedSessionIds();
    }

    private handleEvent(sessionId: string, event: ClaudeStreamEvent): void {
        const meta = this.sessionMeta.get(sessionId);
        if (meta) {
            meta.lastActivityAt = Date.now();
            this.timerManager.startSessionTimeout(sessionId);
        }

        // Broadcast granular activity status so the dashboard reflects what the agent is doing
        this.broadcastActivityStatus(sessionId, event);

        if (event.type === 'assistant' && event.message?.content) {
            const text = extractContentText(event.message.content);
            if (text) {
                addSessionMessage(this.db, sessionId, 'assistant', text);
            }
        }

        if (event.total_cost_usd !== undefined) {
            updateSessionCost(
                this.db,
                sessionId,
                event.total_cost_usd,
                event.num_turns ?? 0,
            );

            const costMeta = this.sessionMeta.get(sessionId);
            if (costMeta) {
                const delta = event.total_cost_usd - costMeta.lastKnownCostUsd;
                if (delta > 0) {
                    try {
                        recordApiCost(this.db, delta);
                    } catch (err) {
                        log.warn(`Failed to record API cost`, { error: err instanceof Error ? err.message : String(err) });
                    }
                }
                costMeta.lastKnownCostUsd = event.total_cost_usd;

                if (costMeta.source === 'algochat') {
                    const participantAddr = getParticipantForSession(this.db, sessionId);
                    if (participantAddr && this.isOwnerAddress?.(participantAddr)) {
                        // Owners are exempt from credit deduction
                    } else if (participantAddr) {
                        const result = deductTurnCredits(this.db, participantAddr, sessionId);
                        if (!result.success) {
                            log.warn(`Credits exhausted mid-session -- pausing session ${sessionId}`, {
                                participantAddr: participantAddr.slice(0, 8) + '...',
                            });
                            this.eventBus.emit(sessionId, {
                                type: 'error',
                                error: {
                                    message: `Session paused: credits exhausted. Send ALGO to resume. Use /credits to check balance.`,
                                    type: 'credits_exhausted',
                                },
                            } as ClaudeStreamEvent);
                            this.eventBus.emit(sessionId, {
                                type: 'session_error',
                                session_id: sessionId,
                                error: {
                                    message: 'Session paused: credits exhausted. Send ALGO to resume.',
                                    errorType: 'credits_exhausted',
                                    severity: 'warning',
                                    recoverable: true,
                                },
                            } as ClaudeStreamEvent);
                            this.stopProcess(sessionId);
                            return;
                        }
                        if (result.isLow) {
                            const config = getCreditConfig(this.db);
                            log.info(`Low credits warning for session ${sessionId}`, {
                                remaining: result.creditsRemaining,
                                threshold: config.lowCreditThreshold,
                            });
                            this.eventBus.emit(sessionId, {
                                type: 'system',
                                statusMessage: `Low credits: ${result.creditsRemaining} remaining. Send ALGO to top up.`,
                            });
                        }
                    }
                }
            }
        }

        this.eventBus.emit(sessionId, event);
    }

    /**
     * Broadcast a session_status message when the agent's activity state changes.
     * Maps SDK events to human-readable status so the dashboard accurately reflects
     * whether an agent is thinking, using tools, or idle.
     */
    private broadcastActivityStatus(sessionId: string, event: ClaudeStreamEvent): void {
        let status: string | null = null;

        switch (event.type) {
            case 'thinking':
                status = (event as import('./types').ThinkingEvent).thinking ? 'thinking' : 'running';
                break;
            case 'content_block_start': {
                const block = (event as import('./types').ContentBlockStartEvent).content_block;
                if (block?.type === 'tool_use') {
                    status = 'tool_use';
                } else {
                    status = 'running';
                }
                break;
            }
            case 'assistant':
            case 'message_start':
                status = 'running';
                break;
            case 'result':
            case 'session_exited':
                status = 'idle';
                break;
        }

        if (!status) return;

        // Update DB so page refreshes also show the correct status
        if (status === 'thinking' || status === 'tool_use') {
            updateSessionStatus(this.db, sessionId, 'running');
        }

        // Broadcast to all WS subscribers watching this session
        if (this.broadcastFn) {
            const msg = JSON.stringify({ type: 'session_status', sessionId, status });
            this.broadcastFn('sessions', msg);
        }

        // Also emit directly to session subscribers (for the detail page)
        this.eventBus.emit(sessionId, {
            type: 'system',
            statusMessage: `__status:${status}`,
        } as ClaudeStreamEvent);
    }

    private handleExit(sessionId: string, code: number | null): void {
        log.info(`Process exited for session ${sessionId}`, { code });
        const meta = this.sessionMeta.get(sessionId);
        updateSessionPid(this.db, sessionId, null);

        const status = code === 0 ? 'idle' : 'error';
        updateSessionStatus(this.db, sessionId, status);

        // Broadcast exit status to dashboard
        if (this.broadcastFn) {
            this.broadcastFn('sessions', JSON.stringify({ type: 'session_status', sessionId, status }));
        }

        // Log unexpected exits as system messages so the user can see what happened
        if (code !== 0) {
            addSessionMessage(this.db, sessionId, 'system',
                `Session exited unexpectedly (code ${code}). Send a message to resume.`);
        } else if (meta) {
            // Clean exit — record it so the conversation shows the boundary
            addSessionMessage(this.db, sessionId, 'system', 'Session completed.');
        }

        if (code !== 0) {
            const isAutoRestartable = meta?.source === 'algochat' && (meta?.restartCount ?? 0) < MAX_RESTARTS;
            this.eventBus.emit(sessionId, {
                type: 'session_error',
                session_id: sessionId,
                error: {
                    message: `Session crashed with exit code ${code}`,
                    errorType: 'crash',
                    severity: isAutoRestartable ? 'warning' : 'error',
                    recoverable: true,
                },
            } as ClaudeStreamEvent);
        }

        this.eventBus.emit(sessionId, {
            type: 'session_exited',
            session_id: sessionId,
            result: 'exited',
            total_cost_usd: 0,
            duration_ms: 0,
            num_turns: 0,
        } as ClaudeStreamEvent);

        if (code !== 0 && meta?.source === 'algochat') {
            this.processes.delete(sessionId);
            this.eventBus.removeSessionSubscribers(sessionId);
            this.resilienceManager.deletePausedSession(sessionId);
            this.timerManager.cleanupSession(sessionId);
            this.approvalManager.cancelSession(sessionId);
            const restarted = this.resilienceManager.attemptRestart(sessionId, meta.restartCount);
            if (restarted) {
                meta.restartCount++;
                this.sessionMeta.set(sessionId, meta);
            } else {
                this.sessionMeta.delete(sessionId);
            }
        } else {
            this.cleanupSessionState(sessionId);
        }
    }

    /** Extend a running session's timeout. Returns false if session not found. */
    extendTimeout(sessionId: string, additionalMs: number): boolean {
        return this.timerManager.extendTimeout(sessionId, additionalMs);
    }

    /**
     * Prune orphaned subscribers and metadata entries.
     * Called by the resilience manager's orphan pruner interval.
     */
    private pruneOrphans(): number {
        let pruned = 0;

        const isOrphan = (sessionId: string) =>
            !this.processes.has(sessionId) && !this.resilienceManager.isPaused(sessionId);
        pruned += this.eventBus.pruneSubscribers(isOrphan);

        for (const sessionId of this.sessionMeta.keys()) {
            if (isOrphan(sessionId)) {
                this.sessionMeta.delete(sessionId);
                pruned++;
            }
        }

        if (pruned > 0) {
            log.info(`Orphan pruner cleaned ${pruned} stale entries`, {
                subscribers: this.eventBus.getSubscriberCount(),
                sessionMeta: this.sessionMeta.size,
                pausedSessions: this.resilienceManager.pausedSessionCount,
                processes: this.processes.size,
            });
        }

        return pruned;
    }
}
