---
module: sdk-process
version: 2
status: active
files:
  - server/process/sdk-process.ts
db_tables: []
depends_on:
  - specs/process/process-manager.spec.md
  - specs/process/direct-process.spec.md
  - specs/providers/tool-prompt-templates.spec.md
  - specs/mcp/sdk-tools.spec.md
---

# SDK Process

## Purpose

Wraps the `@anthropic-ai/claude-agent-sdk` `query()` function into a controllable process with pid, sendMessage, and kill capabilities. Handles protected file enforcement, permission mode mapping, system prompt composition (agent config + persona + skills), environment sandboxing, API outage detection, and SDK message-to-event mapping.

This is the execution boundary between the corvid-agent system and the Claude Agent SDK.

## Keep-Alive Lifecycle

In keep-alive mode, the SDK process survives between model turns. Instead of exiting after one model turn and requiring a cold restart with full context reconstruction, the process enters a **warm** state — alive, idle, and ready to accept the next message via `streamInput()`.

### Process States

| State | `isAlive()` | `isWarm()` | Description |
|-------|-------------|------------|-------------|
| **processing** | `true` | `false` | Model is actively generating a response |
| **warm** | `true` | `true` | Turn complete, process idle, waiting for next `streamInput()` call |
| **dead** | `false` | `false` | Process exited (explicit kill, TTL expiry, error, or abort) |

### Warm Path vs Cold Path

- **Warm path**: Process is alive (`isAlive() === true`). New user messages are fed via `sendMessage()` → `streamInput()`. No context reconstruction needed — the model already has full conversation history in its context window. This is ~10x cheaper in tokens than a cold start.
- **Cold path (fallback)**: Process is dead. A new `query()` call is made with a resume prompt containing reconstructed context (conversation history, observations, summaries). This is the current behavior and remains the fallback for all cases where the warm path is unavailable.

### State Transitions

```
start() ──→ [processing] ──→ model turn complete ──→ [warm]
                                                        │
                                                        ├──→ streamInput() ──→ [processing]
                                                        ├──→ TTL expires ──→ [dead]
                                                        └──→ kill() ──→ [dead]

[processing] ──→ error/abort ──→ [dead]
[dead] ──→ (requires new startSdkProcess call = cold start)
```

### Key Constraints

1. A warm process holds its full context window in memory (model-side). This is the source of token savings but also means each warm process consumes model context capacity.
2. Warm processes must be killed after a configurable inactivity TTL (`KEEP_ALIVE_TTL_MS`) to avoid unbounded resource consumption. The TTL resets on each successful `sendMessage()`.
3. If `streamInput()` fails on a warm process (e.g., the query silently closed), the process transitions to dead and the caller must fall back to a cold start.
4. The `onTurnComplete` callback (new) fires when the model finishes a turn but the process stays alive, distinct from `onExit` which fires when the process truly dies.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `SdkProcessOptions` | Full configuration for starting an SDK process: session, project, agent, prompt, callbacks, MCP servers, persona/skill prompts. Includes `keepAlive?: boolean` to enable warm process mode |
| `SdkProcess` | Running process handle: `{ pid, sendMessage, kill, isAlive, isWarm }` |

### Exported Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `ENV_ALLOWLIST` | `Set<string>` (24 entries) | Allowlisted environment variable names safe to pass to subprocesses |
| `API_FAILURE_THRESHOLD` | `3` | Consecutive API errors before triggering outage handler |
| `API_ERROR_PATTERNS` | `string[]` | Regex/string patterns that identify API-level errors vs application errors |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `startSdkProcess` | `(options: SdkProcessOptions)` | `SdkProcess` | Start a Claude Agent SDK query with full configuration, returns process handle. When `options.keepAlive` is true, the process enters warm state after each model turn instead of exiting |
| `buildSafeEnv` | `(projectEnvVars?: Record<string, string>)` | `Record<string, string>` | Build sandboxed environment from allowlist + project env vars |
| `isApiError` | `(error: string)` | `boolean` | Check if an error string matches known API error patterns |
| `mapSdkMessageToEvent` | `(message: SDKMessage, sessionId: string)` | `ClaudeStreamEvent \| null` | Convert an SDK message to a stream event for the event bus |

## Invariants

