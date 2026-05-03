/**
 * Process spawning — handles the mechanics of starting and registering SDK and
 * direct-process sessions, including project directory resolution and MCP
 * context assembly.
 *
 * Extracted from manager.ts to isolate spawn logic from session orchestration.
 * These are the low-level "how to start a process" details; manager.ts retains
 * the high-level "when and why to start" orchestration.
 *
 * @module
 */

import type { Database } from 'bun:sqlite';
import type { Agent, Project, Session } from '../../shared/types';
import type { ScheduleActionType } from '../../shared/types/schedules';
import { getActiveServersForAgent } from '../db/mcp-servers';
import { addSessionMessage, updateSessionPid, updateSessionStatus } from '../db/sessions';
import { createLogger } from '../lib/logger';
import { cleanupEphemeralDir, type ResolvedDir, resolveProjectDir } from '../lib/project-dir';
import { createCorvidMcpServer } from '../mcp/sdk-tools';
import type { McpToolContext } from '../mcp/tool-handlers';
import type { LlmProvider } from '../providers/types';
import type { ApprovalManager } from './approval-manager';
import type { ApprovalRequestWire } from './approval-types';
import { startDirectProcess } from './direct-process';
import { resolveDirectToolAllowList } from './provider-routing';
import type { SdkProcess } from './sdk-process';
import { startSdkProcess } from './sdk-process';
import { resolveSessionConfig } from './session-config-resolver';
import type { SessionTimerManager } from './session-timer-manager';
import type { ClaudeStreamEvent } from './types';

const log = createLogger('ProcessSpawner');

/**
 * Mutable session metadata tracked in-memory by the ProcessManager.
 * Compatible with the internal SessionMeta interface in manager.ts.
 */
export interface SessionMetaForSpawn {
  startedAt: number;
  source: string;
  restartCount: number;
  lastKnownCostUsd: number;
  turnCount: number;
  lastActivityAt: number;
  contextSummary?: string;
}

/** Dependencies needed by the process spawner. */
export interface ProcessSpawnerDeps {
  db: Database;
  approvalManager: ApprovalManager;
  timerManager: SessionTimerManager;
  processes: Map<string, SdkProcess>;
  sessionMeta: Map<string, SessionMetaForSpawn>;
  ephemeralDirs: Map<string, ResolvedDir>;
  startingSession: Set<string>;
  onEvent: (sessionId: string, event: ClaudeStreamEvent) => void;
  onExit: (sessionId: string, code: number | null, errorMessage?: string) => void;
  onApprovalRequest: (sessionId: string, request: ApprovalRequestWire) => void;
  onApiOutage: (sessionId: string) => void;
  emitToSession: (sessionId: string, event: ClaudeStreamEvent) => void;
  extendTimeout: (sessionId: string, additionalMs: number) => boolean;
  buildMcpContext: (
    agentId: string,
    sessionSource?: string,
    sessionId?: string,
    depth?: number,
    schedulerMode?: boolean,
    resolvedToolPermissions?: string[] | null,
    schedulerActionType?: ScheduleActionType,
  ) => McpToolContext | null;
}

/** Options common to SDK and direct process start/resume calls. */
export interface SpawnOptions {
  depth?: number;
  schedulerMode?: boolean;
  schedulerActionType?: ScheduleActionType;
  conversationOnly?: boolean;
  toolAllowList?: string[];
  mcpToolAllowList?: string[];
}

/**
 * Register a newly-spawned process and update all in-memory and DB state.
 *
 * This is the final step in every process start/resume path. It:
 * - Removes the session from the "starting" guard set
 * - Registers the process in the processes map
 * - Initialises session metadata (preserving restartCount / costUsd from a previous run)
 * - Writes PID and status to the database
 * - Starts the stable-period and inactivity timers
 * - Emits `session_started`
 */
