---
module: resilience
version: 1
status: draft
files:
  - server/lib/resilience.ts
  - server/lib/shutdown-coordinator.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# Resilience

## Purpose

Provides fault-tolerance primitives (exponential-backoff retry and circuit breaker) and a centralized graceful shutdown coordinator with priority-ordered phases, per-handler timeouts, and error isolation.

## Public API

### Exported Functions

#### resilience.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `withRetry` | `fn: () => Promise<T>, options?: RetryOptions` | `Promise<T>` | Retries `fn` with exponential backoff. Delay formula: `min(baseDelayMs * multiplier^attempt, maxDelayMs) + random_jitter`. Respects optional `retryIf` predicate to selectively retry. |

### Exported Types

#### resilience.ts
| Type | Description |
|------|-------------|
| `RetryOptions` | Configuration for `withRetry`: `maxAttempts` (default 3), `baseDelayMs` (default 1000), `maxDelayMs` (default 30000), `multiplier` (default 2), `jitter` (default true), `retryIf` predicate. |
| `CircuitState` | Union type: `'CLOSED' \| 'OPEN' \| 'HALF_OPEN'`. |
| `CircuitBreakerOptions` | Configuration for `CircuitBreaker`: `failureThreshold` (default 3), `resetTimeoutMs` (default 60000), `successThreshold` (default 1). |

#### shutdown-coordinator.ts
| Type | Description |
|------|-------------|
| `ShutdownPhase` | Union type: `'idle' \| 'shutting_down' \| 'completed' \| 'forced'`. |
| `ShutdownHandler` | Handler registration object: `name: string`, `priority: number`, `handler: () => void \| Promise<void>`, optional `timeoutMs: number`. |
| `ShutdownResult` | Result of a shutdown operation: `phase: ShutdownPhase`, `durationMs: number`, `handlers: Array<{ name, priority, status, durationMs, error? }>`. |

### Exported Classes

#### resilience.ts
| Class | Description |
|-------|-------------|
| `CircuitOpenError` | Extends `AppError` (statusCode 503, code `'CIRCUIT_OPEN'`). Thrown when `CircuitBreaker.execute()` is called while the circuit is OPEN. |
| `CircuitBreaker` | Implements the circuit breaker pattern with three states (CLOSED, OPEN, HALF_OPEN). Tracks failures and successes, automatically transitions between states. |

#### CircuitBreaker Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `options?: CircuitBreakerOptions` | `CircuitBreaker` | Creates a new circuit breaker with configurable thresholds. |
| `getState` | _(none)_ | `CircuitState` | Returns current state. Lazily transitions OPEN to HALF_OPEN when reset timeout has elapsed. |
| `reset` | _(none)_ | `void` | Resets the circuit to CLOSED state, clearing all counters. |
| `execute` | `fn: () => Promise<T>` | `Promise<T>` | Executes `fn` through the circuit breaker. Throws `CircuitOpenError` if OPEN. Records success/failure for state transitions. |
| `recordSuccess` | _(none)_ | `void` | Manually records a successful operation. In HALF_OPEN, increments success count toward closing. In CLOSED, resets failure count. |
| `recordFailure` | _(none)_ | `void` | Manually records a failed operation. Increments failure count. In HALF_OPEN, immediately re-opens. In CLOSED, opens when threshold reached. |

### Exported Classes (shutdown-coordinator.ts)

| Class | Description |
|-------|-------------|
| `ShutdownCoordinator` | Centralized graceful shutdown with priority-ordered phases. Services register cleanup handlers; on shutdown, handlers execute in priority order with per-handler timeouts and error isolation. |

#### ShutdownCoordinator Properties

| Property | Type | Description |
|----------|------|-------------|
| `phase` | `ShutdownPhase` (getter) | Current shutdown phase. |
| `isShuttingDown` | `boolean` (getter) | True if shutdown has been initiated (phase is not `idle`). |
| `result` | `ShutdownResult \| null` (getter) | Result of the last shutdown; available after completion. |

#### ShutdownCoordinator Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `gracePeriodMs?: number` | `ShutdownCoordinator` | Creates coordinator with overall grace period (default 30000ms). |
| `register` | `handler: ShutdownHandler` | `void` | Registers a cleanup handler. Ignored if shutdown is already in progress. |
| `registerService` | `name: string, service: { stop: () => void \| Promise<void> }, priority?: number, timeoutMs?: number` | `void` | Convenience method to register a service that has a `stop()` method. Default priority: 10. |
| `registerSignals` | `logDiagnostics?: (signal: string) => void, exitCodeMap?: Record<string, number>` | `void` | Registers SIGINT/SIGTERM handlers that trigger coordinated shutdown. Idempotent (only registers once). Default exit codes: SIGINT=0, SIGTERM=0. |
| `shutdown` | _(none)_ | `Promise<ShutdownResult>` | Executes all registered handlers in priority order (ascending). Idempotent: concurrent calls wait for the in-progress shutdown. Returns result summary. |
| `getStatus` | _(none)_ | `{ phase, handlerCount, result }` | Returns status summary for health endpoints. |

## Invariants

