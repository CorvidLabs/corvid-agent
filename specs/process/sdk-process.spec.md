---
module: sdk-process
version: 1
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

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `SdkProcessOptions` | Full configuration for starting an SDK process: session, project, agent, prompt, callbacks, MCP servers, persona/skill prompts |
| `SdkProcess` | Running process handle: `{ pid, sendMessage, kill, isAlive }` |

### Exported Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `ENV_ALLOWLIST` | `Set<string>` (24 entries) | Allowlisted environment variable names safe to pass to subprocesses |
| `API_FAILURE_THRESHOLD` | `3` | Consecutive API errors before triggering outage handler |
| `API_ERROR_PATTERNS` | `string[]` | Regex/string patterns that identify API-level errors vs application errors |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `startSdkProcess` | `(options: SdkProcessOptions)` | `SdkProcess` | Start a Claude Agent SDK query with full configuration, returns process handle |
| `buildSafeEnv` | `(projectEnvVars?: Record<string, string>)` | `Record<string, string>` | Build sandboxed environment from allowlist + project env vars |
| `isApiError` | `(error: string)` | `boolean` | Check if an error string matches known API error patterns |
| `mapSdkMessageToEvent` | `(message: SDKMessage, sessionId: string)` | `ClaudeStreamEvent \| null` | Convert an SDK message to a stream event for the event bus |

### SdkProcess Handle Fields

| Field | Type | Description |
|-------|------|-------------|
| `pid` | `number` | Monotonically increasing pseudo-PID (starts at 900,000) |
| `sendMessage` | `(content: string \| ContentBlockParam[]) => boolean` | Feed a message to the process — works for both cold-start initial prompt and warm-start subsequent turns. Returns `false` if the process is done or aborted |
| `kill` | `() => void` | Abort the running query via AbortController |
| `isAlive` | `() => boolean` | Returns `true` if the query generator has not completed or errored |

## Process Lifecycle (Keep-Alive)

### Current Model: Process-Per-Session

With the session keep-alive architecture, SDK processes outlive a single turn. After the `query()` generator completes a response, the process remains alive in the `waiting` state — ready to accept the next input via `streamInput()`.

```
[Cold Start]                    [Warm Start (2nd+ turn)]
     ↓                                   ↓
startSdkProcess()              streamInput(nextMessage)
     ↓                                   ↓
query() generator starts        query() generator resumes
     ↓                                   ↓
model responds (tokens stream)  model responds (tokens stream)
     ↓                                   ↓
generator calls streamInput()   generator calls streamInput()
     ↓                                   ↓
process enters waiting state    process enters waiting state
```

**Key shift from turn-per-process:** Generator completion does NOT kill the process. `startSdkProcess()` is only called once per session (cold start). `streamInput()` handles all subsequent turns.

### Input Streaming

`sendMessage(content)` is the unified API for feeding new messages into a process — used for both the initial cold-start prompt and all subsequent warm-start turns. Internally it calls the SDK's `q.streamInput()` to deliver the message to the generator.

- **Non-blocking**: returns after enqueueing; the process handles it asynchronously
- **Returns `false`** when the process is done or aborted (inputDone flag is set internally)
- **One message at a time**: calling `sendMessage()` while model is already generating queues the message (handled by ProcessManager's input queue — sdk-process itself does not queue)
- **No system prompt re-injection**: the process retains its full in-memory context from previous turns

### Waiting State Handling

When the `query()` generator yields (model finishes a response), the SDK awaits the next `streamInput()` call before resuming. During this window:

- Process is alive (`isAlive() === true`)
- `inputDone` is `false`
- No cleanup occurs (no GC, no context reset)
- Prompt cache remains hot in model's in-memory state
- Activity timeout is ticking (2h default)

The process remains in-memory with its full conversation context intact. The ProcessManager tracks this as `waiting` state. When the timeout fires, ProcessManager kills the process and transitions the session to `idle`.

### State Transitions (SDK Layer)

| From | To | Trigger |
|------|----|---------|
| — | responding | `startSdkProcess()` called (cold start) |
| responding | waiting | `query()` generator awaits `streamInput()` |
| waiting | responding | `streamInput(content)` called |
| any | done | `kill()` called or unrecoverable error |

These map to process-manager states: `running/responding` → `responding`, waiting = `waiting`, done = `idle/error`.

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
12. **Process lifetime equals session lifetime**: The SDK process is not killed when the `query()` generator yields between turns. It remains alive until timeout, explicit `kill()`, or unrecoverable error. Generator completion ≠ process death
13. **`sendMessage` is the unified input API**: Both cold-start initial prompts and warm-start subsequent turns use `sendMessage()`. The same method feeds the SDK's internal input channel regardless of turn number. Returns `false` when the process is done (inputDone flag is set)
14. **`sendMessage` is safe to call after exit**: When `inputDone=true` or the AbortController is aborted, `sendMessage()` returns `false` without throwing, allowing the caller to handle gracefully
15. **Context persists across warm turns**: No system prompt re-injection occurs on warm starts. The process's in-memory conversation state accumulates naturally across turns, keeping prompt cache hot

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

### Scenario: Warm start — process survives between turns

- **Given** a process that has just completed its first response (generator yielded)
- **When** the ProcessManager calls `isAlive()`
- **Then** returns `true` (process is in waiting state)
- **And** calling `sendMessage(nextMessage)` delivers the next turn and returns `true`

### Scenario: `sendMessage` rejected after process exits

- **Given** a process where `kill()` was called
- **When** `sendMessage(content)` is called
- **Then** returns `false` (inputDone is set)
- **And** no error is thrown

## Error Cases

| Condition | Behavior |
|-----------|----------|
| SDK query throws non-abort error | Error event emitted, `onExit(1)` called |
| SDK query throws AbortError (from kill) | `onExit(0)` called, no error event |
| API outage (3+ consecutive API errors) | `onApiOutage()` called, no `onExit` |
| `sendMessage` after process done | Returns `false` |
| `sendMessage` after abort | Returns `false` |
| `sendMessage` when process is done/aborted | Returns `false` immediately, no throw |
| `sendMessage` during active response | Message is accepted and queued by the SDK's internal queue; ProcessManager should prefer its own input queue to avoid races |

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
| 2026-05-02 | Jackdaw | Session keep-alive: document process-per-session model, streamInput mechanics, waiting state handling, new invariants 12-15, updated SdkProcess handle fields (#2231) |