export function registerSpawnedProcess(deps: ProcessSpawnerDeps, session: Session, sp: SdkProcess): void {
  deps.startingSession.delete(session.id);
  deps.processes.set(session.id, sp);

  const now = Date.now();
  deps.sessionMeta.set(session.id, {
    startedAt: now,
    source: (session as { source?: string }).source ?? 'web',
    restartCount: deps.sessionMeta.get(session.id)?.restartCount ?? 0,
    lastKnownCostUsd: deps.sessionMeta.get(session.id)?.lastKnownCostUsd ?? 0,
    turnCount: 0,
    lastActivityAt: now,
  });

  updateSessionPid(deps.db, session.id, sp.pid);
  updateSessionStatus(deps.db, session.id, 'running');

  // Sanity-check: verify the DB write landed (catches concurrent writes / WAL issues)
  const verify = deps.db.query('SELECT status, pid FROM sessions WHERE id = ?').get(session.id) as {
    status: string;
    pid: number | null;
  } | null;
  if (verify?.status !== 'running' || verify?.pid !== sp.pid) {
    log.error('registerSpawnedProcess DB verification FAILED', {
      sessionId: session.id,
      expected: { status: 'running', pid: sp.pid },
      actual: verify,
    });
  }

  deps.timerManager.startStableTimer(session.id);
  deps.timerManager.startSessionTimeout(session.id);
  deps.timerManager.startStartupTimeout(session.id);

  log.info(`Started process for session ${session.id}`, { pid: sp.pid });

  deps.emitToSession(session.id, {
    type: 'session_started',
    session_id: session.id,
  } as ClaudeStreamEvent);
}

/**
 * Start an SDK (Claude Code) process for a session.
 *
 * Resolves session config (persona/skill prompts + tool permissions), builds
 * MCP context if applicable, then delegates to `startSdkProcess`. On success,
 * registers the process via `registerSpawnedProcess`.
 */