1. `withRetry` executes `fn` at most `maxAttempts` times (including the initial attempt). No delay is added after the final failed attempt.
2. If `retryIf` is provided and returns `false`, the error is thrown immediately without further retries.
3. Jitter is capped at 10% of the exponential delay (`Math.random() * exponentialDelay * 0.1`).
4. `CircuitBreaker` starts in `CLOSED` state.
5. Circuit transitions CLOSED to OPEN after `failureThreshold` consecutive failures.
6. Circuit lazily transitions OPEN to HALF_OPEN when `resetTimeoutMs` has elapsed (checked on `getState()` or `execute()`).
7. Any failure in HALF_OPEN state immediately re-opens the circuit.
8. In HALF_OPEN, `successThreshold` consecutive successes transition back to CLOSED.
9. `CircuitBreaker.execute()` throws `CircuitOpenError` (503) when the circuit is OPEN.
10. `ShutdownCoordinator.shutdown()` is idempotent: calling it while already shutting down returns the same result promise; calling after completion returns the cached result.
11. Handlers execute in ascending priority order (lower priority number runs first).
12. Each handler is independently timed; a timeout or error in one handler does not prevent subsequent handlers from executing.
13. If the overall grace period is exhausted, remaining handlers are skipped and marked as `timeout`.
14. `register()` silently refuses to add handlers once shutdown has begun.
15. Priority convention: 0 (pollers/schedulers) < 10 (processing) < 20 (bridges) < 30 (process manager) < 40 (persistence) < 50 (database).
16. Default per-handler timeout is 5000ms. Default overall grace period is 30000ms.

## Behavioral Examples

### Scenario: Successful retry after transient failure
- **Given** a `withRetry` call with `maxAttempts: 3` and a function that fails on the first call, then succeeds
- **When** the function is invoked
- **Then** it retries after an exponential delay and returns the successful result on the second attempt.

### Scenario: All retries exhausted
- **Given** a `withRetry` call with `maxAttempts: 3` and a function that always throws
- **When** the function is invoked
- **Then** it throws the error from the last (third) attempt after two delay periods.

### Scenario: Non-retryable error short-circuits
- **Given** a `withRetry` call with `retryIf: (err) => err.code !== 'AUTH'` and the function throws an error with `code: 'AUTH'`
- **When** the function is invoked
- **Then** the error is thrown immediately without any retry.

### Scenario: Circuit breaker opens after repeated failures
- **Given** a `CircuitBreaker` with `failureThreshold: 3`
- **When** three consecutive calls through `execute()` fail
- **Then** the circuit transitions to OPEN and the next `execute()` call throws `CircuitOpenError` without invoking the function.

### Scenario: Circuit breaker recovers through HALF_OPEN
- **Given** a `CircuitBreaker` in OPEN state and `resetTimeoutMs` has elapsed
- **When** `execute()` is called and the function succeeds
- **Then** the circuit transitions to HALF_OPEN, then to CLOSED after meeting `successThreshold`.

### Scenario: Graceful shutdown with priority ordering
- **Given** a `ShutdownCoordinator` with handlers at priorities 0, 10, and 50
- **When** `shutdown()` is called
- **Then** the priority-0 handler runs first, then priority-10, then priority-50, and a `ShutdownResult` is returned with per-handler status.

### Scenario: Handler timeout during shutdown
- **Given** a handler registered with `timeoutMs: 1000` that takes 5 seconds
- **When** `shutdown()` is called
- **Then** the handler is recorded with `status: 'timeout'`, and subsequent handlers still execute.

### Scenario: Duplicate shutdown calls
- **Given** `shutdown()` is already in progress
- **When** `shutdown()` is called again concurrently
- **Then** the second call waits for and returns the same result as the first call.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `withRetry` function always fails | Throws the error from the last attempt after all retries are exhausted. |
| `retryIf` returns `false` | Error is thrown immediately, no further retries. |
| Circuit is OPEN when `execute()` called | Throws `CircuitOpenError` (HTTP 503, code `CIRCUIT_OPEN`). |
| Failure in HALF_OPEN state | Circuit immediately re-opens; the original error is re-thrown. |
| Handler throws during shutdown | Error is caught and logged; handler is recorded with `status: 'error'`; subsequent handlers still execute. |
| Handler times out during shutdown | Handler is recorded with `status: 'timeout'`; subsequent handlers still execute. |
| Grace period exhausted during shutdown | Remaining handlers are skipped and marked `status: 'timeout'` with `error: 'Grace period exhausted'`. Phase set to `'forced'`. |
| Registering handler after shutdown started | Registration is silently ignored with a warning log. |

## Dependencies

### Consumes
| Module | What is used |
|--------|-------------|
| `infra` | `AppError` from `errors.ts` (base class for `CircuitOpenError`); `createLogger` from `logger.ts` (logging in `ShutdownCoordinator`). |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/index.ts` | `ShutdownCoordinator` for application-wide graceful shutdown. |
| `server/process/*` | `withRetry` and `CircuitBreaker` for resilient external service calls. |
| Agent messenger / bridge modules | `withRetry` and `CircuitBreaker` for fault-tolerant communication. |
| Any module calling external services | `withRetry` for transient failure recovery; `CircuitBreaker` for protecting against cascading failures. |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-06 | corvid-agent | SIGTERM exit code changed from 1 to 0 to prevent systemd restart loops on graceful shutdown. |
