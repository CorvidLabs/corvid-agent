---
module: shutdown-coordinator
version: 1
status: draft
files:
  - server/lib/shutdown-coordinator.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# Shutdown Coordinator

## Purpose

Provides centralized graceful shutdown with priority-ordered phases. Services register cleanup handlers with numeric priorities (lower = runs first). On shutdown, handlers execute in priority order with per-handler timeouts and error isolation so one misbehaving service cannot block or crash the rest. The coordinator is idempotent — multiple concurrent shutdown calls safely converge.

## Public API

### Exported Functions

(none — all functionality is on the `ShutdownCoordinator` class)

### Exported Types

| Type | Description |
|------|-------------|
| `ShutdownPhase` | `'idle' \| 'shutting_down' \| 'completed' \| 'forced'` — current lifecycle phase of the coordinator. |
| `ShutdownHandler` | `{ name: string; priority: number; handler: () => void \| Promise<void>; timeoutMs?: number }` — a registered cleanup handler. |
| `ShutdownResult` | `{ phase: ShutdownPhase; durationMs: number; handlers: Array<{ name, priority, status, durationMs, error? }> }` — result summary after shutdown completes. |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ShutdownCoordinator` | Centralized graceful shutdown orchestrator with priority ordering, per-handler timeouts, and error isolation. |

#### ShutdownCoordinator Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `gracePeriodMs?: number` | `ShutdownCoordinator` | Creates the coordinator. Default grace period: 30s. |
| `register` | `handler: ShutdownHandler` | `void` | Registers a cleanup handler. Rejected if shutdown is already in progress. |
| `registerService` | `name: string, service: { stop() }, priority?: number, timeoutMs?: number` | `void` | Convenience method to register a service with a `stop()` method. Default priority: 10. |
| `registerSignals` | `logDiagnostics?: (signal: string) => void, exitCodeMap?: Record<string, number>` | `void` | Registers SIGINT/SIGTERM handlers that trigger coordinated shutdown. Idempotent — only registers once. |
| `shutdown` | _(none)_ | `Promise<ShutdownResult>` | Executes all handlers in priority order. Idempotent — concurrent calls converge on the same result. |
| `getStatus` | _(none)_ | `{ phase, handlerCount, result }` | Returns current status for health endpoint. |

## Invariants

1. Handlers execute in ascending priority order (lower number = runs first).
2. Each handler has an individual timeout (default: 5s); a slow handler cannot block subsequent handlers beyond its timeout.
3. A handler that throws or times out does not prevent remaining handlers from executing (error isolation).
4. The overall grace period (default: 30s) caps total shutdown time; remaining handlers after grace period exhaustion are marked as `timeout`.
5. `shutdown()` is idempotent: concurrent calls block and return the same `ShutdownResult`.
6. Handlers cannot be registered after shutdown has started — `register()` logs a warning and returns.
7. `registerSignals()` is idempotent — calling it multiple times does not register duplicate signal handlers.
8. Phase transitions are: `idle` → `shutting_down` → `completed` (all ok) or `forced` (had timeouts).

## Behavioral Examples

### Scenario: Normal graceful shutdown

- **Given** handlers registered at priorities 0 (scheduler), 10 (process manager), 50 (database), all completing within their timeouts
- **When** `shutdown()` is called
- **Then** handlers execute in order 0 → 10 → 50, all report status `'ok'`, phase becomes `'completed'`

### Scenario: Handler timeout

- **Given** a handler at priority 10 with a 5s timeout that hangs for 30s
- **When** `shutdown()` is called
- **Then** the handler is marked as `'timeout'` after 5s, remaining handlers continue executing

### Scenario: Handler error

- **Given** a handler at priority 20 that throws an Error
- **When** `shutdown()` is called
- **Then** the handler is marked as `'error'` with the error message, remaining handlers continue

### Scenario: Grace period exhaustion

- **Given** 5 handlers and a 10s grace period, where the first 3 handlers consume all 10s
- **When** `shutdown()` is called
- **Then** handlers 4 and 5 are marked as `'timeout'` with reason `'Grace period exhausted'`, phase becomes `'forced'`

### Scenario: Concurrent shutdown calls

- **Given** `shutdown()` is called twice concurrently
- **When** both calls are awaited
- **Then** both resolve with the same `ShutdownResult`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Handler throws synchronously | Caught, marked as `'error'`, shutdown continues |
| Handler promise rejects | Caught, marked as `'error'`, shutdown continues |
| Handler exceeds its timeout | Marked as `'timeout'`, shutdown moves to next handler |
| Grace period exhausted | All remaining handlers marked as `'timeout'`, phase set to `'forced'` |
| `register()` called during shutdown | Warning logged, handler silently ignored |
| `registerSignals()` called twice | Second call is a no-op |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` for structured shutdown logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap.ts` | Instantiates `ShutdownCoordinator` and registers all services |
| `server/algochat/init.ts` | References `ShutdownCoordinator` type for AlgoChat bridge cleanup registration |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| _(none)_ | | Grace period and handler timeouts are set programmatically at registration time |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-09 | corvid-agent | Initial spec (#591) |
