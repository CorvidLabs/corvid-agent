---
module: process-manager
version: 1
status: active
files:
  - server/process/manager.ts
  - server/process/mcp-service-container.ts
  - server/process/session-config-resolver.ts
  - server/process/session-resilience-manager.ts
  - server/process/session-timer-manager.ts
  - server/process/resume-prompt-builder.ts
  - server/process/provider-routing.ts
  - server/process/session-exit-handler.ts
  - server/process/event-handler.ts
  - server/process/approval-manager.ts
  - server/process/approval-flow.ts
  - server/process/persona-injector.ts
  - server/process/session-lifecycle.ts
db_tables:
  - sessions
  - session_messages
depends_on:
  - specs/db/sessions/sessions.spec.md
  - specs/db/operations/credits.spec.md
---

# Process Manager

## Purpose

Central orchestration hub for agent session lifecycles. Manages starting, stopping, resuming, and monitoring Claude agent processes. Integrates every subsystem: persona/skill prompt injection, MCP tool resolution, credit deduction, provider routing (SDK vs direct, Claude vs Ollama), approval workflows, timeout management, auto-restart for AlgoChat sessions, and API outage recovery.

This is the most complex module in the system (~1135 lines after decomposition). It is the single point through which all agent sessions are created and managed. MCP service management and session config resolution have been extracted into dedicated modules.

## Public API

### Exported Types

| Type | Source | Description |
|------|--------|-------------|
| `EventCallback` | `./interfaces` | `(sessionId: string, event: ClaudeStreamEvent) => void` |
| `McpServices` | `mcp-service-container.ts` | Interface for registering all MCP-related services |
| `BuildContextOptions` | `mcp-service-container.ts` | Options for building MCP tool context |
| `SessionPrompts` | `session-config-resolver.ts` | Resolved persona + skill prompts for a session |
| `ResolvedSessionConfig` | `session-config-resolver.ts` | Complete resolved configuration for a session |
| `PausedSessionInfo` | `session-resilience-manager.ts` | Paused session tracking info: `pausedAt`, `resumeAttempts`, `nextResumeAt` |
| `SessionResilienceCallbacks` | `session-resilience-manager.ts` | Callbacks for resilience manager: `resumeProcess`, `stopProcess`, `isRunning`, `clearTimers`, `cancelApprovals` |
| `SessionTimerCallbacks` | `session-timer-manager.ts` | Callbacks for timer manager: `onTimeout`, `onStablePeriod`, `onStartupTimeout`, `isRunning`, `getLastActivityAt` |
| `SessionTimerConfig` | `session-timer-manager.ts` | Timer configuration: `agentTimeoutMs`, `stablePeriodMs`, `timeoutCheckIntervalMs`, `startupTimeoutMs` |
| `RoutingDecision` | `provider-routing.ts` | Provider routing result: `provider`, `reason`, `fallback`, `effectiveModel` |
| `OperationalMode` | `approval-manager.ts` | `'normal' \| 'queued' \| 'paused'` — server operational mode |
| `EventHandlerDeps` | `event-handler.ts` | Dependencies needed by the event handler |
| `SessionMetaForEvents` | `event-handler.ts` | Session metadata slice needed for event processing |
| `ExitHandlerDeps` | `session-exit-handler.ts` | Dependencies needed by the exit handler |
| `SessionMetaForExit` | `session-exit-handler.ts` | Mutable session metadata tracked in-memory for exit processing |
| `PersonaInjectionOptions` | `persona-injector.ts` | Options for persona/skill injection: agent, agentId, projectId |
| `SessionLifecycleConfig` | `session-lifecycle.ts` | Config for session lifecycle: sessionTtlMs, cleanupIntervalMs, maxSessionsPerProject |
| `SessionCleanupStats` | `session-lifecycle.ts` | Stats from a cleanup run: expiredSessions, orphanedProcesses, staleSubscriptions, memoryFreedMB |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ProcessManager` | Session lifecycle orchestrator |
| `McpServiceContainer` | Manages MCP service registration and tool context building (from mcp-service-container.ts) |
| `ApprovalManager` | Manages tool approval queuing, operational mode (normal/queued/paused), and approval/denial flow (from approval-manager.ts) |
| `SessionResilienceManager` | Handles session recovery: API outage pause/resume, crash restart with exponential backoff, orphan pruning (from session-resilience-manager.ts) |
| `SessionTimerManager` | Manages timer-based session concerns: stable-period timers, per-session inactivity timeouts, fallback timeout checker (from session-timer-manager.ts) |
| `SessionLifecycleManager` | Manages session lifecycle: automatic cleanup of expired sessions, memory management, orphan timer cleanup, per-project session limits (from session-lifecycle.ts) |

### Exported Functions (from manager.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveProviderRouting` | `(opts: { providerType, agentModel, hasCursorBinary, hasClaudeAccess, hasOllamaProvider, ollamaDefaultModel? })` | `RoutingDecision` | Re-exported from `provider-routing.ts` for backward compatibility |

