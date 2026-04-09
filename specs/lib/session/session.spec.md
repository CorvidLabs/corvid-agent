---
module: session
version: 1
status: draft
files:
  - server/lib/agent-session-limits.ts
  - server/lib/session-heartbeat.ts
  - server/lib/wait-sessions.ts
db_tables: []
depends_on:
  - specs/lib/infra/infra.spec.md
  - specs/lib/infra/resilience.spec.md
---

# Session

## Purpose

Provides session lifecycle utilities: per-session rate limiting for agent tool actions based on tier-based caps, heartbeat polling constants for safety-net process monitoring, and an enhanced `waitForSessions` implementation with heartbeat polling and safety timeout to prevent stuck councils from missed process-exit events.

## Public API

### Exported Functions

#### agent-session-limits.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isSessionRateLimited` | `toolName: string` | `boolean` | Checks if a tool name is subject to session rate limiting. Returns true for `corvid_github_create_pr`, `corvid_github_create_issue`, `corvid_send_message`, and `corvid_ask_owner`. |

#### wait-sessions.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `waitForSessions` | `processManager: ProcessManager, sessionIds: string[], timeoutMs?: number, options?: WaitForSessionsOptions` | `Promise<WaitForSessionsResult>` | Waits for a set of agent sessions to complete with heartbeat polling and safety timeout. Uses subscribe-first pattern to close the primary race window. Heartbeat polling catches remaining missed exits. Safety timeout prevents indefinite hangs. |

### Exported Types

#### agent-session-limits.ts
| Type | Description |
|------|-------------|
| `RateLimitedAction` | Union type: `'corvid_github_create_pr' \| 'corvid_github_create_issue' \| 'corvid_send_message' \| 'corvid_ask_owner'` -- tool names subject to per-session rate limiting. |

#### wait-sessions.ts
| Type | Description |
|------|-------------|
| `WaitForSessionsResult` | `{ completed: string[]; timedOut: string[] }` -- result of waiting for sessions, listing which completed and which timed out. |
| `WaitForSessionsOptions` | `{ heartbeatMs?: number; safetyTimeoutMs?: number }` -- optional timing overrides primarily for testing. |

### Exported Constants

#### session-heartbeat.ts
| Constant | Type | Description |
|----------|------|-------------|
| `HEARTBEAT_INTERVAL_MS` | `number` | `30_000` (30 seconds) -- heartbeat interval for polling `isRunning` as a safety net against missed process-exit events. |
| `IDLE_TIMEOUT_MS` | `number` | `600_000` (10 minutes) -- idle timeout: auto-advance if all sessions are idle (not running) for this long. |

#### wait-sessions.ts
| Constant | Type | Description |
|----------|------|-------------|
| `HEARTBEAT_INTERVAL_MS` | `number` | `30_000` (30 seconds) -- periodic re-check interval for missed exits in `waitForSessions`. |
| `SAFETY_TIMEOUT_MS` | `number` | `600_000` (10 minutes) -- safety net timeout when all sessions are dead but pending set is non-empty. |

### Exported Classes

#### agent-session-limits.ts
| Class | Description |
|-------|-------------|
| `AgentSessionLimiter` | Per-session usage tracker that enforces tier-based rate limits on tool actions (PRs, issues, messages, escalations). Created once per session. |

#### AgentSessionLimiter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `sessionId: string, model: string` | `AgentSessionLimiter` | Creates a limiter for a session, resolving the agent tier config from the model name via `getAgentTierConfig`. |
| `checkAndIncrement` | `toolName: string` | `string \| null` | Checks if a tool action is allowed and increments usage if so. Returns null if allowed, or an error message string if rate-limited. Non-rate-limited tools always return null. |
| `getUsage` | `toolName: string` | `number` | Returns current usage count for a tool (0 if not yet used). |

#### AgentSessionLimiter Properties

