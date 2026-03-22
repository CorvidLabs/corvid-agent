---
module: tool-guardrails
version: 1
status: active
files:
  - server/mcp/tool-guardrails.ts
db_tables: []
depends_on: []
---

# Tool Guardrails

## Purpose

Prevents emergent agent-to-agent networking behavior by classifying MCP tools into cost/risk tiers. Expensive networking tools are hidden from sessions unless explicitly enabled, preventing small models from wasting resources on unprompted cross-agent messaging. Also provides per-session rate limiting for agent-to-agent sends. Closes #1054.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `EXPENSIVE_NETWORKING_TOOLS` | `Set<string>` | Tool names that trigger agent-to-agent networking (e.g., `corvid_send_message`, `corvid_list_agents`) |
| `PRIVILEGED_SOURCES` | `Set<string>` | Session sources that get full tool access by default (`'web'`) |

### Exported Types

| Type | Description |
|------|-------------|
| `ToolAccessPolicy` | `'full' \| 'standard' \| 'restricted'` — session tool access level |
| `ToolAccessConfig` | Configuration for session-level tool access control with policy and optional allowed overrides |
| `SessionMessageRateLimitConfig` | Rate limit config: max messages, max unique targets, min interval |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveToolAccessPolicy` | `(source: string \| undefined, agentModel?: string)` | `ToolAccessPolicy` | Returns default policy based on session source: `'full'` for web, `'restricted'` for agent, `'standard'` for all others |
| `isToolBlockedByGuardrail` | `(toolName: string, config: ToolAccessConfig)` | `boolean` | Returns true if the tool should be hidden for the given config |
| `filterToolsByGuardrail` | `<T extends { name: string }>(tools: T[], config: ToolAccessConfig)` | `T[]` | Filters a tool list, removing those blocked by guardrail config |
| `loadSessionMessageLimits` | `()` | `SessionMessageRateLimitConfig` | Loads rate limit config from environment variables with defaults |

### Exported Classes

| Class | Description |
|-------|-------------|
| `SessionMessageRateLimiter` | Per-session rate limiter for agent-to-agent messaging |

#### SessionMessageRateLimiter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `(config?: Partial<SessionMessageRateLimitConfig>)` | | Creates limiter with given config merged over defaults |
| `check` | `(targetAgent: string)` | `string \| null` | Returns null if allowed, or error message if blocked |
| `record` | `(targetAgent: string)` | `void` | Records a successful send |
| `getSendCount` | `()` | `number` | Current total send count |
| `getUniqueTargetCount` | `()` | `number` | Current unique target agent count |

## Invariants

1. **Full policy never blocks**: When `policy === 'full'`, `isToolBlockedByGuardrail` always returns false
2. **Non-expensive tools never blocked**: Tools not in `EXPENSIVE_NETWORKING_TOOLS` are never blocked regardless of policy
3. **Explicit overrides respected**: Tools listed in `allowedExpensiveTools` are never blocked even under `standard` or `restricted` policy
4. **Agent sessions restricted**: Sessions with source `'agent'` always get `'restricted'` policy to prevent recursive networking
5. **Rate limiter stateful per-session**: Each `SessionMessageRateLimiter` instance tracks its own independent counters

## Behavioral Examples

### Scenario: Web session gets full access

- **Given** a session with source `'web'`
- **When** `resolveToolAccessPolicy('web')` is called
- **Then** returns `'full'` and no tools are blocked

### Scenario: Discord session hides networking tools

- **Given** a session with source `'discord'` and no explicit overrides
- **When** `filterToolsByGuardrail` is called with `policy: 'standard'`
- **Then** all `EXPENSIVE_NETWORKING_TOOLS` are removed from the tool list

### Scenario: Rate limiter blocks after max messages

- **Given** a `SessionMessageRateLimiter` with `maxMessagesPerSession: 5`
- **When** 5 sends have been recorded and `check()` is called again
- **Then** returns an error message indicating the session limit is reached

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown session source | Returns `'standard'` policy (safe default) |
| Invalid env var for rate limits | Falls back to default numeric values |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger()` |

### Consumed By

| Module | What is used |
|--------|-------------|
| MCP session setup | `resolveToolAccessPolicy`, `filterToolsByGuardrail`, `ToolAccessConfig` |
| Agent messaging handlers | `SessionMessageRateLimiter`, `isToolBlockedByGuardrail` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `SESSION_MAX_AGENT_MESSAGES` | `5` | Maximum agent-to-agent messages per session |
| `SESSION_MAX_UNIQUE_TARGETS` | `2` | Maximum unique agents a session can message |
| `SESSION_MESSAGE_INTERVAL_MS` | `3000` | Minimum milliseconds between consecutive sends |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-22 | corvid-agent | Initial spec |
