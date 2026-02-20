---
module: sdk-process
version: 1
status: active
files:
  - server/process/sdk-process.ts
db_tables: []
depends_on:
  - specs/process/process-manager.spec.md
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
| `SdkProcess` | Running process handle: `{ pid, sendMessage, kill }` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `startSdkProcess` | `(options: SdkProcessOptions)` | `SdkProcess` | Start a Claude Agent SDK query with full configuration, returns process handle |

## Invariants

1. **Protected file enforcement**: `canUseTool` blocks `Write`, `Edit`, `MultiEdit` on protected paths and `Bash` commands with write operators targeting protected paths. This runs BEFORE bypass mode checks — even `full-auto` agents cannot modify protected files
2. **Environment sandboxing**: Only allowlisted environment variables (`ENV_ALLOWLIST`: 24 safe vars like PATH, HOME, GIT_*, GITHUB_TOKEN) are passed to the subprocess. Secrets like `ALGOCHAT_MNEMONIC`, `WALLET_ENCRYPTION_KEY` are excluded. Project-specific env vars from `project.envVars` are always included
3. **Permission mode mapping**: `full-auto` maps to SDK's `bypassPermissions`; `auto-edit` maps to `acceptEdits`. Other modes pass through as-is
4. **Plan mode disabling**: In bypass permission modes, `EnterPlanMode` and `ExitPlanMode` are added to `disallowedTools` to prevent SDK-level errors (plan mode requires interactive approval)
5. **System prompt composition**: Parts are appended in order: `agent.systemPrompt`, `agent.appendPrompt`, `personaPrompt`, `skillPrompt` (prefixed with `## Skill Instructions`). All combined with `\n\n` and set as `claude_code` preset append
6. **API outage detection**: After `API_FAILURE_THRESHOLD` (3) consecutive API errors (network failures, 5xx, 429, overloaded), `onApiOutage` is called. Non-API errors reset the counter
7. **Pseudo-PID assignment**: Each process gets a monotonically increasing pseudo-PID starting at 900,000 (not a real OS PID since SDK runs in-process)
8. **Abort-safe exit**: AbortError (from `kill()`) results in `onExit(0)`, not an error event
9. **MCP stream timeout**: `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT` is hardcoded to 7,200,000ms (2 hours) to prevent tools from dying during long autonomous sessions
10. **Tool permissions vs allowed tools**: `sdkOptions.tools` defines which tools are available. `allowedTools` (auto-approve) is NOT set — all tools go through `canUseTool` for approval

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

## Error Cases

| Condition | Behavior |
|-----------|----------|
| SDK query throws non-abort error | Error event emitted, `onExit(1)` called |
| SDK query throws AbortError (from kill) | `onExit(0)` called, no error event |
| API outage (3+ consecutive API errors) | `onApiOutage()` called, no `onExit` |
| `sendMessage` after process done | Returns `false` |
| `sendMessage` after abort | Returns `false` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@anthropic-ai/claude-agent-sdk` | `query`, `Query`, `SDKMessage`, `PermissionResult`, `CanUseTool`, `McpSdkServerConfigWithInstance`, `McpServerConfig` |
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
