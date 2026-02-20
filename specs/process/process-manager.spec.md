---
module: process-manager
version: 1
status: active
files:
  - server/process/manager.ts
db_tables:
  - sessions
  - session_messages
depends_on:
  - specs/db/sessions.spec.md
  - specs/db/credits.spec.md
---

# Process Manager

## Purpose

Central orchestration hub for agent session lifecycles. Manages starting, stopping, resuming, and monitoring Claude agent processes. Integrates every subsystem: persona/skill prompt injection, MCP tool resolution, credit deduction, provider routing (SDK vs direct, Claude vs Ollama), approval workflows, timeout management, auto-restart for AlgoChat sessions, and API outage recovery.

This is the most complex module in the system (1253 lines). It is the single point through which all agent sessions are created and managed.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `EventCallback` | `(sessionId: string, event: ClaudeStreamEvent) => void` — re-exported from `./interfaces` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ProcessManager` | Session lifecycle orchestrator |

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
| `setMcpServices` | `(messenger, directory, walletService, ...)` | `void` | Register all MCP-related services for corvid_* tools |
| `startProcess` | `(session: Session, prompt?: string, options?: { depth?, schedulerMode? })` | `void` | Start a new agent process. Routes to SDK or direct based on provider |
| `resumeProcess` | `(session: Session, prompt?: string)` | `void` | Resume an existing session. Builds history-aware prompt, handles context reset |
| `stopProcess` | `(sessionId: string)` | `void` | Kill process, set status to stopped, emit session_stopped, clean up state |
| `cleanupSessionState` | `(sessionId: string)` | `void` | Remove all in-memory state for a session (idempotent) |
| `getMemoryStats` | `()` | `{ processes, subscribers, sessionMeta, pausedSessions, sessionTimeouts, stableTimers, globalSubscribers }` | Snapshot of in-memory map sizes |
| `sendMessage` | `(sessionId: string, content: string)` | `boolean` | Send a message to a running process. Persists to DB, tracks turns |
| `isRunning` | `(sessionId: string)` | `boolean` | Check if a process is active |
| `subscribe` | `(sessionId: string, callback: EventCallback)` | `void` | Subscribe to session events (replays thinking state for late subscribers) |
| `unsubscribe` | `(sessionId: string, callback: EventCallback)` | `void` | Unsubscribe from session events |
| `subscribeAll` | `(callback: EventCallback)` | `void` | Subscribe to events from all sessions |
| `unsubscribeAll` | `(callback: EventCallback)` | `void` | Unsubscribe from global events |
| `getActiveSessionIds` | `()` | `string[]` | List all sessions with running processes |
| `shutdown` | `()` | `void` | Stop all processes, clear all timers and state |
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
5. **Provider routing**: If agent has an explicit provider, use it. If no provider and no Claude access, auto-fallback to Ollama. SDK process for Claude; direct process for Ollama/other providers
6. **Context reset**: After `MAX_TURNS_BEFORE_CONTEXT_RESET` (8) user messages, the process is killed and restarted through the resume path with capped message history (last 20 messages)
7. **Resume prompt construction**: Builds a `<conversation_history>` block from the last 20 messages (each truncated to 2000 chars), then appends the new prompt
8. **Auto-restart for AlgoChat**: Non-zero exits from AlgoChat sessions trigger auto-restart with exponential backoff (5s * 3^n, max 3 restarts). Restart counter resets after 10 minutes of stability
9. **API outage handling**: Detected outages pause the session (not counted as restart). Auto-resume with exponential backoff (5min * 3^n, cap 60min, max 10 attempts) after API health check
10. **Timeout enforcement**: Per-session timeout (`AGENT_TIMEOUT_MS`, default 30min) with a 60s polling fallback. Timeout can be extended up to 4x via `extendTimeout`
11. **Credit deduction for AlgoChat**: On each cost event for `algochat`-source sessions, credits are deducted from the participant wallet. Owner wallets are exempt. Session is stopped if credits exhausted
12. **Event emission before cleanup**: All exit/stop paths emit events BEFORE removing subscribers, so listeners receive the final event
13. **Orphan pruning**: Every 5 minutes, removes subscriber/meta entries for sessions with no active process and not paused
14. **Memory cleanup single source**: `cleanupSessionState` is the single entry point for all cleanup (process, meta, subscribers, paused state, timers, approval/question managers)

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
- **Then** the existing process is killed, and a new process starts with the resume prompt

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
| `server/process/types.ts` | `ClaudeStreamEvent`, `extractContentText` |
| `server/db/sessions.ts` | Session CRUD, message operations |
| `server/db/projects.ts` | `getProject` |
| `server/db/agents.ts` | `getAgent`, `getAlgochatEnabledAgents` |
| `server/db/personas.ts` | `getPersona`, `composePersonaPrompt` |
| `server/db/skill-bundles.ts` | `resolveAgentPromptAdditions`, `resolveProjectPromptAdditions`, `resolveAgentTools`, `resolveProjectTools` |
| `server/db/mcp-servers.ts` | `getActiveServersForAgent` |
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

Uses `sessions` and `session_messages` tables (see `specs/db/sessions.spec.md`).

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
| `MAX_TURNS_BEFORE_CONTEXT_RESET` | `8` | Turns before killing for context reset |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