export function spawnSdkProcess(
  deps: ProcessSpawnerDeps,
  session: Session,
  project: Project,
  agent: Agent | null,
  prompt: string,
  options: SpawnOptions = {},
): void {
  const { depth, schedulerMode, schedulerActionType, conversationOnly, toolAllowList, mcpToolAllowList } = options;
  const effectiveProject = session.workDir ? { ...project, workingDir: session.workDir } : project;
  const config = resolveSessionConfig(deps.db, agent, session.agentId, session.projectId);

  // Determine tool / MCP access mode
  const isNoTools = conversationOnly || (toolAllowList && toolAllowList.length === 0);
  const isRestrictedTools = !isNoTools && toolAllowList && toolAllowList.length > 0;
  const hasMcpAllowList = mcpToolAllowList && mcpToolAllowList.length > 0;
  const skipMcp = isNoTools || (isRestrictedTools && !hasMcpAllowList);

  const mcpServers = skipMcp
    ? undefined
    : session.agentId
      ? (() => {
          const effectivePermissions = hasMcpAllowList ? mcpToolAllowList : config.resolvedToolPermissions;
          const ctx = deps.buildMcpContext(
            session.agentId,
            session.source,
            session.id,
            depth,
            schedulerMode,
            effectivePermissions,
            schedulerActionType,
          );
          return ctx ? [createCorvidMcpServer(ctx)] : undefined;
        })()
      : undefined;

  const externalMcpConfigs = skipMcp ? [] : session.agentId ? getActiveServersForAgent(deps.db, session.agentId) : [];

  let sp: SdkProcess;
  try {
    sp = startSdkProcess({
      session,
      project: effectiveProject,
      agent,
      prompt,
      approvalManager: deps.approvalManager,
      onEvent: (event) => deps.onEvent(session.id, event),
      onExit: (code, errorMessage) => deps.onExit(session.id, code, errorMessage),
      onApprovalRequest: (request) => deps.onApprovalRequest(session.id, request),
      onApiOutage: () => deps.onApiOutage(session.id),
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
    updateSessionStatus(deps.db, session.id, 'error');
    deps.emitToSession(session.id, {
      type: 'error',
      error: { message: `Failed to start SDK process: ${message}`, type: 'spawn_error' },
    } as ClaudeStreamEvent);
    deps.emitToSession(session.id, {
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

  registerSpawnedProcess(deps, session, sp);
}

/**
 * Start a direct (Ollama / non-SDK) process for a session.
 *
 * Similar to `spawnSdkProcess` but uses `startDirectProcess` and translates
 * SDK tool names to direct-process equivalents via `resolveDirectToolAllowList`.
 */
export function spawnDirectProcess(
  deps: ProcessSpawnerDeps,
  session: Session,
  project: Project,
  agent: Agent | null,
  prompt: string,
  provider: LlmProvider,
  options: SpawnOptions = {},
): void {
  const { depth, schedulerMode, schedulerActionType, conversationOnly, toolAllowList, mcpToolAllowList } = options;
  const effectiveProject = session.workDir ? { ...project, workingDir: session.workDir } : project;
  const config = resolveSessionConfig(deps.db, agent, session.agentId, session.projectId);

  const hasMcpAllowList = mcpToolAllowList && mcpToolAllowList.length > 0;
  const mcpToolContext = conversationOnly
    ? null
    : session.agentId
      ? (() => {
          const effectivePermissions = hasMcpAllowList ? mcpToolAllowList : config.resolvedToolPermissions;
          return deps.buildMcpContext(
            session.agentId,
            session.source,
            session.id,
            depth,
            schedulerMode,
            effectivePermissions,
            schedulerActionType,
          );
        })()
      : null;

  const externalMcpConfigs =
    conversationOnly || hasMcpAllowList
      ? []
      : session.agentId
        ? getActiveServersForAgent(deps.db, session.agentId)
        : [];

  const councilModel = process.env.COUNCIL_MODEL;
  const modelOverride = session.councilRole === 'chairman' && councilModel ? councilModel : undefined;

  const resolvedToolAllowList = conversationOnly ? [] : resolveDirectToolAllowList(toolAllowList, mcpToolAllowList);

  let sp: SdkProcess;
  try {
    const isPollSession = session.name.startsWith('Poll:');
    sp = startDirectProcess({
      session,
      project: effectiveProject,
      agent,
      prompt,
      provider,
      approvalManager: deps.approvalManager,
      onEvent: (event) => deps.onEvent(session.id, event),
      onExit: (code, errorMessage) => deps.onExit(session.id, code, errorMessage),
      onApprovalRequest: (request) => deps.onApprovalRequest(session.id, request),
      mcpToolContext,
      extendTimeout: (ms) => deps.extendTimeout(session.id, ms),
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
    updateSessionStatus(deps.db, session.id, 'error');
    deps.emitToSession(session.id, {
      type: 'error',
      error: { message: `Failed to start direct process: ${message}`, type: 'spawn_error' },
    } as ClaudeStreamEvent);
    deps.emitToSession(session.id, {
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

  registerSpawnedProcess(deps, session, sp);
}

/**
 * Resolve project directory for non-persistent dir strategies
 * (clone_on_demand, ephemeral), then dispatch to `spawnSdkProcess` or
 * `spawnDirectProcess`.
 *
 * On resolution failure, clears the starting guard and emits an error event.
 */
export async function startWithResolvedDir(
  deps: ProcessSpawnerDeps,
  session: Session,
  project: Project,
  agent: Agent | null,
  prompt: string,
  provider: LlmProvider | undefined,
  options: SpawnOptions = {},
): Promise<void> {
  const resolved = await resolveProjectDir(project);

  if (resolved.error) {
    log.warn('Failed to resolve project directory', { projectId: project.id, error: resolved.error });
    deps.startingSession.delete(session.id);
    deps.emitToSession(session.id, {
      type: 'error',
      error: { message: `Failed to resolve project directory: ${resolved.error}`, type: 'dir_resolution_error' },
    } as ClaudeStreamEvent);
    return;
  }

  const effectiveProject = { ...project, workingDir: resolved.dir };

  if (resolved.ephemeral) {
    deps.ephemeralDirs.set(session.id, resolved);
  }

  const ollamaProxyEnabled = process.env.OLLAMA_USE_CLAUDE_PROXY === 'true';
  const isOllamaProvider = provider?.type === 'ollama';

  if (provider && provider.executionMode === 'direct' && !(isOllamaProvider && ollamaProxyEnabled)) {
    spawnDirectProcess(deps, session, effectiveProject, agent, prompt, provider, options);
  } else {
    spawnSdkProcess(deps, session, effectiveProject, agent, prompt, options);
  }
}

/**
 * Resume a session whose project uses a non-persistent dir strategy.
 * Resolves the directory, saves the user prompt, then delegates to
 * `startWithResolvedDir`.
 */
export async function resumeWithResolvedDir(
  deps: ProcessSpawnerDeps,
  session: Session,
  project: Project,
  agent: Agent | null,
  resumePrompt: string,
  provider: LlmProvider | undefined,
  userPrompt?: string,
): Promise<void> {
  const resolved = await resolveProjectDir(project);

  if (resolved.error) {
    log.warn('Resume: failed to resolve project directory', { projectId: project.id, error: resolved.error });
    deps.emitToSession(session.id, {
      type: 'error',
      error: { message: `Failed to resolve project directory: ${resolved.error}`, type: 'dir_resolution_error' },
    } as ClaudeStreamEvent);
    return;
  }

  if (resolved.ephemeral) {
    deps.ephemeralDirs.set(session.id, resolved);
  }

  const effectiveProject = { ...project, workingDir: resolved.dir };

  if (userPrompt) {
    addSessionMessage(deps.db, session.id, 'user', userPrompt);
  }

  await startWithResolvedDir(deps, session, effectiveProject, agent, resumePrompt, provider, {
    conversationOnly: session.name.startsWith('Discord message:'),
  });
}

/**
 * Cleanup helper: remove and destroy ephemeral dirs on session exit.
 * Safe to call multiple times (idempotent).
 */
export function releaseEphemeralDir(deps: Pick<ProcessSpawnerDeps, 'ephemeralDirs'>, sessionId: string): void {
  const ephemeral = deps.ephemeralDirs.get(sessionId);
  if (!ephemeral) return;

  deps.ephemeralDirs.delete(sessionId);
  cleanupEphemeralDir(ephemeral).catch((err) => {
    log.warn('Failed to clean up ephemeral directory', {
      sessionId,
      dir: ephemeral.dir,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * Warm-start: feed a new message into an existing waiting process via sendMessage().
 *
 * Returns true if the message was delivered. Returns false if the process is dead
 * or done — the caller must fall back to coldStartProcess().
 *
 * This is a stub for the session keep-alive implementation (#2224).
 */
export async function warmStartProcess(deps: ProcessSpawnerDeps, session: Session, message: string): Promise<boolean> {
  const proc = deps.processes.get(session.id);
  if (!proc) return false;
  if (!proc.isAlive()) return false;

  try {
    return proc.sendMessage(message);
  } catch (err) {
    log.warn('warmStartProcess: sendMessage threw, falling back to cold start', {
      sessionId: session.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Cold-start: full spawn with directory resolution and context reconstruction.
 *
 * Equivalent to startWithResolvedDir — this named export makes the warm/cold
 * distinction explicit for callers implementing the keep-alive pattern (#2224).
 */
export async function coldStartProcess(
  deps: ProcessSpawnerDeps,
  session: Session,
  project: Project,
  agent: Agent,
  prompt: string,
  provider?: LlmProvider,
  options?: SpawnOptions,
): Promise<void> {
  return startWithResolvedDir(deps, session, project, agent, prompt, provider, options);
}
