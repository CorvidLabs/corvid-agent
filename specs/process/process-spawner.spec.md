---
module: process-spawner
version: 2
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

## Keep-Alive Integration

The process spawner is the **cold path only**. It is never called when the warm path succeeds — warm path delivery happens entirely within `ProcessManager.resumeProcess()` via `sendMessage()`.

### Spawn Path Decision Tree

When resuming a session with a user message:

```
Session resume requested
  ↓
  Is process alive? (isAlive() → true)
    ├─ YES → WARM PATH: Verify process health, inject message via streamInput
    │           Returns: boolean (success → skip spawn, failure → fallback to cold path)
    │           Mechanism: No reconstruction, reuse existing session state
    │
    └─ NO → COLD PATH: Trigger full process reconstruction
              Mechanism: Resolve config, build MCP context, spawn new process instance
```

### Warm-Start Path

**Warm-start** resumes an existing, live SDK process with a new message (user prompt). Prerequisites:
- Process must exist in the `processes` map
- `isAlive()` must return `true` (process not crashed or terminated)
- Do NOT reconstruct the process or session config

**Mechanism**:
1. Verify process is still alive (check process handle, no IO errors)
2. Call `sendMessage(sessionId, userPrompt)` to inject the next message via the process's input stream
3. Return `true` on success; on failure, return `false` to trigger cold-path fallback

**Benefits**:
- Reuses model context and session state
- Keeps warm processes alive across multiple turns
- No session reconstruction overhead

### Cold-Start Path

**Cold-start** fully reconstructs a session and process from scratch. Used when:
- No process exists in the `processes` map
- Process exists but `isAlive()` returns `false` (crashed or terminated)
- Warm-start `sendMessage()` returned `false` (delivery failed)

**Mechanism**:
1. Resolve session config (persona, skills, tools)
2. Build MCP context
3. Assemble full process spawn parameters
4. Call `startSdkProcess()` or `startDirectProcess()` for fresh process creation
5. Register the new process and write session PID/status to DB

**Key difference from warm-start**: Full reconstruction means new session config, new MCP context, new process instance — no state reuse.

### Warm Path Guard

Before calling any spawner function, the `ProcessManager` checks whether a live warm process already exists for the session. The spawner functions are only reached when:
1. No process exists in the `processes` map
2. The process exists but `isAlive()` returns `false`
3. Warm path `sendMessage()` was attempted but returned `false`

This means `spawnSdkProcess`, `spawnDirectProcess`, `startWithResolvedDir`, and `resumeWithResolvedDir` are all cold-path-only and will never race with a warm process.

### keepAlive Pass-Through

`SpawnOptions` includes a new `keepAlive?: boolean` field. When set, it is passed through to `startSdkProcess()` so the SDK process enters warm state after each model turn. The spawner itself does not manage the keep-alive lifecycle — that responsibility belongs to `ProcessManager` and `SessionTimerManager`.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `SessionMetaForSpawn` | Mutable session metadata tracked in-memory: startedAt, source, restartCount, lastKnownCostUsd, turnCount, lastActivityAt, contextSummary |
| `ProcessSpawnerDeps` | Dependency bag for all spawner functions: db, approvalManager, timerManager, process/meta/ephemeral maps, event callbacks, MCP context builder |
| `SpawnOptions` | Common options for start/resume calls: depth, schedulerMode, schedulerActionType, conversationOnly, toolAllowList, mcpToolAllowList, keepAlive |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `registerSpawnedProcess` | `(deps, session, sp)` | `void` | Final step after spawn: clears starting guard, registers process, inits metadata, writes PID/status to DB, starts timers, emits `session_started` |
| `spawnSdkProcess` | `(deps, session, project, agent, prompt, options?)` | `void` | Start an SDK (Claude Code) process: resolves session config, builds MCP context, delegates to `startSdkProcess`, registers on success |
| `spawnDirectProcess` | `(deps, session, project, agent, prompt, provider, options?)` | `void` | Start a direct (Ollama) process: resolves session config, builds MCP context, delegates to `startDirectProcess`, registers on success |
| `startWithResolvedDir` | `(deps, session, project, agent, prompt, provider?, options?)` | `Promise<void>` | Resolve project directory for non-persistent strategies, then dispatch to SDK or direct spawn |
| `resumeWithResolvedDir` | `(deps, session, project, agent, resumePrompt, provider?, userPrompt?)` | `Promise<void>` | Resume a session with directory resolution, save user prompt, delegate to `startWithResolvedDir` |
| `releaseEphemeralDir` | `(deps, sessionId)` | `void` | Cleanup helper: remove and destroy ephemeral dirs on session exit (idempotent) |

