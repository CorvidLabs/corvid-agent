---
module: process-spawner
version: 1
status: active
files:
  - server/process/process-spawner.ts
db_tables: []
depends_on:
  - specs/process/sdk-process.spec.md
  - specs/process/direct-process.spec.md
  - specs/process/process-manager.spec.md
---

# Process Spawner

## Purpose

Low-level process spawning extracted from `manager.ts`. Handles the mechanics of starting and registering SDK and direct-process sessions, including project directory resolution, MCP context assembly, session config resolution, and ephemeral directory lifecycle. The ProcessManager retains high-level orchestration ("when and why to start"); this module handles "how to start a process".

Uses a dependency-injection pattern (`ProcessSpawnerDeps`) so it can be tested and wired without circular imports back to the ProcessManager class.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `SessionMetaForSpawn` | Mutable session metadata tracked in-memory: startedAt, source, restartCount, lastKnownCostUsd, turnCount, lastActivityAt, contextSummary |
| `ProcessSpawnerDeps` | Dependency bag for all spawner functions: db, approvalManager, timerManager, process/meta/ephemeral maps, event callbacks, MCP context builder |
| `SpawnOptions` | Common options for start/resume calls: depth, schedulerMode, schedulerActionType, conversationOnly, toolAllowList, mcpToolAllowList |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `registerSpawnedProcess` | `(deps, session, sp)` | `void` | Final step after spawn: clears starting guard, registers process, inits metadata, writes PID/status to DB, starts timers, emits `session_started` |
| `spawnSdkProcess` | `(deps, session, project, agent, prompt, options?)` | `void` | Start an SDK (Claude Code) process: resolves session config, builds MCP context, delegates to `startSdkProcess`, registers on success |
| `spawnDirectProcess` | `(deps, session, project, agent, prompt, provider, options?)` | `void` | Start a direct (Ollama) process: resolves session config, builds MCP context, delegates to `startDirectProcess`, registers on success |
| `startWithResolvedDir` | `(deps, session, project, agent, prompt, provider?, options?)` | `Promise<void>` | Resolve project directory for non-persistent strategies, then dispatch to SDK or direct spawn |
| `resumeWithResolvedDir` | `(deps, session, project, agent, resumePrompt, provider?, userPrompt?)` | `Promise<void>` | Resume a session with directory resolution, save user prompt, delegate to `startWithResolvedDir` |
| `releaseEphemeralDir` | `(deps, sessionId)` | `void` | Cleanup helper: remove and destroy ephemeral dirs on session exit (idempotent) |
| `warmStartProcess` | `(deps, session, message)` | `Promise<boolean>` | Feed a new message into an existing waiting process via `sendMessage()`. Returns `true` on success, `false` if process dead or done — caller should fall back to cold start |
| `coldStartProcess` | `(deps, session, project, agent, prompt, provider?, options?)` | `Promise<void>` | Full cold-start spawn: directory resolution, context reconstruction, process creation. Equivalent to `startWithResolvedDir` |

## Warm-start vs Cold-start Spawn Paths

### Path Selection

ProcessManager chooses the spawn path based on current session state:

| Condition | Path |
|-----------|------|
| Session in `idle` state (no process) | Cold-start |
| Process crashed (`isAlive() === false`) | Cold-start |
| Idle timeout exceeded | Cold-start |
| Explicit reset requested | Cold-start |
| Session in `waiting` state, process alive | Warm-start |
| Session in `responding` state (queue slot available) | Warm-start (queued) |

### Warm-start Spawn Path

`warmStartProcess(deps, session, message)` handles turns 2+ without process restart:

1. **Verify process alive**: Call `isAlive()` on stored process handle
   - If `false` → return `false` (caller falls back to cold-start)

2. **Send via `sendMessage()`**
   - Call `process.sendMessage(message.content)`
   - Returns `false` if process is done/aborted — caller falls back to cold-start
   - Returns `true` on success; process resumes from waiting state

3. **Update session metadata**
   - Reset activity timestamp (`lastActivityAt = now`)
   - Increment turn counter
   - No PID update (same process)

4. **No directory resolution needed**: Process retains its working directory from cold start

**What is NOT done on warm-start:**
- No `spawnSdkProcess()` / `spawnDirectProcess()` call
- No MCP context rebuild
- No system prompt re-injection
- No `registerSpawnedProcess()` (process already registered)

### Cold-start Spawn Path

`coldStartProcess(deps, session, project, agent, prompt, provider?, options?)` is the full path:

1. **Resolve project directory** (via `startWithResolvedDir`)
   - Persistent strategy: reuse existing dir
   - Ephemeral strategy: create fresh dir (tracked in `ephemeralDirs` map)

2. **Build context**
   - Resolve session config (persona/skill prompts, tool permissions)
   - Build MCP context (unless `conversationOnly`)

3. **Spawn process** (SDK or direct based on `provider`)
   - Calls `spawnSdkProcess` or `spawnDirectProcess`

4. **Register process** (via `registerSpawnedProcess`)
   - Clears starting guard
   - Writes PID/status to DB
   - Starts timers (stable, timeout)
   - Emits `session_started`

### Spawn Error Handling

**Warm-start failure → automatic cold-start fallback:**

```
warmStartProcess() fails (returns false or throws)
  → log: "warm start failed, falling back to cold start"
  → call coldStartProcess() with same session and message
  → if cold start also fails → emit session_error, set status = error
```

