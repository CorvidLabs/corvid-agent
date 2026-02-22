---
module: messaging-guard
version: 1
status: active
files:
  - server/algochat/messaging-guard.ts
db_tables: []
depends_on:
  - specs/algochat/bridge.spec.md
---

# MessagingGuard

## Purpose

Combined circuit breaker and per-agent rate limiter for agent-to-agent messaging. Protects against cascading failures by tracking per-target-agent outbound call health (circuit breaker pattern) and prevents message flooding via per-sender-agent sliding-window rate limiting.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `MessagingGuard` | Combined circuit breaker + per-agent rate limiter |

#### MessagingGuard Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `Partial<MessagingGuardConfig>` | Optional overrides; defaults loaded from env vars |

#### MessagingGuard Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `check` | `(fromAgentId: string, toAgentId: string)` | `GuardResult` | Check if a message is allowed; records send timestamp if allowed |
| `recordSuccess` | `(toAgentId: string)` | `void` | Record a successful call to the target agent |
| `recordFailure` | `(toAgentId: string)` | `void` | Record a failed call to the target agent |
| `getCircuitState` | `(toAgentId: string)` | `CircuitState` | Get current circuit state for a target agent |
| `resetCircuit` | `(toAgentId: string)` | `void` | Manually reset the circuit breaker for a target agent |
| `resetAll` | `()` | `void` | Reset all circuit breakers and rate limit windows |
| `stop` | `()` | `void` | Stop the periodic sweep timer |

### Exported Types

| Type | Description |
|------|-------------|
| `MessagingGuardConfig` | `{ failureThreshold, resetTimeoutMs, successThreshold, rateLimitPerWindow, rateLimitWindowMs }` |
| `GuardResult` | `{ allowed: boolean; reason?: GuardRejectionReason; retryAfterMs?: number }` |
| `GuardRejectionReason` | `'CIRCUIT_OPEN' \| 'RATE_LIMITED'` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `loadMessagingGuardConfig` | `()` | `MessagingGuardConfig` | Load config from env vars with defaults |

## Invariants

1. **Check order**: Circuit breaker is checked first, then rate limit. If the circuit is OPEN, the rate limit is not checked
2. **Per-target-agent circuit breakers**: Each target agent has an independent circuit breaker. Failures to one agent do not affect others
3. **Circuit breaker state machine**:
   - **CLOSED** (normal): All calls allowed. Transitions to OPEN after `failureThreshold` consecutive failures
   - **OPEN** (tripped): All calls rejected with `CIRCUIT_OPEN`. Transitions to HALF_OPEN after `resetTimeoutMs` elapses
   - **HALF_OPEN** (probing): Allows one probe call. Transitions to CLOSED after `successThreshold` consecutive successes, or back to OPEN on any failure
4. **Per-sender-agent rate limiting**: Each sender agent has an independent sliding window of message timestamps. No single agent can send more than `rateLimitPerWindow` messages within the window
5. **Sliding window pruning**: Expired timestamps are pruned on every `check()` call for the sender
6. **Send recording**: When `check()` returns `allowed: true`, the current timestamp is recorded in the sender's window. This happens inside `check()`, not externally
7. **retryAfterMs**: When rate limited, `retryAfterMs` is calculated from the oldest request in the window to tell the caller when capacity will free up
8. **State transition logging**: All circuit breaker state transitions are logged with the agent ID
9. **Metrics emission**: State transitions emit `circuitBreakerTransitions` metric; rejections emit `agentRateLimitRejections` metric
10. **Periodic sweep**: Stale rate-limit entries (senders with no recent messages) are swept every 5 minutes. The sweep timer is unref'd to not prevent process exit
11. **Config defaults**: `failureThreshold=5`, `resetTimeoutMs=30000`, `successThreshold=2`, `rateLimitPerWindow=10`, `rateLimitWindowMs=60000`
12. **Robust config parsing**: Invalid or non-positive env var values fall back to defaults

## Behavioral Examples

### Scenario: Normal operation (CLOSED circuit)

- **Given** a fresh MessagingGuard
- **When** agent "sender-1" sends a message to agent "target-1"
- **Then** `check("sender-1", "target-1")` returns `{ allowed: true }`

### Scenario: Circuit opens after failures

- **Given** `failureThreshold` is 5
- **When** 5 consecutive failures are recorded for "target-1"
- **Then** the circuit transitions CLOSED -> OPEN
- **And** `check("any-sender", "target-1")` returns `{ allowed: false, reason: 'CIRCUIT_OPEN', retryAfterMs: resetTimeoutMs }`

### Scenario: Circuit half-opens after cooldown

- **Given** the circuit for "target-1" is OPEN
- **When** `resetTimeoutMs` elapses
- **Then** the circuit transitions OPEN -> HALF_OPEN
- **And** one probe call is allowed

### Scenario: Circuit closes after successful probes

- **Given** the circuit for "target-1" is HALF_OPEN and `successThreshold` is 2
- **When** 2 consecutive successes are recorded
- **Then** the circuit transitions HALF_OPEN -> CLOSED

### Scenario: Circuit re-opens on probe failure

- **Given** the circuit for "target-1" is HALF_OPEN
- **When** a failure is recorded
- **Then** the circuit transitions HALF_OPEN -> OPEN

### Scenario: Rate limit exceeded

- **Given** `rateLimitPerWindow` is 10 and `rateLimitWindowMs` is 60000
- **When** agent "sender-1" sends 10 messages within 60 seconds
- **Then** the 11th message returns `{ allowed: false, reason: 'RATE_LIMITED', retryAfterMs: N }`

### Scenario: Rate limit window expires

- **Given** agent "sender-1" hit the rate limit
- **When** the oldest message in the window expires (60 seconds pass)
- **Then** new messages are allowed again

### Scenario: Circuit breaker takes priority

- **Given** the circuit for "target-1" is OPEN and "sender-1" has rate limit capacity
- **When** `check("sender-1", "target-1")` is called
- **Then** returns `{ allowed: false, reason: 'CIRCUIT_OPEN' }` (rate limit not checked)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown target agent | Returns `CLOSED` state (no breaker created yet) |
| `resetCircuit` for unknown agent | No-op (breaker not found) |
| Invalid env var values | Falls back to defaults |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/resilience.ts` | `CircuitBreaker` class, `CircuitOpenError`, `CircuitState` type |
| `server/lib/logger.ts` | `createLogger` |
| `server/observability/metrics.ts` | `circuitBreakerTransitions`, `agentRateLimitRejections` counters |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/agent-messenger.ts` | `check()`, `recordSuccess()`, `recordFailure()` before/after sending messages |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `AGENT_CB_FAILURE_THRESHOLD` | `5` | Failures before opening circuit |
| `AGENT_CB_RESET_TIMEOUT_MS` | `30000` | Cooldown (ms) before OPEN -> HALF_OPEN |
| `AGENT_CB_SUCCESS_THRESHOLD` | `2` | Successes in HALF_OPEN to close circuit |
| `AGENT_RATE_LIMIT_PER_MIN` | `10` | Max messages per agent per sliding window |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-21 | corvid-agent | Initial spec |
