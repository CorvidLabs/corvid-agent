---
module: task-queue
version: 1
status: active
files:
  - server/work/queue.ts
db_tables:
  - work_tasks
depends_on:
  - specs/work/work-task-service.spec.md
  - specs/db/connection.spec.md
---

# Task Queue Service

## Purpose

Provides concurrency-controlled dispatch of work tasks. Tasks are enqueued with status `pending` and a polling loop promotes them to execution when slots are available, respecting a configurable `maxConcurrency` limit. This decouples task creation from execution, preventing overload when many tasks arrive simultaneously and ensuring fair scheduling across projects.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `TaskQueueConfig` | Configuration interface: `maxConcurrency` (default 2) and `pollIntervalMs` (default 5000) |

### Exported Classes

| Class | Description |
|-------|-------------|
| `TaskQueueService` | Manages a polling dispatch loop that promotes pending work tasks to execution within concurrency limits |

#### TaskQueueService Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `workTaskService` | `WorkTaskService` | Delegate for task creation and execution |
| `config` | `Partial<TaskQueueConfig>` | Optional overrides for maxConcurrency and pollIntervalMs |

#### TaskQueueService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | _(none)_ | `void` | Starts the polling dispatch loop; no-op if already running |
| `stop` | `drain?: boolean` | `Promise<void>` | Stops polling; if drain=true, waits for active tasks to finish |
| `enqueue` | `input: CreateWorkTaskInput, tenantId?: string` | `Promise<WorkTask>` | Persists a new work task via WorkTaskService.create; rejects if server is shutting down |
| `getQueueStatus` | _(none)_ | `{ activeCount, pendingCount, maxConcurrency, activeByProject }` | Returns current queue metrics for the status endpoint |
| `onQueueChange` | `listener: (activeCount, pendingCount) => void` | `void` | Registers a listener notified on queue state changes |
| `offQueueChange` | `listener: (activeCount, pendingCount) => void` | `void` | Removes a queue change listener |

#### TaskQueueService Properties

| Property | Type | Description |
|----------|------|-------------|
| `activeCount` | `number` | Current number of active (branching/running/validating) tasks |
| `pendingCount` | `number` | Current number of pending tasks awaiting dispatch |
| `running` | `boolean` | Whether the dispatch loop is currently running |

## Invariants

1. At most `maxConcurrency` tasks may be in an active state (branching/running/validating) at any time.
2. The dispatch tick uses `BEGIN IMMEDIATE` (via `writeTransaction`) to prevent two concurrent ticks from racing on the same candidates.
3. Candidates are atomically promoted from `pending` to `branching` within the same transaction before execution begins.
4. `enqueue()` rejects with `ValidationError` when `workTaskService.shuttingDown` is true.
5. `start()` is idempotent — calling it when already running is a no-op.
6. Queue change listeners are notified after both `enqueue()` and successful dispatch ticks.
7. Errors in individual queue change listeners are caught and logged, never propagated to callers.
8. If `WorkTaskService.create()` immediately executes the task (no concurrency conflict), the dispatch loop does not re-execute it.

## Behavioral Examples

### Scenario: Task dispatched when capacity is available

- **Given** maxConcurrency is 2 and 1 task is currently active
- **When** a pending task exists and the dispatch tick fires
- **Then** the pending task is promoted to `branching` and execution begins

### Scenario: Task queued when at capacity

- **Given** maxConcurrency is 2 and 2 tasks are active
- **When** `enqueue()` is called with a new task
- **Then** the task is persisted as `pending` and remains in the queue until a slot opens

### Scenario: Graceful shutdown with drain

- **Given** the dispatch loop is running with 1 active task
- **When** `stop(true)` is called
- **Then** polling stops and the service waits for the active task to complete via `workTaskService.drainRunningTasks()`

### Scenario: Rejected during shutdown

- **Given** `workTaskService.shuttingDown` is true
- **When** `enqueue()` is called
- **Then** a `ValidationError` is thrown with message about server shutting down

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Server is shutting down | `enqueue()` throws `ValidationError` |
| Agent or project missing at dispatch time | Task is set to `failed` with error message; execution skipped |
| Dispatch tick throws | Error is caught and logged; next tick runs normally |
| Promoted task execution throws | Error is caught and logged per-task; other tasks unaffected |
| Queue change listener throws | Error is caught and logged; other listeners still notified |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `work/service` | `WorkTaskService` for task creation, execution, and drain |
| `db/work-tasks` | `countActiveTasks`, `countPendingTasks`, `dispatchCandidates`, `getActiveTasksByProject`, `updateWorkTaskStatus` |
| `db/pool` | `writeTransaction` for atomic dispatch |
| `db/agents` | `getAgent` for resolving agent at dispatch time |
| `db/projects` | `getProject` for resolving project at dispatch time |
| `lib/logger` | `createLogger` for structured logging |
| `lib/errors` | `ValidationError` for shutdown rejection |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap` | Constructed and wired into the application |
| `routes/*` | `enqueue()`, `getQueueStatus()` exposed via API endpoints |
| WebSocket layer | `onQueueChange` / `offQueueChange` for live queue broadcasts |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `TASK_QUEUE_MAX_CONCURRENCY` | `2` | Maximum concurrent active tasks |
| `TASK_QUEUE_POLL_INTERVAL_MS` | `5000` | Polling interval in milliseconds |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | corvid-agent | Initial spec |