**Failure modes and responses:**

| Failure | Warm-start Response | Cold-start Response |
|---------|--------------------|--------------------|
| Process not alive | Return `false` → caller cold-starts | Spawn error → emit session_error |
| `sendMessage` returns false | Return `false` → caller cold-starts | N/A |
| `sendMessage` throws | Catch, return `false` → caller cold-starts | N/A |
| Directory resolution fails | N/A (no dir needed) | Starting guard cleared, error emitted |
| Spawn throws | N/A | Status = error, session_error emitted |

**No retry on warm-start**: If `warmStartProcess` returns `false`, the caller immediately tries cold-start. No backoff between warm and cold — the fallback is instantaneous.

## Invariants

1. **Starting guard cleared on all paths**: `startingSession.delete(sessionId)` is called on both success (in `registerSpawnedProcess`) and failure (in error handlers and `startWithResolvedDir` dir-resolution failure)
2. **DB verification after register**: `registerSpawnedProcess` verifies the DB write landed by querying status/pid back, logging an error if it doesn't match (catches concurrent writes / WAL issues)
3. **MCP context skipped for no-tools sessions**: When `conversationOnly` is true or `toolAllowList` is empty, MCP servers are not created
4. **Spawn errors emit both `error` and `session_error`**: Failed spawns emit a generic `error` event and a structured `session_error` event with `severity: fatal, recoverable: false`
5. **Ephemeral dir tracked per session**: Ephemeral directories are stored in the `ephemeralDirs` map keyed by session ID and cleaned up via `releaseEphemeralDir`
6. **Provider routing**: Direct-mode providers use `spawnDirectProcess`; SDK-mode (or Ollama with proxy enabled) uses `spawnSdkProcess`
7. **Warm-start never calls `registerSpawnedProcess`**: Warm starts reuse the already-registered process. Calling register again would corrupt PID/timer state
8. **Cold-start fallback is unconditional**: Any `warmStartProcess` failure (return `false` or throw) triggers an immediate cold-start attempt. The caller must not silently drop the message

## Behavioral Examples

### Scenario: SDK session start with persona and MCP tools

- **Given** an agent with a persona and skill bundle assigned
- **When** `spawnSdkProcess` is called with default options
- **Then** session config is resolved (persona prompt + skill prompt + tool permissions), MCP context is built, `startSdkProcess` is called with the assembled config, and `registerSpawnedProcess` writes PID/status to DB and emits `session_started`

### Scenario: Direct process start for Ollama provider

- **Given** a provider with `executionMode: 'direct'` and `type: 'ollama'`
- **When** `startWithResolvedDir` is called and `OLLAMA_USE_CLAUDE_PROXY` is not `'true'`
- **Then** the call is routed to `spawnDirectProcess` (not `spawnSdkProcess`)

### Scenario: Conversation-only session skips MCP

- **Given** `conversationOnly: true` in spawn options
- **When** `spawnSdkProcess` is called
- **Then** no MCP servers are created and `conversationOnly` is passed through to `startSdkProcess`

### Scenario: Warm start succeeds (turn 2+)

- **Given** a session in `waiting` state with a live process
- **When** `warmStartProcess(deps, session, message)` is called
- **Then** `isAlive()` returns `true`
- **And** `sendMessage(message.content)` is called and returns `true`
- **And** the function returns `true`
- **And** no `registerSpawnedProcess()` or `spawnSdkProcess()` is called

### Scenario: Warm start falls back to cold start on dead process

- **Given** a session whose process crashed silently (orphan)
- **When** `warmStartProcess(deps, session, message)` is called
- **Then** `isAlive()` returns `false`, function returns `false`
- **And** the caller invokes `coldStartProcess()` with the same message
- **And** session is cold-started with full context reconstruction

## Error Cases

| Condition | Behavior |
|-----------|----------|
| SDK process spawn throws | Session status set to `error`, `error` + `session_error` events emitted, function returns without registering |
| Direct process spawn throws | Same as SDK spawn failure |
| Directory resolution fails | Starting guard cleared, `error` event emitted with `dir_resolution_error` type |
| `warmStartProcess`: process not alive | Returns `false`; caller falls back to cold-start |
| `warmStartProcess`: `sendMessage` returns `false` | Returns `false`; caller falls back to cold-start |
| `warmStartProcess`: `sendMessage` throws | Caught internally, returns `false`; caller falls back to cold-start |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `sdk-process` | `startSdkProcess`, `SdkProcess` type |
| `direct-process` | `startDirectProcess` |
| `session-config-resolver` | `resolveSessionConfig` — persona/skill prompt + tool permissions |
| `provider-routing` | `resolveDirectToolAllowList` |
| `session-timer-manager` | Timer lifecycle (stable, timeout, startup) |
| `approval-manager` | Passed through to SDK/direct process |
| `lib/project-dir` | `resolveProjectDir`, `cleanupEphemeralDir` |
| `mcp/sdk-tools` | `createCorvidMcpServer` |
| `db/sessions` | `addSessionMessage`, `updateSessionPid`, `updateSessionStatus` |
| `db/mcp-servers` | `getActiveServersForAgent` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `process-manager` | All exported functions (pending wiring) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-16 | Jackdaw | Initial extraction from manager.ts |
| 2026-05-02 | Jackdaw | Session keep-alive: add warmStartProcess/coldStartProcess stubs, warm vs cold path sections, fallback invariants (#2232) |
