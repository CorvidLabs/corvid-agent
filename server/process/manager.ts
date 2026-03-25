import type { Database } from 'bun:sqlite';
import type { Session } from '../../shared/types';
import type { ClaudeStreamEvent } from './types';
import { extractContentText } from './types';
import { startSdkProcess, type SdkProcess } from './sdk-process';
import { startDirectProcess, summarizeConversation } from './direct-process';
import { ApprovalManager } from './approval-manager';
import { OwnerQuestionManager } from './owner-question-manager';
import type { ApprovalRequestWire } from './approval-types';
import { getProject } from '../db/projects';
import { getAgent } from '../db/agents';
import { LlmProviderRegistry } from '../providers/registry';
import type { LlmProviderType } from '../providers/types';
import type { ScheduleActionType } from '../../shared/types/schedules';
import { hasClaudeAccess } from '../providers/router';
import { getSession, getSessionMessages, updateSessionPid, updateSessionStatus, updateSessionCost, addSessionMessage, getParticipantForSession } from '../db/sessions';
import { saveMemory } from '../db/agent-memories';
import { McpServiceContainer, type McpServices } from './mcp-service-container';
import { resolveSessionConfig } from './session-config-resolver';
import { createCorvidMcpServer } from '../mcp/sdk-tools';
import { recordApiCost } from '../db/spending';
import { insertSessionMetrics } from '../db/session-metrics';
import { getActiveServersForAgent } from '../db/mcp-servers';
import { deductTurnCredits, getCreditConfig } from '../db/credits';
import { removeWorktree } from '../lib/worktree';
import { resolveProjectDir, cleanupEphemeralDir, type ResolvedDir } from '../lib/project-dir';
import { createLogger } from '../lib/logger';
import { SessionEventBus } from './event-bus';
import { SessionTimerManager } from './session-timer-manager';
import { SessionResilienceManager, MAX_RESTARTS } from './session-resilience-manager';

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
    /** Context summary from previous session lifetime, used on context reset. */
    contextSummary?: string;
}

export class ProcessManager {
    private processes: Map<string, SdkProcess> = new Map();
    private readonly eventBus = new SessionEventBus();
    private sessionMeta: Map<string, SessionMeta> = new Map();
    private ephemeralDirs: Map<string, ResolvedDir> = new Map();
    /** Guard against concurrent resume/start for the same session. */
    private startingSession: Set<string> = new Set();
    private db: Database;
    readonly approvalManager: ApprovalManager;
    readonly ownerQuestionManager: OwnerQuestionManager;
    private broadcastFn: ((topic: string, data: string) => void) | null = null;

    // Owner check — injected by AlgoChatBridge so credit deduction can be skipped for owners
    private isOwnerAddress: ((address: string) => boolean) | null = null;

    // MCP services — composed container set after AlgoChat init
    private readonly mcpServices = new McpServiceContainer();

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

