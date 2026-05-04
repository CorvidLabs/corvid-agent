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

## Invariants

1. **Starting guard cleared on all paths**: `startingSession.delete(sessionId)` is called on both success (in `registerSpawnedProcess`) and failure (in error handlers and `startWithResolvedDir` dir-resolution failure)
2. **DB verification after register**: `registerSpawnedProcess` verifies the DB write landed by querying status/pid back, logging an error if it doesn't match (catches concurrent writes / WAL issues)
3. **MCP context skipped for no-tools sessions**: When `conversationOnly` is true or `toolAllowList` is empty, MCP servers are not created
4. **Spawn errors emit both `error` and `session_error`**: Failed spawns emit a generic `error` event and a structured `session_error` event with `severity: fatal, recoverable: false`
5. **Ephemeral dir tracked per session**: Ephemeral directories are stored in the `ephemeralDirs` map keyed by session ID and cleaned up via `releaseEphemeralDir`
6. **Provider routing**: Direct-mode providers use `spawnDirectProcess`; SDK-mode (or Ollama with proxy enabled) uses `spawnSdkProcess`

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

## Error Cases

| Condition | Behavior |
|-----------|----------|
| SDK process spawn throws | Session status set to `error`, `error` + `session_error` events emitted, function returns without registering |
| Direct process spawn throws | Same as SDK spawn failure |
| Directory resolution fails | Starting guard cleared, `error` event emitted with `dir_resolution_error` type |

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
