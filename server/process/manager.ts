import type { Database } from 'bun:sqlite';
import type { Session } from '../../shared/types';
import type { ClaudeStreamEvent, DirectProcessMetrics } from './types';
import { extractContentText } from './types';
import { startSdkProcess, type SdkProcess } from './sdk-process';
import { startDirectProcess, summarizeConversation } from './direct-process';
import { hasCursorAccess as hasCursorCli } from './cursor-process';
import { ApprovalManager } from './approval-manager';
import { OwnerQuestionManager } from './owner-question-manager';
import type { ApprovalRequestWire } from './approval-types';
import { getProject } from '../db/projects';
import { getAgent } from '../db/agents';
import { LlmProviderRegistry } from '../providers/registry';
import type { LlmProviderType } from '../providers/types';
import type { ScheduleActionType } from '../../shared/types/schedules';
import { hasClaudeAccess } from '../providers/router';
import { getSession, getSessionMessages, updateSessionPid, updateSessionStatus, updateSessionCost, addSessionMessage, getParticipantForSession, updateSessionSummary } from '../db/sessions';
import { saveMemory } from '../db/agent-memories';
import { recordObservation, listObservations, boostObservation } from '../db/observations';
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
const DISCORD_RESTRICTED_MESSAGE_PREFIX = 'Discord message:';

// Circuit breaker: if the last N completions in a row were zero-turn,
// refuse to resume — the session is in a death loop.
const ZERO_TURN_CIRCUIT_BREAKER_THRESHOLD = 3;

/** Result of a provider routing decision — exported for testing. */
export interface RoutingDecision {
    /** Which provider to use (sdk, cursor, ollama). */
    provider: string;
    /** Why this provider was selected. */
    reason: 'default' | 'agent_config' | 'no_claude_access' | 'cursor_binary_missing' | 'ollama_via_claude_proxy';
    /** Whether this was a fallback from the original intent. */
    fallback: boolean;
    /** Model to use (may be cleared if original model is incompatible with the fallback provider). */
    effectiveModel: string;
}

/**
 * Determine the provider routing decision based on agent config and system state.
 * Pure function — no side effects, suitable for unit testing.
 */