### Exported Functions (from session-config-resolver.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveSessionPrompts` | `(db, agent, projectId)` | `SessionPrompts` | Resolve persona and skill prompts for a session |
| `resolveToolPermissions` | `(db, agentId, projectId)` | `string[] \| null` | Resolve merged tool permissions from agent and project skill bundles |
| `resolveSessionConfig` | `(db, agent, agentId, projectId)` | `ResolvedSessionConfig` | Resolve complete session config (prompts + tools + MCP servers) |

### Exported Functions (from provider-routing.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveProviderRouting` | `(opts: { providerType, agentModel, hasCursorBinary, hasClaudeAccess, hasOllamaProvider, ollamaDefaultModel? })` | `RoutingDecision` | Pure function to determine provider routing decision based on agent config and system state |
| `resolveDirectToolAllowList` | `(toolAllowList?, mcpToolAllowList?)` | `string[] \| undefined` | Translate SDK tool names to direct-process allow list and merge `mcpToolAllowList` |

### Exported Functions (from resume-prompt-builder.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `buildResumePrompt` | `(db, session, sessionMeta?, newPrompt?)` | `string` | Build resume prompt from session history, observations, and context |

### Exported Functions (from event-handler.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleSessionEvent` | `(deps: EventHandlerDeps, sessionId, event)` | `void` | Process SDK/direct-process events: persist messages, broadcast activity, handle cost/credits |
| `applyCostUpdate` | `(deps, sessionId, event)` | `boolean` | Apply cost update from a stream event. Returns `false` if the session was stopped (credits exhausted) |
| `persistDirectSessionMetrics` | `(db, sessionId, metrics)` | `void` | Persist metrics from a direct-process session |
| `broadcastActivityStatus` | `(deps, sessionId, status)` | `void` | Broadcast activity status to WebSocket subscribers |

`EventHandlerDeps` fields: `db`, `eventBus`, `broadcastFn`, `isOwnerAddress`, `getSessionMeta`, `stopProcess`, `resetSessionTimeout`.

`SessionMetaForEvents` fields: `lastActivityAt`, `lastKnownCostUsd`, `source`.

### Exported Functions (from approval-flow.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `buildApprovalRequestEvent` | `(request: ApprovalRequestWire)` | `ClaudeStreamEvent` | Build the event payload for an approval request to emit to session subscribers |
| `createApprovalRequestHandler` | `(eventBus: ISessionEventBus)` | `(sessionId, request) => void` | Factory that creates the `onApprovalRequest` callback for SDK/direct process spawners |
| `resolveApproval` | `(approvalManager, requestId, behavior, message?)` | `boolean` | Resolve a pending approval request; returns false if not found |
| `cancelSessionApprovals` | `(approvalManager, sessionId)` | `void` | Cancel all pending approvals for a session (called on stop/cleanup) |