    startProcess(session: Session, prompt?: string, options?: { depth?: number; schedulerMode?: boolean; schedulerActionType?: ScheduleActionType; conversationOnly?: boolean; toolAllowList?: string[]; mcpToolAllowList?: string[] }): void {
        if (this.startingSession.has(session.id)) {
            log.warn(`Ignoring duplicate startProcess call for session ${session.id} — already starting`);
            return;
        }
        if (this.processes.has(session.id)) {
            this.stopProcess(session.id);
        }

        this.startingSession.add(session.id);

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

        const defaultProject = {
            id: 'general',
            name: 'General',
            description: '',
            workingDir: process.cwd(),
            claudeMd: '',
            envVars: {},
            gitUrl: null,
            dirStrategy: 'persistent' as const,
            baseClonePath: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const baseProject = project ?? defaultProject;

        // Resolve project directory for non-persistent strategies (async)
        if (baseProject.dirStrategy !== 'persistent' && baseProject.dirStrategy !== 'worktree') {
            this.startProcessWithResolvedDir(session, baseProject, effectiveAgent, resolvedPrompt, provider, options);
            return;
        }

        // Use a minimal default project when session has no project
        const effectiveProject = baseProject;

        if (provider && provider.executionMode === 'direct') {
            this.startDirectProcessWrapped(session, effectiveProject, effectiveAgent, resolvedPrompt, provider, options?.depth, options?.schedulerMode, options?.schedulerActionType, options?.conversationOnly, options?.toolAllowList, options?.mcpToolAllowList);
        } else {
            this.startSdkProcessWrapped(session, effectiveProject, effectiveAgent, resolvedPrompt, options?.depth, options?.schedulerMode, options?.schedulerActionType, options?.conversationOnly, options?.toolAllowList, options?.mcpToolAllowList);
        }
    }

    /**
     * Resolve project directory for non-persistent strategies (clone_on_demand, ephemeral)
     * then dispatch to the normal process start flow.
     */
    private async startProcessWithResolvedDir(
        session: Session,
        project: import('../../shared/types').Project,
        effectiveAgent: import('../../shared/types').Agent | null,
        resolvedPrompt: string,
        provider: import('../providers/types').LlmProvider | undefined,
        options?: { depth?: number; schedulerMode?: boolean; schedulerActionType?: ScheduleActionType; conversationOnly?: boolean; toolAllowList?: string[]; mcpToolAllowList?: string[] },
    ): Promise<void> {
        const resolved = await resolveProjectDir(project);

        if (resolved.error) {
            log.warn('Failed to resolve project directory', { projectId: project.id, error: resolved.error });
            this.startingSession.delete(session.id);
            this.eventBus.emit(session.id, {
                type: 'error',
                error: { message: `Failed to resolve project directory: ${resolved.error}`, type: 'dir_resolution_error' },
            } as ClaudeStreamEvent);
            return;
        }

        const effectiveProject = { ...project, workingDir: resolved.dir };

        // Store cleanup reference for ephemeral dirs
        if (resolved.ephemeral) {
            this.ephemeralDirs.set(session.id, resolved);
        }

        if (provider && provider.executionMode === 'direct') {
            this.startDirectProcessWrapped(session, effectiveProject, effectiveAgent, resolvedPrompt, provider, options?.depth, options?.schedulerMode, options?.schedulerActionType, options?.conversationOnly, options?.toolAllowList, options?.mcpToolAllowList);
        } else {
            this.startSdkProcessWrapped(session, effectiveProject, effectiveAgent, resolvedPrompt, options?.depth, options?.schedulerMode, options?.schedulerActionType, options?.conversationOnly, options?.toolAllowList, options?.mcpToolAllowList);
        }
    }

    private startSdkProcessWrapped(session: Session, project: import('../../shared/types').Project, agent: import('../../shared/types').Agent | null, prompt: string, depth?: number, schedulerMode?: boolean, schedulerActionType?: ScheduleActionType, conversationOnly?: boolean, toolAllowList?: string[], mcpToolAllowList?: string[]): void {
        const effectiveProject = session.workDir
            ? { ...project, workingDir: session.workDir }
            : project;

        const config = resolveSessionConfig(this.db, agent, session.agentId, session.projectId);

        // Conversation-only sessions (or empty toolAllowList) get NO tools — pure text conversation.
        // When toolAllowList has items, it's a restricted session (e.g. buddy review).
        // If mcpToolAllowList is also set, load MCP with only those tools (e.g. memory tools for /message).
        const isNoTools = conversationOnly || (toolAllowList && toolAllowList.length === 0);
        const isRestrictedTools = !isNoTools && toolAllowList && toolAllowList.length > 0;
        const hasMcpAllowList = mcpToolAllowList && mcpToolAllowList.length > 0;
        // Skip MCP unless the caller explicitly requested specific MCP tools
        const skipMcp = isNoTools || (isRestrictedTools && !hasMcpAllowList);
        const mcpServers = skipMcp ? undefined : (session.agentId
            ? (() => {
                // When mcpToolAllowList is set, override resolvedToolPermissions to restrict MCP tools
                const effectivePermissions = hasMcpAllowList ? mcpToolAllowList : config.resolvedToolPermissions;
                const ctx = this.buildMcpContext(session.agentId, session.source, session.id, depth, schedulerMode, effectivePermissions, schedulerActionType);
                return ctx ? [createCorvidMcpServer(ctx)] : undefined;
            })()
            : undefined);

        // Fetch external MCP server configs (Figma, Slack, etc.) for SDK sessions
        // Skip external MCP for restricted sessions unless MCP allow list is explicitly set
        const externalMcpConfigs = skipMcp ? [] : (session.agentId
            ? getActiveServersForAgent(this.db, session.agentId)
            : []);

        let sp: SdkProcess;
        try {
            sp = startSdkProcess({
                session,
                project: effectiveProject,
                agent,
                prompt,
                approvalManager: this.approvalManager,
                onEvent: (event) => this.handleEvent(session.id, event),
                onExit: (code, errorMessage) => this.handleExit(session.id, code, errorMessage),
                onApprovalRequest: (request) => this.handleApprovalRequest(session.id, request),
                onApiOutage: () => this.handleApiOutage(session.id),
                mcpServers,
                externalMcpConfigs,
                personaPrompt: config.personaPrompt,
                skillPrompt: config.skillPrompt,
                conversationOnly: isNoTools || conversationOnly,
                toolAllowList: isRestrictedTools ? toolAllowList : undefined,
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
        conversationOnly?: boolean,
        toolAllowList?: string[],
        mcpToolAllowList?: string[],
    ): void {
        const effectiveProject = session.workDir
            ? { ...project, workingDir: session.workDir }
            : project;

        const config = resolveSessionConfig(this.db, agent, session.agentId, session.projectId);

        // Conversation-only sessions get NO tool context.
        // When mcpToolAllowList is set, load MCP with only those tools (e.g. memory tools for /message).
        const hasMcpAllowList = mcpToolAllowList && mcpToolAllowList.length > 0;
        const mcpToolContext = conversationOnly ? null : (session.agentId
            ? (() => {
                const effectivePermissions = hasMcpAllowList ? mcpToolAllowList : config.resolvedToolPermissions;
                return this.buildMcpContext(session.agentId, session.source, session.id, depth, schedulerMode, effectivePermissions, schedulerActionType);
            })()
            : null);

        // Skip external MCP for conversation-only or restricted MCP sessions
        const externalMcpConfigs = (conversationOnly || hasMcpAllowList) ? [] : (session.agentId
            ? getActiveServersForAgent(this.db, session.agentId)
            : []);

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
                onExit: (code, errorMessage) => this.handleExit(session.id, code, errorMessage),
                onApprovalRequest: (request) => this.handleApprovalRequest(session.id, request),
                mcpToolContext,
                extendTimeout: (ms) => this.extendTimeout(session.id, ms),
                personaPrompt: config.personaPrompt,
                skillPrompt: config.skillPrompt,
                modelOverride,
                externalMcpConfigs,
                toolAllowList: conversationOnly ? [] : (toolAllowList ?? (isPollSession ? ['run_command'] : undefined)),
                conversationOnly,
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

    /**
     * Resume a session with non-persistent dir strategy — resolve the project
     * directory first (clone_on_demand / ephemeral), then delegate to
     * startProcessWithResolvedDir which handles all provider routing.
     */
    private async resumeWithResolvedDir(
        session: Session,
        project: import('../../shared/types').Project,
        prompt?: string,
    ): Promise<void> {
        const resolved = await resolveProjectDir(project);

        if (resolved.error) {
            log.warn('Resume: failed to resolve project directory', { projectId: project.id, error: resolved.error });
            this.eventBus.emit(session.id, {
                type: 'error',
                error: { message: `Failed to resolve project directory: ${resolved.error}`, type: 'dir_resolution_error' },
            } as ClaudeStreamEvent);
            return;
        }

        if (resolved.ephemeral) {
            this.ephemeralDirs.set(session.id, resolved);
        }

        const effectiveProject = { ...project, workingDir: resolved.dir };

        // Save the user message and build resume prompt
        if (prompt) {
            addSessionMessage(this.db, session.id, 'user', prompt);
        }
        const resumePrompt = this.buildResumePrompt(session, prompt);

        // Resolve agent and provider
        let effectiveAgent = session.agentId ? getAgent(this.db, session.agentId) : null;
        const providerType = effectiveAgent?.provider as LlmProviderType | undefined;
        const registry = LlmProviderRegistry.getInstance();
        let provider = providerType ? registry.get(providerType) : undefined;

        if (!provider && !providerType && !hasClaudeAccess()) {
            const ollamaFallback = registry.get('ollama');
            if (ollamaFallback) {
                provider = ollamaFallback;
                if (effectiveAgent && effectiveAgent.model && !effectiveAgent.model.includes(':') && !effectiveAgent.model.startsWith('qwen') && !effectiveAgent.model.startsWith('llama')) {
                    effectiveAgent = { ...effectiveAgent, model: ollamaFallback.getInfo().defaultModel };
                }
            }
        }

        // Reuse startProcessWithResolvedDir — it handles SDK vs direct routing + registration
        await this.startProcessWithResolvedDir(
            session,
            effectiveProject,
            effectiveAgent,
            resumePrompt ?? '',
            provider,
            { conversationOnly: session.name.startsWith('Discord message:') },
        );
    }

    private registerProcess(session: Session, process: SdkProcess): void {
        this.startingSession.delete(session.id);
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
        // CRITICAL: Detect stale "running" state — DB says running but no in-memory process.
        // This happens when a process crashes/exits without proper cleanup, or after server restart.
        // Without this check, resume attempts silently fail and the session appears stuck.
        if (!this.processes.has(session.id)) {
            const dbState = this.db.query('SELECT status, pid FROM sessions WHERE id = ?').get(session.id) as { status: string; pid: number | null } | null;
            if (dbState?.status === 'running') {
                log.warn(`Session ${session.id} marked as 'running' in DB but has no in-memory process — resetting to idle before resume`, {
                    stalePid: dbState.pid,
                });
                updateSessionStatus(this.db, session.id, 'idle');
                updateSessionPid(this.db, session.id, null);
                // Clean up any stale meta/timers from previous run
                this.sessionMeta.delete(session.id);
                this.timerManager.cleanupSession(session.id);
                this.approvalManager.cancelSession(session.id);
            }
        }

        if (this.processes.has(session.id)) {
            const meta = this.sessionMeta.get(session.id);
            if (meta && meta.turnCount >= MAX_TURNS_BEFORE_CONTEXT_RESET) {
                log.info(`Context reset: killing session ${session.id} after ${meta.turnCount} turns`);

                // Generate a context summary from existing messages before killing
                try {
                    const existingMessages = getSessionMessages(this.db, session.id);
                    if (existingMessages.length > 0) {
                        const summary = summarizeConversation(existingMessages);
                        meta.contextSummary = summary;
                        log.info(`Generated context summary for session ${session.id} (${summary.length} chars)`);
                    }
                } catch (err) {
                    log.warn(`Failed to generate context summary for session ${session.id}`, { error: err });
                }

                this.eventBus.emit(session.id, {
                    type: 'session_error',
                    session_id: session.id,
                    error: {
                        message: 'Session context limit reached — restarting with fresh context.',
                        errorType: 'context_exhausted',
                        severity: 'info',
                        recoverable: true,
                    },
                } as ClaudeStreamEvent);
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
        const defaultProject = {
            id: 'general',
            name: 'General',
            description: '',
            workingDir: process.cwd(),
            claudeMd: '',
            envVars: {},
            gitUrl: null,
            dirStrategy: 'persistent' as const,
            baseClonePath: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const baseProject = project ?? defaultProject;

        // Resolve project directory for non-persistent strategies (clone_on_demand, ephemeral)
        if (baseProject.dirStrategy !== 'persistent' && baseProject.dirStrategy !== 'worktree') {
            this.resumeWithResolvedDir(session, baseProject, prompt);
            return;
        }
        const effectiveProject: import('../../shared/types').Project = baseProject;

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

        // Detect tool tier for Discord /message sessions by name convention:
        //   "Discord message:"      → restricted tools (memory + read-only, all users)
        //   anything else           → full tools (normal session)
        const isRestrictedMessage = session.name.startsWith('Discord message:');
        const isConversationOnly = false; // /message sessions always get at least memory + read tools now
        const resumeToolAllowList = isRestrictedMessage ? ['Read', 'Glob', 'Grep'] : undefined;
        const resumeMcpToolAllowList = isRestrictedMessage ? ['corvid_recall_memory', 'corvid_read_on_chain_memories'] : undefined;

        // Load external MCP configs for resumed sessions (Figma, GitHub, etc.)
        // Skip for restricted /message sessions
        const resumeExternalMcpConfigs = isRestrictedMessage ? [] : (session.agentId
            ? getActiveServersForAgent(this.db, session.agentId)
            : []);

        let sp: SdkProcess;
        try {
            if (providerInstance && providerInstance.executionMode === 'direct') {
                // For restricted /message sessions, override permissions to only expose memory tools
                const effectivePermissions = resumeMcpToolAllowList ?? resumeConfig.resolvedToolPermissions;
                const mcpToolContext = session.agentId
                    ? this.buildMcpContext(session.agentId, session.source, session.id, undefined, undefined, effectivePermissions)
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
                    onExit: (code, errorMessage) => this.handleExit(session.id, code, errorMessage),
                    onApprovalRequest: (request) => this.handleApprovalRequest(session.id, request),
                    mcpToolContext,
                    extendTimeout: (ms) => this.extendTimeout(session.id, ms),
                    personaPrompt: resumeConfig.personaPrompt,
                    skillPrompt: resumeConfig.skillPrompt,
                    modelOverride: modelOverrideResume,
                    externalMcpConfigs: resumeExternalMcpConfigs,
                    toolAllowList: resumeToolAllowList,
                    conversationOnly: isConversationOnly,
                });
            } else {
                // For restricted /message sessions, override MCP tool permissions
                const effectivePermissions = resumeMcpToolAllowList ?? resumeConfig.resolvedToolPermissions;
                const hasMcpTools = !isConversationOnly && (resumeMcpToolAllowList || !isRestrictedMessage);
                const mcpServers = !hasMcpTools ? undefined : (session.agentId
                    ? (() => {
                        const ctx = this.buildMcpContext(session.agentId, session.source, session.id, undefined, undefined, effectivePermissions);
                        return ctx ? [createCorvidMcpServer(ctx)] : undefined;
                    })()
                    : undefined);
                sp = startSdkProcess({
                    session,
                    project: effectiveProject,
                    agent: effectiveAgent,
                    prompt: resumePrompt ?? '',
                    approvalManager: this.approvalManager,
                    onEvent: (event) => this.handleEvent(session.id, event),
                    onExit: (code, errorMessage) => this.handleExit(session.id, code, errorMessage),
                    onApprovalRequest: (request) => this.handleApprovalRequest(session.id, request),
                    onApiOutage: () => this.handleApiOutage(session.id),
                    mcpServers,
                    personaPrompt: resumeConfig.personaPrompt,
                    skillPrompt: resumeConfig.skillPrompt,
                    externalMcpConfigs: resumeExternalMcpConfigs,
                    conversationOnly: isConversationOnly,
                    toolAllowList: resumeToolAllowList,
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
    }

    private buildResumePrompt(session: Session, newPrompt?: string): string {
        const messages = getSessionMessages(this.db, session.id);
        const meta = this.sessionMeta.get(session.id);

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

        const parts: string[] = [];

        // Prepend context summary from previous session lifetime if available
        if (meta?.contextSummary) {
            parts.push(
                '<previous_context_summary>',
                meta.contextSummary,
                '</previous_context_summary>',
                '',
            );
        }

        parts.push(
            '<conversation_history>',
            instruction,
            '',
            ...historyLines,
            '</conversation_history>',
        );

        if (newPrompt) {
            parts.push('', newPrompt);
        }

        return parts.join('\n');
    }

    stopProcess(sessionId: string): void {
        const cp = this.processes.get(sessionId);
        if (cp) {
            cp.kill();
        }

        // Always update DB and emit stop event, even if no in-memory process exists.
        // This handles the case where the process died without proper cleanup but
        // the DB still says 'running' — the Stop button should always work.
        updateSessionPid(this.db, sessionId, null);
        updateSessionStatus(this.db, sessionId, 'stopped');

        this.eventBus.emit(sessionId, {
            type: 'session_stopped',
            session_id: sessionId,
        } as ClaudeStreamEvent);

        this.cleanupSessionState(sessionId);
    }

    /**
     * Remove all in-memory state for a session. Idempotent -- safe to call
     * multiple times or for sessions that have already been partially cleaned.
     *
     * This is the single source of truth for memory cleanup. All exit paths
     * (stopProcess, handleExit, shutdown) should funnel through here.
     */
    cleanupSessionState(sessionId: string): void {
        this.startingSession.delete(sessionId);
        this.processes.delete(sessionId);
        this.sessionMeta.delete(sessionId);
        this.eventBus.removeSessionSubscribers(sessionId);
        this.resilienceManager.deletePausedSession(sessionId);
        this.timerManager.cleanupSession(sessionId);
        this.approvalManager.cancelSession(sessionId);
        this.ownerQuestionManager.cancelSession(sessionId);
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

    sendMessage(sessionId: string, content: string | import('@anthropic-ai/sdk/resources/messages/messages').ContentBlockParam[]): boolean {
        const cp = this.processes.get(sessionId);
        if (!cp) return false;

        const sent = cp.sendMessage(content);
        if (!sent) {
            log.warn(`Failed to write to stdin for session ${sessionId}`);
            return false;
        }

        // Persist as text for session history (extract text from multimodal content)
        const textContent = typeof content === 'string'
            ? content
            : content.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map(b => b.text).join('\n');
        addSessionMessage(this.db, sessionId, 'user', textContent || '[image attachment(s)]');

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

        // Persist session metrics from direct-process when available
        if (event.type === 'result' && 'metrics' in event && event.metrics) {
            try {
                insertSessionMetrics(this.db, {
                    sessionId,
                    model: event.metrics.model,
                    tier: event.metrics.tier,
                    totalIterations: event.metrics.totalIterations,
                    toolCallCount: event.metrics.toolCallCount,
                    maxChainDepth: event.metrics.maxChainDepth,
                    nudgeCount: event.metrics.nudgeCount,
                    midChainNudgeCount: event.metrics.midChainNudgeCount,
                    explorationDriftCount: event.metrics.explorationDriftCount,
                    stallDetected: event.metrics.stallDetected,
                    stallType: event.metrics.stallType,
                    terminationReason: event.metrics.terminationReason,
                    durationMs: event.metrics.durationMs,
                    needsSummary: event.metrics.needsSummary,
                });
            } catch (err) {
                log.warn('Failed to persist session metrics', {
                    sessionId,
                    error: err instanceof Error ? err.message : String(err),
                });
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

    private handleExit(sessionId: string, code: number | null, errorMessage?: string): void {
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
            const detail = errorMessage ? `: ${errorMessage}` : '';
            addSessionMessage(this.db, sessionId, 'system',
                `Session exited unexpectedly (code ${code})${detail}. Send a message to resume.`);
        } else if (meta) {
            // Clean exit — record it so the conversation shows the boundary
            addSessionMessage(this.db, sessionId, 'system', 'Session completed.');
        }

        // Two-tier memory: auto-save session summary on clean exit
        // Saves to SQLite (pending) — MemorySyncService will sync to localnet chain
        if (code === 0) {
            this.saveSessionSummaryToMemory(sessionId);
        }

        if (code !== 0) {
            const isAutoRestartable = meta?.source === 'algochat' && (meta?.restartCount ?? 0) < MAX_RESTARTS;
            this.eventBus.emit(sessionId, {
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

        this.eventBus.emit(sessionId, {
            type: 'session_exited',
            session_id: sessionId,
            result: 'exited',
            total_cost_usd: 0,
            duration_ms: 0,
            num_turns: 0,
        } as ClaudeStreamEvent);

        // Clean up chat worktrees (work task worktrees are cleaned by WorkTaskService)
        this.cleanupChatWorktree(sessionId);

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

    /**
     * Save a session summary to long-term memory on clean exit.
     * Two-tier memory architecture: saves to SQLite with status='pending',
     * then MemorySyncService picks it up and syncs to localnet AlgoChat.
     * Fire-and-forget — errors are logged but do not block session cleanup.
     */
    private saveSessionSummaryToMemory(sessionId: string): void {
        try {
            const session = getSession(this.db, sessionId);
            if (!session?.agentId) return;

            const messages = getSessionMessages(this.db, sessionId);
            if (messages.length === 0) return;

            // Build a summary from the conversation
            const userMsgs = messages.filter(m => m.role === 'user');
            const assistantMsgs = messages.filter(m => m.role === 'assistant');
            if (userMsgs.length === 0) return;

            const summary = summarizeConversation(
                messages
                    .filter(m => m.role === 'user' || m.role === 'assistant')
                    .map(m => ({ role: m.role, content: m.content })),
            );

            const key = `session:${sessionId}:${new Date().toISOString().slice(0, 10)}`;
            const content = [
                `Session ${sessionId} (${session.source ?? 'unknown'} source)`,
                `Duration: ${userMsgs.length} user messages, ${assistantMsgs.length} assistant responses`,
                summary,
            ].join('\n');

            saveMemory(this.db, {
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
     * Clean up worktrees created for chat sessions (not work tasks).
     * Chat worktree directories contain `/chat-` in the path.
     * Also cleans up ephemeral project directories.
     * Fire-and-forget — errors are logged but do not block session cleanup.
     */
    private cleanupChatWorktree(sessionId: string): void {
        // Clean up ephemeral project directories
        const ephemeral = this.ephemeralDirs.get(sessionId);
        if (ephemeral) {
            this.ephemeralDirs.delete(sessionId);
            cleanupEphemeralDir(ephemeral).catch((err) => {
                log.warn('Failed to clean up ephemeral directory', {
                    sessionId,
                    dir: ephemeral.dir,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }

        // Clean up chat worktrees
        const session = getSession(this.db, sessionId);
        if (!session?.workDir || !session.workDir.includes('/chat-')) return;

        const project = session.projectId ? getProject(this.db, session.projectId) : null;
        if (!project?.workingDir) return;

        removeWorktree(project.workingDir, session.workDir, { cleanBranch: true }).catch((err) => {
            log.warn('Failed to clean up chat worktree', {
                sessionId,
                workDir: session.workDir,
                error: err instanceof Error ? err.message : String(err),
            });
        });
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

        // Fix DB-level stuck sessions: marked "running" but no live process.
        // This catches cases where handleExit was never called (crash, OOM, signal).
        const stuckSessions = this.db.query(
            `SELECT id, pid FROM sessions WHERE status IN ('running', 'loading')`
        ).all() as { id: string; pid: number | null }[];

        for (const row of stuckSessions) {
            if (!this.processes.has(row.id) && !this.resilienceManager.isPaused(row.id)) {
                updateSessionStatus(this.db, row.id, 'idle');
                updateSessionPid(this.db, row.id, null);
                this.timerManager.cleanupSession(row.id);
                this.approvalManager.cancelSession(row.id);
                log.warn(`Pruned stuck session ${row.id} (pid=${row.pid}) — DB said running but no process exists`);
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