export function resolveProviderRouting(opts: {
    providerType: LlmProviderType | undefined;
    agentModel: string;
    hasCursorBinary: boolean;
    hasClaudeAccess: boolean;
    hasOllamaProvider: boolean;
    ollamaDefaultModel?: string;
}): RoutingDecision {
    const { providerType, agentModel, hasCursorBinary, hasClaudeAccess: hasCloud, hasOllamaProvider, ollamaDefaultModel } = opts;

    // Cursor agent configured but binary missing → degrade to SDK
    if (providerType === 'cursor' && !hasCursorBinary) {
        const isCursorOnlyModel = agentModel === 'auto'
            || agentModel.startsWith('composer')
            || agentModel.startsWith('gpt-')
            || agentModel.startsWith('gemini-')
            || agentModel.startsWith('grok-');
        return {
            provider: 'sdk',
            reason: 'cursor_binary_missing',
            fallback: true,
            effectiveModel: isCursorOnlyModel ? '' : agentModel,
        };
    }

    // No explicit provider + no cloud access → try Ollama
    if (!providerType && !hasCloud && hasOllamaProvider) {
        // Check if Ollama should use Claude Code proxy for better tool/reasoning support
        if (process.env.OLLAMA_USE_CLAUDE_PROXY === 'true') {
            log.info('OLLAMA_USE_CLAUDE_PROXY enabled — routing Ollama through SDK (Claude Code)');
            const isOllamaModel = !agentModel || agentModel.includes(':') || agentModel.startsWith('qwen') || agentModel.startsWith('llama');
            return {
                provider: 'sdk',
                reason: 'ollama_via_claude_proxy',
                fallback: true,
                effectiveModel: isOllamaModel ? agentModel : (ollamaDefaultModel ?? ''),
            };
        }
        const isOllamaModel = !agentModel || agentModel.includes(':') || agentModel.startsWith('qwen') || agentModel.startsWith('llama');
        return {
            provider: 'ollama',
            reason: 'no_claude_access',
            fallback: true,
            effectiveModel: isOllamaModel ? agentModel : (ollamaDefaultModel ?? ''),
        };
    }

    // Normal routing
    return {
        provider: providerType ?? 'sdk',
        reason: providerType ? 'agent_config' : 'default',
        fallback: false,
        effectiveModel: agentModel,
    };
}

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
    private isRestrictedDiscordMessageSession(sessionName: string): boolean {
        return sessionName.startsWith(DISCORD_RESTRICTED_MESSAGE_PREFIX);
    }

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
            onTimeout: (sessionId) => this.stopProcess(sessionId, 'inactivity_timeout'),
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
            `UPDATE sessions SET status = 'idle', pid = NULL, restart_pending = 1 WHERE status IN ('running', 'loading')`
        ).run();
        if (result.changes > 0) {
            log.info(`Reset ${result.changes} stale session(s) from previous run (marked restart_pending)`);
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
        const ollamaProvider = registry.get('ollama');

        // Resolve the routing decision (pure function — testable independently)
        const routingDecision = resolveProviderRouting({
            providerType,
            agentModel: effectiveAgent?.model ?? '',
            hasCursorBinary: hasCursorCli(),
            hasClaudeAccess: hasClaudeAccess(),
            hasOllamaProvider: !!ollamaProvider,
            ollamaDefaultModel: ollamaProvider?.getInfo().defaultModel,
        });

        // Apply routing decision side effects
        if (routingDecision.fallback) {
            if (routingDecision.reason === 'no_claude_access' && ollamaProvider) {
                log.info(`No Claude access -- falling back to Ollama for session ${session.id}`);
                provider = ollamaProvider;
                if (effectiveAgent && routingDecision.effectiveModel !== effectiveAgent.model) {
                    log.warn(`Agent model "${effectiveAgent.model}" is not an Ollama model -- will use Ollama default`, { agentId: effectiveAgent.id });
                    effectiveAgent = { ...effectiveAgent, model: routingDecision.effectiveModel };
                }
            } else if (routingDecision.reason === 'ollama_via_claude_proxy') {
                // Ollama routed through SDK (Claude Code) for better tool/reasoning support
                log.info(`Routing Ollama through Claude Code proxy for session ${session.id}`, {
                    model: routingDecision.effectiveModel,
                });
                // Clear provider to use SDK mode
                provider = undefined;
                // Set model override for the Ollama cloud model
                if (effectiveAgent && routingDecision.effectiveModel) {
                    effectiveAgent = { ...effectiveAgent, model: routingDecision.effectiveModel };
                }
            } else if (routingDecision.reason === 'cursor_binary_missing') {
                log.warn(`Agent configured for cursor but cursor-agent binary not found — falling back to SDK`, {
                    sessionId: session.id,
                    agentId: effectiveAgent?.id,
                    agentModel: effectiveAgent?.model,
                });
                if (effectiveAgent && routingDecision.effectiveModel !== effectiveAgent.model) {
                    log.info(`Clearing Cursor-specific model "${effectiveAgent.model}" for SDK fallback`);
                    effectiveAgent = { ...effectiveAgent, model: routingDecision.effectiveModel };
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

        // Inject Ollama proxy env vars when routing through Claude Code
        const ollamaProxyUrl = process.env.OLLAMA_CLAUDE_PROXY_URL ?? `http://localhost:${process.env.PORT ?? '3000'}/api/ollama/claude-proxy`;
        const baseProject = routingDecision.reason === 'ollama_via_claude_proxy'
            ? {
                ...(project ?? defaultProject),
                envVars: {
                    ...(project?.envVars ?? {}),
                    ANTHROPIC_BASE_URL: ollamaProxyUrl,
                    ANTHROPIC_API_KEY: 'ollama-proxy',
                },
            }
            : (project ?? defaultProject);

        // Resolve project directory for non-persistent strategies (async)
        if (baseProject.dirStrategy !== 'persistent' && baseProject.dirStrategy !== 'worktree') {
            this.startProcessWithResolvedDir(session, baseProject, effectiveAgent, resolvedPrompt, provider, options);
            return;
        }

        // Use a minimal default project when session has no project
        const effectiveProject = baseProject;

        // Log and emit the provider routing decision for observability
        log.info(`Provider routing decision for session ${session.id}`, {
            provider: routingDecision.provider,
            reason: routingDecision.reason,
            fallback: routingDecision.fallback ?? false,
            agentId: effectiveAgent?.id,
            model: effectiveAgent?.model,
            source: session.source,
        });
        this.eventBus.emit(session.id, {
            type: 'system',
            session_id: session.id,
            subtype: 'provider_selected',
            statusMessage: `Provider: ${routingDecision.provider}${routingDecision.fallback ? ` (fallback: ${routingDecision.reason})` : ''}`,
        } as ClaudeStreamEvent);

        // Route: direct providers (cursor, ollama) go through startDirectProcessWrapped;
        // cursor no longer has a special case — it flows through the standard path.
        // Check if Ollama should use Claude Code proxy even when explicitly configured
        const ollamaProxyEnabled = process.env.OLLAMA_USE_CLAUDE_PROXY === 'true';
        const isOllamaProvider = provider?.type === 'ollama';
        if (provider && provider.executionMode === 'direct' && !(isOllamaProvider && ollamaProxyEnabled)) {
            this.startDirectProcessWrapped(session, effectiveProject, effectiveAgent, resolvedPrompt, provider, options?.depth, options?.schedulerMode, options?.schedulerActionType, options?.conversationOnly, options?.toolAllowList, options?.mcpToolAllowList);
        } else if (isOllamaProvider && ollamaProxyEnabled) {
            // Ollama via Claude Code proxy
            log.info(`Routing explicit Ollama agent through Claude Code proxy for session ${session.id}`, {
                model: effectiveAgent?.model,
            });
            const proxyUrl = process.env.OLLAMA_CLAUDE_PROXY_URL ?? `http://localhost:${process.env.PORT ?? '3000'}/api/ollama/claude-proxy`;
            const projectWithProxy = {
                ...effectiveProject,
                envVars: {
                    ...(effectiveProject.envVars ?? {}),
                    ANTHROPIC_BASE_URL: proxyUrl,
                    ANTHROPIC_API_KEY: 'ollama-proxy',
                },
            };
            this.startSdkProcessWrapped(session, projectWithProxy, effectiveAgent, resolvedPrompt, options?.depth, options?.schedulerMode, options?.schedulerActionType, options?.conversationOnly, options?.toolAllowList, options?.mcpToolAllowList);
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

        // Route: direct providers (cursor, ollama) go through startDirectProcessWrapped
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

        // Translate SDK tool names to direct-process equivalents and merge
        // mcpToolAllowList since direct processes use a single toolAllowList.
        const resolvedToolAllowList = conversationOnly
            ? []
            : resolveDirectToolAllowList(toolAllowList, mcpToolAllowList);

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
                toolAllowList: resolvedToolAllowList ?? (isPollSession ? ['run_command'] : undefined),
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
            { conversationOnly: this.isRestrictedDiscordMessageSession(session.name) },
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
                        const ctxProject = session.projectId ? getProject(this.db, session.projectId) : null;
                        const projectContext = ctxProject ? { name: ctxProject.name, workingDir: ctxProject.workingDir } : undefined;
                        const summary = summarizeConversation(existingMessages, projectContext);
                        meta.contextSummary = summary;
                        log.info(`Generated context summary for session ${session.id} (${summary.length} chars)`);

                        // Save as short-term observation for memory graduation
                        if (session.agentId) {
                            this.saveContextSummaryObservation(session, summary);
                        }
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

        // Circuit breaker: detect zero-turn death loops.
        // If the last N completions were all zero-turn, the session context is likely
        // too bloated to make progress. Refuse to resume and emit an error.
        const recentMessages = getSessionMessages(this.db, session.id);
        const recentSystemMsgs = recentMessages
            .filter((m) => m.role === 'system' && /Session (completed|exited).*Turns: 0/.test(m.content))
            .slice(-ZERO_TURN_CIRCUIT_BREAKER_THRESHOLD);
        if (recentSystemMsgs.length >= ZERO_TURN_CIRCUIT_BREAKER_THRESHOLD) {
            // Check that the last N system messages are ALL zero-turn completions
            // (no successful completions in between)
            const allSystemMsgs = recentMessages.filter((m) => m.role === 'system' && /Session (completed|exited)/.test(m.content));
            const lastN = allSystemMsgs.slice(-ZERO_TURN_CIRCUIT_BREAKER_THRESHOLD);
            const allZeroTurn = lastN.every((m) => /Turns: 0/.test(m.content));
            if (allZeroTurn) {
                log.warn('Zero-turn death loop detected — resetting session context', {
                    sessionId: session.id,
                    consecutiveZeroTurns: lastN.length,
                });

                // Generate a conversation summary before clearing messages
                try {
                    const ctxProject = session.projectId ? getProject(this.db, session.projectId) : null;
                    const projectContext = ctxProject ? { name: ctxProject.name, workingDir: ctxProject.workingDir } : undefined;
                    const summary = summarizeConversation(recentMessages, projectContext);
                    updateSessionSummary(this.db, session.id, summary);

                    // Save as short-term observation for memory graduation
                    if (session.agentId) {
                        this.saveContextSummaryObservation(session, summary);
                    }

                    // Store in meta so buildResumePrompt can inject it
                    const existingMeta = this.sessionMeta.get(session.id);
                    if (existingMeta) {
                        existingMeta.contextSummary = summary;
                        existingMeta.turnCount = 0;
                    } else {
                        this.sessionMeta.set(session.id, {
                            startedAt: Date.now(),
                            source: session.source ?? 'unknown',
                            restartCount: 0,
                            lastKnownCostUsd: 0,
                            turnCount: 0,
                            lastActivityAt: Date.now(),
                            contextSummary: summary,
                        });
                    }
                    log.info(`Generated context summary before death-loop reset (${summary.length} chars)`);
                } catch (err) {
                    log.warn('Failed to generate summary for death-loop reset', { error: err });
                }

                // Purge session messages to break the death loop — the summary preserves context
                this.db.query('DELETE FROM session_messages WHERE session_id = ?').run(session.id);
                updateSessionStatus(this.db, session.id, 'idle');

                // Clean up stale process state
                const existingProcess = this.processes.get(session.id);
                if (existingProcess) {
                    existingProcess.kill();
                    this.processes.delete(session.id);
                }
                updateSessionPid(this.db, session.id, null);
                this.timerManager.cleanupSession(session.id);
                this.approvalManager.cancelSession(session.id);

                this.eventBus.emit(session.id, {
                    type: 'session_error',
                    session_id: session.id,
                    error: {
                        message: 'Session context was bloated — restarting with fresh context.',
                        errorType: 'context_exhausted',
                        severity: 'info',
                        recoverable: true,
                    },
                } as ClaudeStreamEvent);

                // Fall through to start a fresh process with clean context
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

        const ollamaResumeProvider = registry.get('ollama');
        const resumeRouting = resolveProviderRouting({
            providerType,
            agentModel: effectiveAgent?.model ?? '',
            hasCursorBinary: hasCursorCli(),
            hasClaudeAccess: hasClaudeAccess(),
            hasOllamaProvider: !!ollamaResumeProvider,
            ollamaDefaultModel: ollamaResumeProvider?.getInfo().defaultModel,
        });

        if (resumeRouting.fallback) {
            if (resumeRouting.reason === 'no_claude_access' && ollamaResumeProvider) {
                log.info(`No Claude access -- falling back to Ollama for resumed session ${session.id}`);
                providerInstance = ollamaResumeProvider;
                if (effectiveAgent && resumeRouting.effectiveModel !== effectiveAgent.model) {
                    log.warn(`Agent model "${effectiveAgent.model}" is not an Ollama model -- will use Ollama default`, { agentId: effectiveAgent.id });
                    effectiveAgent = { ...effectiveAgent, model: resumeRouting.effectiveModel };
                }
            } else if (resumeRouting.reason === 'cursor_binary_missing') {
                log.warn(`Agent configured for cursor but cursor-agent binary not found on resume — falling back to SDK`, {
                    sessionId: session.id,
                    agentId: effectiveAgent?.id,
                });
                if (effectiveAgent && resumeRouting.effectiveModel !== effectiveAgent.model) {
                    effectiveAgent = { ...effectiveAgent, model: resumeRouting.effectiveModel };
                }
            }
        }

        const resumeConfig = resolveSessionConfig(this.db, effectiveAgent, session.agentId, session.projectId);

        // Detect tool tier for Discord /message sessions by name convention:
        //   "Discord message:"      → restricted tools (BASIC/STANDARD callers)
        //   anything else           → full tools (admin /message + normal sessions)
        const isRestrictedMessage = this.isRestrictedDiscordMessageSession(session.name);
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

        // Check for a pending server-restart confirmation and clear it
        const restartRow = this.db.query(
            'SELECT server_restart_initiated_at FROM sessions WHERE id = ?'
        ).get(session.id) as { server_restart_initiated_at: string | null } | null;
        const restartInitiatedAt = restartRow?.server_restart_initiated_at ?? null;
        if (restartInitiatedAt) {
            this.db.query('UPDATE sessions SET server_restart_initiated_at = NULL WHERE id = ?').run(session.id);
        }

        // Load recent active observations for this agent and increment their access count
        const observations = session.agentId
            ? listObservations(this.db, session.agentId, { status: 'active', limit: 5 })
            : [];
        for (const obs of observations) {
            boostObservation(this.db, obs.id, 0);
        }

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

        // Inject relevant short-term observations to restore per-agent context (#1751)
        if (observations.length > 0) {
            const obsLines = observations.map((o) =>
                `- [${o.source}] (score: ${o.relevanceScore.toFixed(1)}) ${o.content}`
            );
            parts.push(
                '<recent_observations>',
                'Relevant observations from past sessions with this agent:',
                '',
                ...obsLines,
                '</recent_observations>',
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

        // If a server restart was initiated from this session, inject a completion note
        // so the agent does not re-trigger the restart on resume (fixes #1570).
        if (restartInitiatedAt) {
            parts.push(
                '',
                '<server_restart_completed>',
                `The server was restarted during this session (initiated at ${restartInitiatedAt}).`,
                'The restart completed successfully — the server is now running with updated code.',
                'Do NOT restart the server again. Continue with the next task in your plan.',
                '</server_restart_completed>',
            );
        }

        if (newPrompt) {
            parts.push('', newPrompt);
        }

        return parts.join('\n');
    }

    stopProcess(sessionId: string, reason?: string): void {
        const cp = this.processes.get(sessionId);
        const meta = this.sessionMeta.get(sessionId);
        const session = getSession(this.db, sessionId);
        const durationMs = meta ? Date.now() - meta.startedAt : null;

        log.info('Stopping session', {
            sessionId,
            name: session?.name ?? 'unknown',
            source: meta?.source ?? session?.source ?? 'unknown',
            reason: reason ?? 'user_stop',
            hadProcess: !!cp,
            durationMs,
            durationHuman: durationMs ? `${Math.round(durationMs / 1000)}s` : 'unknown',
            turnCount: meta?.turnCount ?? 0,
        });

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

        // Mark all active sessions as restart_pending BEFORE killing them,
        // so the next server instance knows to resume them.
        const activeIds = [...this.processes.keys()];
        if (activeIds.length > 0) {
            const placeholders = activeIds.map(() => '?').join(',');
            this.db.query(
                `UPDATE sessions SET restart_pending = 1 WHERE id IN (${placeholders})`
            ).run(...activeIds);
            log.info(`Marked ${activeIds.length} active session(s) as restart_pending`);
        }

        for (const [sessionId] of this.processes) {
            this.stopProcess(sessionId, 'server_shutdown');
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

    /** @returns false if the session was stopped (e.g. credits exhausted) and the caller must abort. */
    private applyCostUpdateIfPresent(
        sessionId: string,
        event: Pick<ClaudeStreamEvent, 'total_cost_usd' | 'num_turns'>,
    ): boolean {
        if (event.total_cost_usd === undefined) return true;

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
                    const creditResult = deductTurnCredits(this.db, participantAddr, sessionId);
                    if (!creditResult.success) {
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
                        this.stopProcess(sessionId, 'credits_exhausted');
                        return false;
                    }
                    if (creditResult.isLow) {
                        const config = getCreditConfig(this.db);
                        log.info(`Low credits warning for session ${sessionId}`, {
                            remaining: creditResult.creditsRemaining,
                            threshold: config.lowCreditThreshold,
                        });
                        this.eventBus.emit(sessionId, {
                            type: 'system',
                            statusMessage: `Low credits: ${creditResult.creditsRemaining} remaining. Send ALGO to top up.`,
                        });
                    }
                }
            }
        }
        return true;
    }

    private persistDirectSessionMetrics(sessionId: string, metrics: DirectProcessMetrics): void {
        try {
            insertSessionMetrics(this.db, {
                sessionId,
                model: metrics.model,
                tier: metrics.tier,
                totalIterations: metrics.totalIterations,
                toolCallCount: metrics.toolCallCount,
                maxChainDepth: metrics.maxChainDepth,
                nudgeCount: metrics.nudgeCount,
                midChainNudgeCount: metrics.midChainNudgeCount,
                explorationDriftCount: metrics.explorationDriftCount,
                stallDetected: metrics.stallDetected,
                stallType: metrics.stallType,
                terminationReason: metrics.terminationReason,
                durationMs: metrics.durationMs,
                needsSummary: metrics.needsSummary,
            });
        } catch (err) {
            log.warn('Failed to persist session metrics', {
                sessionId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private handleEvent(sessionId: string, event: ClaudeStreamEvent): void {
        const meta = this.sessionMeta.get(sessionId);
        if (meta) {
            meta.lastActivityAt = Date.now();
            this.timerManager.startSessionTimeout(sessionId);
        }

        // Cursor (and similar): per-turn cost/metrics without broadcasting `result`
        // (Discord / work-queue listeners treat `result` as end-of-session).
        if (event.type === 'session_turn_metrics') {
            if (!this.applyCostUpdateIfPresent(sessionId, event)) return;
            this.persistDirectSessionMetrics(sessionId, event.metrics);
            return;
        }

        // Broadcast granular activity status so the dashboard reflects what the agent is doing
        this.broadcastActivityStatus(sessionId, event);

        if (event.type === 'assistant' && event.message?.content) {
            const text = extractContentText(event.message.content);
            if (text?.trim()) {
                addSessionMessage(this.db, sessionId, 'assistant', text);
            }
        }

        if (!this.applyCostUpdateIfPresent(sessionId, event)) return;

        if (event.type === 'result' && 'metrics' in event && event.metrics) {
            this.persistDirectSessionMetrics(sessionId, event.metrics);
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
        const session = getSession(this.db, sessionId);
        updateSessionPid(this.db, sessionId, null);

        const status = code === 0 ? 'idle' : 'error';
        updateSessionStatus(this.db, sessionId, status);

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
        if (this.broadcastFn) {
            this.broadcastFn('sessions', JSON.stringify({ type: 'session_status', sessionId, status }));
        }

        // Log unexpected exits as system messages so the user can see what happened
        if (code !== 0) {
            const detail = errorMessage ? `: ${errorMessage}` : '';
            const durationStr = durationMs ? ` after ${Math.round(durationMs / 1000)}s` : '';
            addSessionMessage(this.db, sessionId, 'system',
                `Session exited unexpectedly (code ${code})${detail}${durationStr}. Turns: ${meta?.turnCount ?? 0}. Send a message to resume.`);
        } else if (meta) {
            // Clean exit — record it so the conversation shows the boundary
            const durationStr = durationMs ? ` after ${Math.round(durationMs / 1000)}s` : '';
            addSessionMessage(this.db, sessionId, 'system', `Session completed${durationStr}. Turns: ${meta.turnCount}.`);
        }

        // Two-tier memory: auto-save session summary on clean exit
        // Saves to SQLite (pending) — MemorySyncService will sync to localnet chain
        if (code === 0) {
            this.saveSessionSummaryToMemory(sessionId);
        }

        // Always persist conversation summary to session record (even on crash)
        // so resumed sessions can pick up context from the previous conversation
        this.persistConversationSummary(sessionId);

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
     * Save a context summary as a short-term observation so it enters the
     * memory graduation pipeline (short-term → long-term → on-chain).
     */
    private saveContextSummaryObservation(session: Session, summary: string): void {
        try {
            const participant = getParticipantForSession(this.db, session.id);
            const counterparty = participant ? ` with ${participant}` : '';
            const content = `Conversation summary (${session.source ?? 'unknown'}${counterparty}, session ${session.id}):\n${summary}`;

            recordObservation(this.db, {
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
    private persistConversationSummary(sessionId: string): void {
        try {
            const messages = getSessionMessages(this.db, sessionId);
            const conversational = messages.filter(m => m.role === 'user' || m.role === 'assistant');
            if (conversational.length === 0) return;

            const summary = summarizeConversation(
                conversational.map(m => ({ role: m.role, content: m.content })),
            );
            updateSessionSummary(this.db, sessionId, summary);
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

// SDK (Claude Code) tool names → direct-process (Ollama) equivalents
const SDK_TO_DIRECT_TOOL_MAP: Record<string, string> = {
    'Read': 'read_file',
    'Write': 'write_file',
    'Edit': 'edit_file',
    'Glob': 'list_files',
    'Grep': 'search_files',
    'Shell': 'run_command',
};

/**
 * Translate SDK-style tool names to direct-process names and merge
 * mcpToolAllowList. Returns undefined if both inputs are empty/absent
 * (meaning "allow all tools").
 */
function resolveDirectToolAllowList(
    toolAllowList?: string[],
    mcpToolAllowList?: string[],
): string[] | undefined {
    const hasToolList = toolAllowList && toolAllowList.length > 0;
    const hasMcpList = mcpToolAllowList && mcpToolAllowList.length > 0;

    if (!hasToolList && !hasMcpList) return undefined;

    const result: string[] = [];

    if (hasToolList) {
        for (const name of toolAllowList) {
            const mapped = SDK_TO_DIRECT_TOOL_MAP[name];
            result.push(mapped ?? name);
        }
    }

    if (hasMcpList) {
        for (const name of mcpToolAllowList) {
            if (!result.includes(name)) {
                result.push(name);
            }
        }
    }

    return result.length > 0 ? result : undefined;
}