### Exported Types and Functions (from persona-injector.ts)

| Export | Kind | Description |
|--------|------|-------------|
| `PersonaInjectionOptions` | interface | Options for persona/skill injection: `agent`, `agentId`, `projectId` |
| `injectPersonaAndSkills` | function | `(db, opts: PersonaInjectionOptions) → ResolvedSessionConfig` — Resolve persona prompt, skill prompt, and tool permissions with structured logging |
| `resolvePrompts` | function | `(db, agent, projectId) → SessionPrompts` — Resolve only persona and skill prompts (no tool permission computation) |
| `resolvePermissions` | function | `(db, agentId, projectId) → string[] \| null` — Resolve only tool permissions for an agent+project pair |

### Exported Types (from persona-injector.ts)

| Type | Description |
|------|-------------|
| `PersonaInjectionOptions` | Options for persona/skill injection: `agent`, `agentId`, `projectId` |

### Exported Types/Classes (from session-lifecycle.ts)

| Export | Kind | Description |
|--------|------|-------------|
| `SessionLifecycleConfig` | interface | Configuration for session lifecycle: `sessionTtlMs`, `cleanupIntervalMs`, `maxSessionsPerProject` |
| `SessionCleanupStats` | interface | Stats returned from cleanup: `expiredSessions`, `orphanedProcesses`, `staleSubscriptions`, `memoryFreedMB` |
| `SessionLifecycleManager` | class | Manages automatic cleanup of expired sessions, orphaned processes, and stale subscriptions |

### Exported Types (from session-lifecycle.ts)

| Type | Kind | Description |
|------|------|-------------|
| `SessionLifecycleConfig` | interface | Configuration for session TTL, cleanup interval, and max sessions per project |
| `SessionCleanupStats` | interface | Stats returned from cleanup runs: expired sessions, orphaned processes, stale subscriptions, memory freed |
| `SessionLifecycleManager` | class | Manages session lifecycle — automatic cleanup of expired sessions, memory management, orphan pruning, per-project session limits |

`SessionLifecycleConfig` fields: `sessionTtlMs`, `cleanupIntervalMs`, `maxSessionsPerProject`.

`SessionCleanupStats` fields: `expiredSessions`, `orphanedProcesses`, `staleSubscriptions`, `memoryFreedMB`.

### Exported Functions (from session-exit-handler.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleSessionExit` | `(deps: ExitHandlerDeps, sessionId, code, errorMessage?)` | `void` | Process session exit: save summary, cleanup worktree, manage auto-restart |
| `saveSessionSummaryToMemory` | `(db, sessionId)` | `void` | Save session summary to long-term memory on clean exit (two-tier memory architecture) |
| `saveContextSummaryObservation` | `(db, session, summary)` | `void` | Save context summary as a short-term observation for memory graduation pipeline |
| `persistConversationSummary` | `(db, sessionId)` | `void` | Persist conversation summary to session record for context continuity on resume |
| `cleanupChatWorktree` | `(deps, sessionId)` | `void` | Clean up worktrees created for chat sessions and ephemeral project directories |

`ExitHandlerDeps` fields: `db`, `eventBus`, `broadcastFn`, `processes`, `sessionMeta`, `ephemeralDirs`, `resilienceManager`, `timerManager`, `approvalManager`, `ownerQuestionManager`, `cleanupSessionState`.

`SessionMetaForExit` fields: `startedAt`, `source`, `restartCount`, `lastKnownCostUsd`, `turnCount`, `lastActivityAt`, `contextSummary?`.

#### McpServiceContainer Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setServices` | `(services: McpServices)` | `void` | Register all external service dependencies for MCP tools |
| `buildContext` | `(options: BuildContextOptions)` | `McpToolContext \| null` | Build a per-session MCP tool context. Returns `null` if services are not yet registered |
| `isAvailable` | _(getter)_ | `boolean` | Whether services have been registered (i.e., `setServices` has been called) |