1. **Protected file enforcement**: `canUseTool` blocks `Write`, `Edit`, `MultiEdit` on protected paths and `Bash` commands with write operators targeting protected paths. This runs BEFORE bypass mode checks — even `full-auto` agents cannot modify protected files
2. **Environment sandboxing**: Only allowlisted environment variables (`ENV_ALLOWLIST`: 24 safe vars like PATH, HOME, GIT_*, GITHUB_TOKEN) are passed to the subprocess. Secrets like `ALGOCHAT_MNEMONIC`, `WALLET_ENCRYPTION_KEY` are excluded. Project-specific env vars from `project.envVars` are always included
3. **Permission mode mapping**: `full-auto` maps to SDK's `bypassPermissions`; `auto-edit` maps to `acceptEdits`. Other modes pass through as-is
4. **Plan mode disabling**: In bypass permission modes, `EnterPlanMode` and `ExitPlanMode` are added to `disallowedTools` to prevent SDK-level errors (plan mode requires interactive approval)
5. **System prompt composition**: Parts are appended in order: `agent.systemPrompt`, `agent.appendPrompt`, `personaPrompt`, `skillPrompt` (prefixed with `## Skill Instructions`), `getMessagingSafetyPrompt()`, `getResponseRoutingPrompt()` (channel affinity), `getWorktreeIsolationPrompt()` (if worktree), `getProjectContextPrompt(project)` (always). All combined with `\n\n` and set as `claude_code` preset append. The project context pin survives context compression by anchoring the active project name, workingDir, gitUrl, and GitHub slug in the re-injected system prompt (issue #1628)
5b. **Channel affinity routing**: For AlgoChat, agent, and Discord-sourced sessions, `prependRoutingContext()` adds a routing hint to the user prompt instructing the model to reply directly instead of using corvid_send_message
6. **API outage detection**: After `API_FAILURE_THRESHOLD` (3) consecutive API errors (network failures, 5xx, 429, overloaded), `onApiOutage` is called. Non-API errors reset the counter
7. **Pseudo-PID assignment**: Each process gets a monotonically increasing pseudo-PID starting at 900,000 (not a real OS PID since SDK runs in-process)
8. **Abort-safe exit**: AbortError (from `kill()`) results in `onExit(0)`, not an error event
9. **MCP stream timeout**: `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT` is hardcoded to 7,200,000ms (2 hours) to prevent tools from dying during long autonomous sessions
10. **Tool permissions vs allowed tools**: `sdkOptions.tools` defines which tools are available. `allowedTools` (auto-approve) is NOT set — all tools go through `canUseTool` for approval
11. **Symlink resolution for protected paths**: `isProtectedPath()` resolves symlinks via `realpathSync()` before matching, preventing bypass via symlink creation targeting protected files
12. **Keep-alive turn boundary**: When `keepAlive` is enabled, the async output consumer detects model turn completion (via SDK `result` message type) and transitions to warm state instead of calling `onExit`. The `onTurnComplete` callback fires with turn metrics (cost, tokens, duration). The process remains alive for subsequent `streamInput()` calls
13. **Warm process input guard**: `sendMessage()` on a warm process resets the keep-alive TTL timer (managed externally by `SessionTimerManager`). If `streamInput()` throws or the query has silently closed, `sendMessage()` returns `false`, sets `inputDone = true`, and the caller must initiate a cold start
14. **Keep-alive opt-in**: `keepAlive` defaults to `false` for backward compatibility. Only sessions explicitly started with `keepAlive: true` enter the warm state. All existing behavior (single-turn, exit on completion) is preserved when `keepAlive` is `false`

## Behavioral Examples

### Scenario: Protected file blocked even in full-auto mode

- **Given** an agent with `permissionMode = 'full-auto'`
- **When** the agent tries to `Write` to `CLAUDE.md`
- **Then** `canUseTool` returns `{ behavior: 'deny', message: 'Cannot modify protected file: CLAUDE.md' }`
- **And** the bypass mode check never runs (protected path check is first)

### Scenario: Bash write to protected file blocked

- **Given** a running session
- **When** the agent runs a Bash command like `echo "..." > schema.ts`
- **Then** `canUseTool` detects the write operator and protected path token, returns deny

### Scenario: API outage detected after 3 failures

- **Given** a running SDK query
- **When** 3 consecutive errors matching API error patterns occur (e.g. ECONNREFUSED)
- **Then** `onApiOutage()` is called and the process does NOT call `onExit`

### Scenario: Normal approval flow

- **Given** an agent with `permissionMode = 'default'`
- **When** the agent uses any tool
- **Then** `canUseTool` creates an `ApprovalRequest`, sends it via `onApprovalRequest`, and waits for user resolution

### Scenario: Keep-alive process stays warm after model turn

- **Given** a running SDK process with `keepAlive = true`
- **When** the model finishes generating its response (SDK yields `result` message)
- **Then** `onTurnComplete` fires with turn metrics, the process enters warm state (`isWarm() = true`, `isAlive() = true`), and the async consumer continues waiting for more SDK messages

### Scenario: Warm process receives follow-up message

- **Given** a warm SDK process (`isWarm() = true`)
- **When** `sendMessage("follow-up question")` is called
- **Then** `streamInput()` feeds the message, the process transitions from warm to processing (`isWarm() = false`), and the model begins generating a new response

### Scenario: Warm process streamInput failure triggers cold-start fallback

- **Given** a warm SDK process
- **When** `sendMessage()` is called but `streamInput()` throws (query silently closed)
- **Then** `sendMessage()` returns `false`, `inputDone` is set to `true`, `isAlive()` returns `false`, and the caller must initiate a cold start

## Error Cases

| Condition | Behavior |
|-----------|----------|
| SDK query throws non-abort error | Error event emitted, `onExit(1)` called |
| SDK query throws AbortError (from kill) | `onExit(0)` called, no error event |
| API outage (3+ consecutive API errors) | `onApiOutage()` called, no `onExit` |
| `sendMessage` after process done | Returns `false` |
| `sendMessage` after abort | Returns `false` |
| `streamInput` throws on warm process | `inputDone = true`, returns `false`, caller falls back to cold start |
| Keep-alive process receives context overflow | `onTurnComplete` fires with overflow flag, process killed, next message triggers cold start with compressed context |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@anthropic-ai/claude-agent-sdk` | `query`, `Query`, `SDKMessage`, `PermissionResult`, `CanUseTool`, `McpSdkServerConfigWithInstance`, `McpServerConfig` |
| `server/providers/ollama/tool-prompt-templates.ts` | `getResponseRoutingPrompt`, `getMessagingSafetyPrompt`, `getWorktreeIsolationPrompt`, `getProjectContextPrompt` — system prompt guidance |
| `server/process/direct-process.ts` | `prependRoutingContext` — channel affinity per-message routing hints |
| `server/process/protected-paths.ts` | `isProtectedPath`, `extractFilePathsFromInput`, `BASH_WRITE_OPERATORS` |
| `server/process/approval-manager.ts` | `ApprovalManager` for tool approval workflow |
| `server/process/approval-types.ts` | `ApprovalRequest`, `ApprovalRequestWire`, `formatToolDescription` |
| `server/process/types.ts` | `ClaudeStreamEvent` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `startSdkProcess`, `SdkProcess` — called for all Claude-provider sessions |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| (all ENV_ALLOWLIST vars) | (system) | 24 environment variables safe to pass to agent subprocesses |

Internal constants (not env-configurable):

| Constant | Value | Description |
|----------|-------|-------------|
| `API_FAILURE_THRESHOLD` | `3` | Consecutive API errors before triggering outage |
| `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT` | `7200000` | 2-hour MCP stream timeout (hardcoded in env) |
| `nextPseudoPid` | `900000` | Starting pseudo-PID counter |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
| 2026-03-06 | corvid-agent | Added realpathSync() symlink resolution to prevent protected-path bypass attacks. |
| 2026-03-14 | corvid-agent | Added channel affinity routing: prependRoutingContext + getResponseRoutingPrompt for Claude/SDK path |
| 2026-03-28 | corvid-agent | Added getProjectContextPrompt to system prompt append — pins active project to survive context compression (#1628) |
| 2026-05-04 | corvid-agent | v2: Keep-alive lifecycle — warm process state, `isWarm()` method, `onTurnComplete` callback, `keepAlive` option, streamInput failure fallback (#2222, #2223) |