## Invariants

1. **Starting guard cleared on all paths**: `startingSession.delete(sessionId)` is called on both success (in `registerSpawnedProcess`) and failure (in error handlers and `startWithResolvedDir` dir-resolution failure)
2. **DB verification after register**: `registerSpawnedProcess` verifies the DB write landed by querying status/pid back, logging an error if it doesn't match (catches concurrent writes / WAL issues)
3. **MCP context skipped for no-tools sessions**: When `conversationOnly` is true or `toolAllowList` is empty, MCP servers are not created
4. **Spawn errors emit both `error` and `session_error`**: Failed spawns emit a generic `error` event and a structured `session_error` event with `severity: fatal, recoverable: false`
5. **Ephemeral dir tracked per session**: Ephemeral directories are stored in the `ephemeralDirs` map keyed by session ID and cleaned up via `releaseEphemeralDir`
6. **Provider routing**: Direct-mode providers use `spawnDirectProcess`; SDK-mode (or Ollama with proxy enabled) uses `spawnSdkProcess`
7. **Cold-path-only execution**: All spawner functions assume no warm process exists for the target session. The warm path guard in `ProcessManager.resumeProcess()` ensures spawner functions are only called when the warm path is unavailable or has failed. All spawner functions assume the process is dead or nonexistent and perform full reconstruction.
8. **No warm-path retry**: If warm-path verification fails (process is dead or unreachable), the decision is final — immediately fallback to cold-start. Do NOT retry warm-start or attempt alternative warm paths. Failure to verify a live process commits to full reconstruction.
9. **keepAlive pass-through**: When `SpawnOptions.keepAlive` is `true`, it is forwarded to `startSdkProcess()` via `SdkProcessOptions.keepAlive`. The spawner does not interpret or manage this flag — it merely passes it through

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

### Scenario: Cold start with keepAlive enabled

- **Given** a session with no live process and `keepAlive = true` in spawn options
- **When** `spawnSdkProcess` is called (after warm path guard confirmed no warm process)
- **Then** `startSdkProcess` is called with `keepAlive: true` in its options, and the resulting process will enter warm state after its first model turn instead of exiting

### Scenario: Warm-start resumes live process

- **Given** a session with a live warm SDK process (`isAlive() = true`)
- **When** the warm-start path verifies the process is alive and injects a new user message
- **Then** the process health is verified, `sendMessage()` injects the new message, and resumption succeeds; no process reconstruction occurs
- **And** the spawner functions in this module are NOT invoked

### Scenario: Warm-start failure falls back to cold-start

- **Given** a session with a live warm process, but the process handle is stale
- **When** the warm-start path attempts to verify process health
- **Then** `isAlive()` returns `false`, warm resumption fails
- **And** the cold-start path is triggered to fully reconstruct the process via `spawnSdkProcess` or `spawnDirectProcess`
- **And** no retry of warm-start is attempted

### Scenario: Spawner not called when warm process succeeds

- **Given** a session with a live warm SDK process (`isAlive() = true`)
- **When** `resumeProcess` is called on the `ProcessManager`
- **Then** the warm-start path verifies the process is alive and returns success, and no spawner function in this module is invoked

## Error Cases

### Warm-Start Failure Behavior

| Condition | Behavior |
|-----------|----------|
| Warm-path fails (process unreachable) | Immediately triggers cold-start fallback. Do NOT retry warm path — first failure commits to cold path. |
| Process handle is stale (isAlive checks fail) | Warm-path returns failure; spawner functions invoked to reconstruct via cold path. |

### Spawn Error Handling

| Condition | Behavior |
|-----------|----------|
| SDK process spawn throws | Session status set to `error`, `error` + `session_error` events emitted, function returns without registering. Starting guard cleared. |
| Direct process spawn throws | Same as SDK spawn failure |
| Directory resolution fails | Starting guard cleared, `error` event emitted with `dir_resolution_error` type |
| Cold-start path throws | Fatal error; starting guard cleared, `error` + `session_error` events emitted with `severity: fatal, recoverable: false` |

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
| 2026-05-04 | corvid-agent | v2: Keep-alive integration — warm-start path (streamInput delivery), cold-start path (full reconstruction), spawn error handling, no-retry fallback rule, decision tree, warm/cold path documentation (#2222, #2232) |