`McpServices` fields: `messenger`, `directory`, `walletService`, `encryptionConfig?`, `workTaskService?`, `schedulerService?`, `workflowService?`, `notificationService?`, `questionDispatcher?`, `reputationScorer?`, `reputationAttestation?`, `reputationVerifier?`, `astParserService?`, `permissionBroker?`, `processManager?`, `flockDirectoryService?`, `browserService?`.

`BuildContextOptions` fields: `agentId`, `db`, `sessionSource?`, `sessionId?`, `depth?`, `schedulerMode?`, `schedulerActionType?`, `resolvedToolPermissions?`, `emitStatus?`, `extendTimeout?`, `broadcastOwnerMessage?`, `ownerQuestionManager?`.

### Exported Constants (server/process/session-resilience-manager.ts)

| Constant | Type | Description |
|----------|------|-------------|
| `MAX_RESTARTS` | `number` (3) | Maximum number of crash restarts before giving up |

#### SessionResilienceManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, eventBus: ISessionEventBus, callbacks: SessionResilienceCallbacks` | `SessionResilienceManager` | Creates resilience manager with database, event bus, and lifecycle callbacks |
| `handleApiOutage` | `(sessionId: string)` | `void` | Pause a session due to API outage. Clears timers, cancels approvals, sets status to 'paused', schedules auto-resume |
| `resumeSession` | `(sessionId: string)` | `boolean` | Manually resume a paused session. Returns false if not paused |
| `isPaused` | `(sessionId: string)` | `boolean` | Check if a session is currently paused |
| `getPausedSessionIds` | `()` | `string[]` | Get IDs of all currently paused sessions |
| `pausedSessionCount` | _(getter)_ | `number` | Number of currently paused sessions |
| `deletePausedSession` | `(sessionId: string)` | `void` | Remove a session from the paused tracking map |
| `attemptRestart` | `(sessionId: string, restartCount: number)` | `boolean` | Schedule a crash restart with exponential backoff (5s * 3^n). Returns false if max restarts exceeded |
| `startAutoResumeChecker` | `()` | `void` | Start periodic checker that resumes paused sessions with exponential backoff (5min base, 3x multiplier, 60min cap, max 10 attempts) |
| `startOrphanPruner` | `(pruneCallback: () => number)` | `void` | Start periodic orphan pruner (every 5 minutes) |
| `checkApiHealth` | `()` | `Promise<boolean>` | Quick connectivity check to Anthropic API. Returns true if status < 500 |
| `shutdown` | `()` | `void` | Clear all timers and paused session state |

#### SessionTimerManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `callbacks: SessionTimerCallbacks, config?: Partial<SessionTimerConfig>` | `SessionTimerManager` | Creates timer manager with callbacks and optional config overrides |
| `startStableTimer` | `(sessionId: string)` | `void` | Start stable-period timer. After continuous uptime (default 10min), fires onStablePeriod to reset restart counter |
| `clearStableTimer` | `(sessionId: string)` | `void` | Clear the stable-period timer for a session |
| `startStartupTimeout` | `(sessionId: string)` | `void` | Start startup timeout (default 90s). If no event arrives in time, fires `onStartupTimeout` |
| `clearStartupTimeout` | `(sessionId: string)` | `void` | Clear the startup timeout for a session (called on first event) |
| `startSessionTimeout` | `(sessionId: string, timeoutMs?: number)` | `void` | Start or reset per-session inactivity timeout (default 30min via AGENT_TIMEOUT_MS) |
| `extendTimeout` | `(sessionId: string, additionalMs: number)` | `boolean` | Extend a running session's timeout (clamped to 4x agentTimeoutMs). Returns false if not running |
| `clearSessionTimeout` | `(sessionId: string)` | `void` | Clear the inactivity timeout for a session |
| `startTimeoutChecker` | `(getSessionIds?: () => string[])` | `void` | Start polling fallback that catches sessions surviving past their inactivity timeout (safety net, every 60s) |
| `checkTimeouts` | `(sessionIds: string[])` | `void` | Check all provided session IDs for timeout violations |
| `cleanupSession` | `(sessionId: string)` | `void` | Clean up all timers for a session to prevent timer leaks |
| `getStats` | `()` | `{ sessionTimeouts: number; stableTimers: number; startupTimeouts: number }` | Get count of active timers for monitoring |
| `shutdown` | `()` | `void` | Shut down all timers |