| Property | Type | Description |
|----------|------|-------------|
| `canVoteInCouncil` | `boolean` (getter) | Whether the agent can participate in council votes based on their tier. |
| `tier` | `AgentTierConfig` (getter) | The full tier configuration for this session's agent. |

## Invariants

1. `AgentSessionLimiter` resolves the tier once at construction time from the model name; the tier does not change during the session.
2. `checkAndIncrement` only rate-limits tools in the `RATE_LIMITED_TOOLS` set; all other tool names pass through (return null).
3. `checkAndIncrement` checks the limit before incrementing; usage is only incremented when the action is allowed.
4. Rate limits are per-session, not global — each `AgentSessionLimiter` instance tracks its own usage.
5. `waitForSessions` subscribes to process events BEFORE checking `isRunning`, closing the primary race window where a process exits between check and subscribe.
6. `waitForSessions` heartbeat interval periodically re-checks `isRunning` for all pending sessions to catch exits missed by event subscription.
7. `waitForSessions` safety timeout auto-advances when all pending sessions are dead but no exit event was received, preventing stuck councils.
8. `waitForSessions` is resolved either when all sessions complete, the overall timeout fires, or the safety timeout detects all-dead sessions.
9. `waitForSessions` cleans up all event subscriptions and timers on resolution.
10. Default timeout for `waitForSessions` is 10 minutes (matches `MIN_ROUND_TIMEOUT_MS`).

## Behavioral Examples

### Scenario: Agent hits PR creation limit
- **Given** an `AgentSessionLimiter` for a `limited` tier model (max 1 PR per session) that has already created 1 PR
- **When** `checkAndIncrement('corvid_github_create_pr')` is called
- **Then** it returns an error message string indicating the rate limit was reached

### Scenario: Non-rate-limited tool passes through
- **Given** an `AgentSessionLimiter` for any tier
- **When** `checkAndIncrement('corvid_read_file')` is called
- **Then** it returns null (allowed)

### Scenario: Council vote eligibility by tier
- **Given** an `AgentSessionLimiter` for a `limited` tier model
- **When** `canVoteInCouncil` is accessed
- **Then** it returns `false` (limited tier cannot vote)

### Scenario: waitForSessions with all sessions completing normally
- **Given** `waitForSessions` is called with session IDs ["s1", "s2"]
- **When** both sessions emit `session_exited` events
- **Then** the result has `completed: ["s1", "s2"]` and `timedOut: []`

### Scenario: waitForSessions catches missed exit via heartbeat
- **Given** a session exits but no event is emitted (missed event)
- **When** the heartbeat interval fires and `isRunning` returns false for that session
- **Then** the session is marked completed without waiting for the full timeout

### Scenario: waitForSessions safety timeout with all-dead sessions
- **Given** all pending sessions are no longer running but no exit events were received
- **When** the safety timeout fires
- **Then** all pending sessions are marked completed and the promise resolves

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `checkAndIncrement` called after limit reached | Returns descriptive error string with tier name and current count; does not increment |
| `waitForSessions` overall timeout fires | Remaining pending sessions appear in `timedOut` array; all subscriptions are cleaned up |
| `waitForSessions` called with empty session list | Resolves immediately with `{ completed: [], timedOut: [] }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `lib/agent-tiers` | `getAgentTierConfig`, `AgentTierConfig` for tier resolution in `AgentSessionLimiter` |
| `lib/logger` | `createLogger` for structured logging in agent-session-limits and wait-sessions |
| `process/manager` | `ProcessManager` type, `isRunning`, `subscribe`, `unsubscribe` in `waitForSessions` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `process/sdk-process`, `process/ollama-process` | `AgentSessionLimiter` for per-session tool rate limiting |
| `councils/discussion` | `waitForSessions` for waiting on council round sessions with heartbeat safety |
| `councils/discussion` | `HEARTBEAT_INTERVAL_MS`, `IDLE_TIMEOUT_MS` from session-heartbeat for timing constants |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec covering agent-session-limits, session-heartbeat, and wait-sessions |