#### ProcessManager Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |

Side effects on construction:
- Creates `ApprovalManager` and `OwnerQuestionManager`
- Resets stale sessions (running -> idle) from previous server instance
- Starts timeout checker interval (60s)
- Starts auto-resume checker interval (60s)
- Starts orphan pruner interval (5min)

#### ProcessManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setBroadcast` | `(fn: (topic, data) => void)` | `void` | Inject WebSocket broadcast function |
| `setOwnerCheck` | `(fn: (address) => boolean)` | `void` | Inject owner check for credit exemption |
| `setMcpServices` | `(services: McpServices)` | `void` | Register all MCP-related services for corvid_* tools (delegates to McpServiceContainer) |
| `startProcess` | `(session: Session, prompt?: string, options?: { depth?, schedulerMode? })` | `void` | Start a new agent process. Routes to SDK or direct based on provider |
| `resumeProcess` | `(session: Session, prompt?: string)` | `void` | Resume an existing session. Builds history-aware prompt, handles context reset |
| `stopProcess` | `(sessionId: string, reason?: string)` | `void` | Kill process, set status to stopped, emit session_stopped, clean up state |
| `cleanupSessionState` | `(sessionId: string)` | `void` | Remove all in-memory state for a session (idempotent) |
| `getMemoryStats` | `()` | `{ processes, subscribers, sessionMeta, pausedSessions, sessionTimeouts, stableTimers, startupTimeouts, globalSubscribers }` | Snapshot of in-memory map sizes |
| `sendMessage` | `(sessionId: string, content: string \| ContentBlockParam[])` | `boolean` | Send a message to a running process. Persists to DB, tracks turns |
| `isRunning` | `(sessionId: string)` | `boolean` | Check if a process is active |
| `subscribe` | `(sessionId: string, callback: EventCallback)` | `void` | Subscribe to session events (replays thinking state for late subscribers) |
| `unsubscribe` | `(sessionId: string, callback: EventCallback)` | `void` | Unsubscribe from session events |
| `subscribeAll` | `(callback: EventCallback)` | `void` | Subscribe to events from all sessions |
| `unsubscribeAll` | `(callback: EventCallback)` | `void` | Unsubscribe from global events |
| `getActiveSessionIds` | `()` | `string[]` | List all sessions with running processes |
| `flushActiveSessionSummaries` | `()` | `void` | Force-persist conversation summaries for all active sessions (called on graceful shutdown) |
| `shutdown` | `()` | `void` | Stop all processes, flush summaries, clear all timers and state |
| `resumeSession` | `(sessionId: string)` | `boolean` | Resume a paused session (from API outage). Returns false if not paused |
| `isPaused` | `(sessionId: string)` | `boolean` | Check if a session is paused |
| `getPausedSessionIds` | `()` | `string[]` | List all paused session IDs |
| `extendTimeout` | `(sessionId: string, additionalMs: number)` | `boolean` | Extend a session's timeout (capped at 4x default) |

#### Public Properties

| Property | Type | Description |
|----------|------|-------------|
| `approvalManager` | `ApprovalManager` | Manages tool approval requests |
| `ownerQuestionManager` | `OwnerQuestionManager` | Manages owner question flow |

## Invariants

1. **Session-process 1:1 mapping**: At most one process runs per session ID. `startProcess` kills any existing process for that session first
2. **Stale session cleanup on startup**: All sessions with status `running` are reset to `idle` with `pid = NULL` on construction
3. **Persona/skill prompt injection**: If an agent has a persona, `composePersonaPrompt` is called and injected. Skill bundle prompts from both agent-level and project-level are merged
4. **Tool permission resolution chain**: Agent base permissions -> merge agent skill bundle tools -> merge project skill bundle tools (only if agent has no explicit `mcpToolPermissions`)
5. **Provider routing**: Resolved by `resolveProviderRouting()`. If agent has cursor provider but binary is missing, fallback to SDK (clearing Cursor-only models). If no provider and no Claude access, auto-fallback to Ollama. If `OLLAMA_USE_CLAUDE_PROXY=true`, Ollama agents route through SDK (Claude Code) for better tool/reasoning support. SDK process for Claude; direct process for Ollama/other providers
6. **Context reset**: After `MAX_TURNS_BEFORE_CONTEXT_RESET` (40) user messages, the process is killed and restarted through the resume path with capped message history (last 40 messages). A conversation summary (including file paths modified, key decisions, and work status) is saved as a memory observation (`source: 'session'`, `relevanceScore: 2.0`) so it can graduate to long-term memory if accessed again
7. **Resume prompt construction**: Builds a `<conversation_history>` block from the last 20 messages (each truncated to 2000 chars), then appends the new prompt. Relevant short-term observations are loaded and injected as a `<relevant_observations>` block to provide context continuity
7a. **Zero-turn circuit breaker**: If the last `ZERO_TURN_CIRCUIT_BREAKER_THRESHOLD` (3) completions in a row produced zero turns, the session is refused to resume — it is in a death loop
8. **Auto-restart for AlgoChat**: Non-zero exits from AlgoChat sessions trigger auto-restart with exponential backoff (5s * 3^n, max 3 restarts). Restart counter resets after 10 minutes of stability
9. **API outage handling**: Detected outages pause the session (not counted as restart). Auto-resume with exponential backoff (5min * 3^n, cap 60min, max 10 attempts) after API health check
10. **Timeout enforcement**: Per-session timeout (`AGENT_TIMEOUT_MS`, default 30min) with a 60s polling fallback. Timeout can be extended up to 4x via `extendTimeout`
11. **Credit deduction for AlgoChat**: On each cost event for `algochat`-source sessions, credits are deducted from the participant wallet. Owner wallets are exempt. Session is stopped if credits exhausted
12. **Event emission before cleanup**: All exit/stop paths emit events BEFORE removing subscribers, so listeners receive the final event
13. **Orphan pruning**: Every 5 minutes, removes subscriber/meta entries for sessions with no active process and not paused
14. **Memory cleanup single source**: `cleanupSessionState` is the single entry point for all cleanup (process, meta, subscribers, paused state, timers, approval/question managers)
15. **Cursor per-turn metrics**: When the Cursor CLI completes a model turn it emits `result` events that must not be broadcast (Discord and other listeners treat `result` as session end). The manager accepts synthetic `session_turn_metrics` events from `cursor-process` to persist cost and `session_metrics` rows without broadcasting `result`

## Behavioral Examples

### Scenario: Start a new session with persona and skills

- **Given** an agent with a persona and two skill bundles assigned
- **When** `startProcess(session, prompt)` is called
- **Then** persona prompt is composed and injected, skill prompts are merged from agent and project bundles, MCP server is created with resolved tool permissions, and the SDK process starts

### Scenario: Resume a session with message history

- **Given** a session with 25 messages in the database
- **When** `resumeProcess(session, "new question")` is called
- **Then** the last 20 messages are used to build a conversation history block, the new prompt is appended, and a fresh process starts

### Scenario: Context reset after many turns

- **Given** a running session where `sendMessage` has been called 8 times
- **When** `resumeProcess(session, "another message")` is called
- **Then** the existing process is killed, a conversation summary is recorded as a memory observation with `relevanceScore: 2.0`, and a new process starts with the resume prompt

### Scenario: AlgoChat session crashes and auto-restarts

- **Given** an AlgoChat session that exits with code 1
- **When** `handleExit` is called
- **Then** after 5 seconds (5000 * 3^0), the session is resumed
- **When** it crashes again
- **Then** after 15 seconds (5000 * 3^1), it is resumed again
- **When** it stays up for 10+ minutes
- **Then** the restart counter resets to 0

### Scenario: API outage pauses and auto-resumes

- **Given** a running session where an API outage is detected
- **When** `handleApiOutage` is called
- **Then** the process is killed, session status set to `paused`, error emitted
- **When** 5 minutes pass and API health check succeeds
- **Then** the session is automatically resumed

### Scenario: Credit exhaustion mid-session

- **Given** an AlgoChat session from a non-owner wallet with 1 credit remaining
- **When** a cost event fires and `deductTurnCredits` returns `{ success: false }`
- **Then** a `credits_exhausted` error is emitted and the session is stopped

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Project not found for session | Error event emitted with type `not_found`, process not started |
| SDK/direct process spawn fails | Session status set to `error`, error event emitted |
| Resume of nonexistent process | Starts a fresh process with resume prompt |
| `sendMessage` to non-running session | Returns `false` |
| `sendMessage` to zombie process (`isAlive()=false`) | Returns `false` and evicts process from Map so `resumeProcess` can restart |
| `resumeSession` for non-paused session | Returns `false` |
| Max restarts exceeded (3) | Session left in error state, no more retries |
| Auto-resume max attempts exceeded (10) | Session set to `error`, `auto_resume_exhausted` event emitted |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/sdk-process.ts` | `startSdkProcess`, `SdkProcess` |
| `server/process/direct-process.ts` | `startDirectProcess` |
| `server/process/approval-manager.ts` | `ApprovalManager` |
| `server/process/owner-question-manager.ts` | `OwnerQuestionManager` |
| `server/process/event-bus.ts` | `SessionEventBus` |
| `server/process/mcp-service-container.ts` | `McpServiceContainer`, `McpServices` |
| `server/process/session-config-resolver.ts` | `resolveSessionConfig` |
| `server/process/types.ts` | `ClaudeStreamEvent`, `SessionTurnMetricsEvent`, `extractContentText` |
| `server/db/sessions.ts` | Session CRUD, message operations |
| `server/db/projects.ts` | `getProject` |
| `server/db/agents.ts` | `getAgent`, `getAlgochatEnabledAgents` |
| `server/db/mcp-servers.ts` | `getActiveServersForAgent` |
| `server/db/observations.ts` | `recordObservation` |
| `server/db/credits.ts` | `deductTurnCredits`, `getCreditConfig` |
| `server/db/spending.ts` | `recordApiCost` |
| `server/providers/registry.ts` | `LlmProviderRegistry` |
| `server/providers/router.ts` | `hasClaudeAccess` |
| `server/mcp/sdk-tools.ts` | `createCorvidMcpServer` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Lifecycle: construction, `setBroadcast`, `setMcpServices`, `shutdown` |
| `server/work/service.ts` | `startProcess`, `subscribe`, `unsubscribe`, `isRunning`, `stopProcess` |
| `server/scheduler/service.ts` | `startProcess` |
| `server/routes/sessions.ts` | `startProcess`, `resumeProcess`, `stopProcess`, `sendMessage`, `subscribe`, `isRunning` |
| `server/ws/handler.ts` | `subscribe`, `unsubscribe`, `subscribeAll` |
| `server/algochat/bridge.ts` | `startProcess`, `resumeProcess`, `subscribe` |

## Database Tables

Uses `sessions` and `session_messages` tables (see `specs/db/sessions/sessions.spec.md`).

Additionally reads from:
- `agents` (for agent config, persona, skill bundles)
- `projects` (for working directory, CLAUDE.md)
- `credit_ledger` / `credit_transactions` (via credits module)
- `daily_spending` (via spending module)

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `AGENT_TIMEOUT_MS` | `1800000` (30 min) | Per-session timeout before forced stop |
| `COUNCIL_MODEL` | (none) | Model override for council chairman sessions |
| `OLLAMA_USE_CLAUDE_PROXY` | `"false"` | When `"true"`, Ollama agents route through SDK (Claude Code) for better tool/reasoning support |

Internal constants (not env-configurable):

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_RESTARTS` | `3` | Max auto-restarts for AlgoChat sessions |
| `BACKOFF_BASE_MS` | `5000` | Base backoff for restart (5s) |
| `STABLE_PERIOD_MS` | `600000` | 10 min uptime resets restart counter |
| `ORPHAN_PRUNE_INTERVAL_MS` | `300000` | 5 min between orphan prune sweeps |
| `AUTO_RESUME_BASE_MS` | `300000` | 5 min initial auto-resume delay |
| `AUTO_RESUME_MULTIPLIER` | `3` | Exponential backoff factor |
| `AUTO_RESUME_CAP_MS` | `3600000` | 1 hour max auto-resume delay |
| `AUTO_RESUME_MAX_ATTEMPTS` | `10` | Give up after 10 attempts |
| `MAX_TURNS_BEFORE_CONTEXT_RESET` | `40` | Turns before killing for context reset |
| `ZERO_TURN_CIRCUIT_BREAKER_THRESHOLD` | `3` | Consecutive zero-turn completions before refusing to resume |
| `DISCORD_RESTRICTED_MESSAGE_PREFIX` | `'Discord message:'` | Session name prefix for restricted Discord `/message` sessions |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
| 2026-03-06 | corvid-agent | Extracted McpServiceContainer and SessionConfigResolver (#453) |
| 2026-03-13 | corvid-agent | Added session-resilience-manager.ts (SessionResilienceManager: API outage handling, crash restart, orphan pruning) and session-timer-manager.ts (SessionTimerManager: stable timers, inactivity timeouts, fallback checker) |
| 2026-03-30 | corvid-agent | Context resets now save conversation summaries as memory observations (#1753) |
| 2026-04-09 | corvid-agent | Added OLLAMA_USE_CLAUDE_PROXY routing, relevant observations loaded on session resume (#1779), zero-turn circuit breaker (3 consecutive zero-turn completions blocks resume) |
| 2026-04-09 | corvid-agent | Added extracted sub-modules: provider-routing.ts, resume-prompt-builder.ts, event-handler.ts, session-exit-handler.ts (#1940) |
| 2026-04-14 | corvid-agent | Add 15 missing modules to files list, fix SessionTimerCallbacks/Config types, clarify resolveProviderRouting re-export (#2022) |
| 2026-04-16 | corvid-agent | Document McpServiceContainer methods/isAvailable, full McpServices/BuildContextOptions fields, startStartupTimeout/clearStartupTimeout, fix applyCostUpdate return type (boolean), fix sendMessage signature (ContentBlockParam[]), add flushActiveSessionSummaries, fix getStats to include startupTimeouts, inline EventHandlerDeps/ExitHandlerDeps fields, remove RoutingDecision duplicate, collapse exported-types table with Source column (#2022) |
| 2026-04-20 | corvid-agent | Add approval-flow.ts (approval request/response bridge) and persona-injector.ts (persona+skill injection facade); add session-lifecycle.ts to files list; document new exported functions |
| 2026-04-22 | corvid-agent | Add `isAlive()` to `SdkProcess` interface; sendMessage evicts zombie processes from Map; orphan pruner detects dead-in-Map processes via `isAlive()` (#2127) |
