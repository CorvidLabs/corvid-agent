# ADR-002: TaskQueue — Parallel Work Task Execution

**Date:** 2026-03-08
**Status:** Draft
**Council Session:** Sprint planning v0.20.0, 2026-03-07 (Architect, Backend, DevOps, Security, Frontend, Tech Lead)
**Prerequisite for:** #632 (work task pipeline parallel execution)
**Blocked by:** Nothing
**Blocks:** #632

---

## Executive Summary

This document defines the **TaskQueue** abstraction that enables parallel work task execution across different projects while preserving the single-active-task-per-project constraint. Phase 1 targets concurrency=2 with semaphore-based dispatch. Dependency chains are deferred to Phase 2.

---

## 1. Current State

### Work Task Lifecycle

```
create() → 'pending' (never persisted today — immediately transitions)
  → 'branching' (git worktree creation)
  → 'running' (Claude session active, up to WORK_MAX_ITERATIONS=3)
  → 'validating' (bun test / tsc / lint)
  → 'completed' | 'failed'
```

### Concurrency Today

- **Per-project exclusion:** `createWorkTaskAtomic()` uses `INSERT ... WHERE NOT EXISTS (status IN ('branching','running','validating'))` — atomic under WAL mode
- **No queue:** When a project has an active task, new requests receive `ConflictError (409)` immediately. No pending queue, no retry
- **Global limit:** None — theoretically unlimited projects can run tasks simultaneously (bounded only by system resources)

### Existing Concurrency Patterns

| System | Mechanism | Scope | Queue |
|--------|-----------|-------|-------|
| WorkTaskService | Atomic INSERT exclusion | Per-project | None (hard reject) |
| SchedulerService | In-memory Set + repo_locks table | Global max=2, per-repo | Skip & retry next tick |
| WorkflowService | In-memory Set | Global max=4 | Implicit (re-eval next tick) |
| Ollama Provider | Weight-based semaphore + waiters array | Per-provider | In-memory waiters |

---

## 2. TaskQueue Interface

### Design Principles

- **Separate concern:** TaskQueue manages dispatch ordering and concurrency; WorkTaskService owns task lifecycle
- **Extend, don't replace:** WorkTaskService gains a `pending` state that is actually persisted; TaskQueue polls for pending tasks
- **Follow existing patterns:** Polling loop like SchedulerService/WorkflowService, not event-driven

### Interface

```typescript
interface TaskQueueConfig {
    /** Max concurrent active tasks across all projects. Default: 2 */
    maxConcurrency: number;
    /** Polling interval in ms. Default: 5000 */
    pollIntervalMs: number;
}

class TaskQueueService {
    constructor(
        db: Database,
        workTaskService: WorkTaskService,
        config?: Partial<TaskQueueConfig>,
    );

    /** Start the polling loop */
    start(): void;

    /** Stop polling, optionally drain running tasks */
    stop(drain?: boolean): Promise<void>;

    /** Enqueue a new task — persists as 'pending', returns immediately */
    async enqueue(input: CreateWorkTaskInput, tenantId?: string): Promise<WorkTask>;

    /** Current number of active (branching/running/validating) tasks */
    get activeCount(): number;

    /** Current number of pending tasks */
    get pendingCount(): number;
}
```

### Dispatch Loop

```
tick() every 5s:
  activeCount = SELECT COUNT(*) FROM work_tasks
                WHERE status IN ('branching', 'running', 'validating')
  if activeCount >= maxConcurrency:
    return  // at capacity

  available = maxConcurrency - activeCount

  BEGIN IMMEDIATE
    candidates = SELECT * FROM work_tasks
                 WHERE status = 'pending'
                 AND project_id NOT IN (
                     SELECT project_id FROM work_tasks
                     WHERE status IN ('branching', 'running', 'validating')
                 )
                 ORDER BY created_at ASC
                 LIMIT :available

    for each candidate:
      UPDATE work_tasks SET status = 'branching' WHERE id = :id
  COMMIT

  for each promoted candidate:
    workTaskService.executeTask(candidate)  // fire-and-forget async
```

The `BEGIN IMMEDIATE` transaction prevents two tick cycles from racing on the same candidates. The `project_id NOT IN (...)` subquery enforces the per-project exclusion at dispatch time, not at insert time.

### Changes to WorkTaskService

1. **`create()` becomes `enqueue()`** — inserts with `status = 'pending'` instead of immediately calling `executeTask()`
2. **`executeTask()` becomes package-public** — called by TaskQueueService after promotion from `pending` to `branching`
3. **Backward compat:** Direct `create()` retained for callers that want immediate execution (e.g., retry), but gated by concurrency check

### Changes to createWorkTaskAtomic

The atomic INSERT constraint changes from "reject if active task on project" to "always insert as pending":

```sql
-- Before: reject if busy
INSERT INTO work_tasks (...) SELECT ... WHERE NOT EXISTS (... status IN ('branching','running','validating'))

-- After: always insert as pending (queue admission)
INSERT INTO work_tasks (id, ..., status) VALUES (?, ..., 'pending')
```

Per-project exclusion moves to the **dispatch loop** (shown above), not the insert path. This means multiple pending tasks can exist for the same project — they queue up and execute in FIFO order.

---

## 3. Schema Changes

### Migration: Add queue support columns

```sql
-- New columns on work_tasks
ALTER TABLE work_tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE work_tasks ADD COLUMN queued_at TEXT DEFAULT NULL;

-- Index for efficient dispatch query
CREATE INDEX idx_work_tasks_pending_dispatch
    ON work_tasks(status, project_id, priority DESC, created_at ASC)
    WHERE status = 'pending';
```

**Columns:**

| Column | Type | Purpose |
|--------|------|---------|
| `priority` | INTEGER | Higher = dispatched sooner. Default 0. Scheduler-originated tasks can use higher priority. |
| `queued_at` | TEXT | Timestamp when task entered pending state. Informational for UI queue display. |

**Not added in Phase 1:**
- `depends_on` / `parent_task_id` — deferred to Phase 2 dependency chains
- `queue_position` — unnecessary; ordering derived from `(priority DESC, created_at ASC)`

### Shared Type Update

```typescript
// shared/types/work-tasks.ts
interface WorkTask {
    // ... existing fields ...
    priority: number;       // NEW
    queuedAt: string | null; // NEW
}
```

---

## 4. Integration with WorkflowService

The `work_task` node type in WorkflowService currently calls `workTaskService.create()` directly. Under the new design:

```typescript
// server/workflow/handlers/work-task.ts
async function executeWorkTaskNode(ctx: NodeContext): Promise<NodeResult> {
    // Before: const task = await workTaskService.create(input);
    // After:
    const task = await taskQueueService.enqueue(input);

    // Task starts as 'pending' — the workflow node should subscribe
    // for completion rather than assuming immediate execution
    workTaskService.onComplete(task.id, (completed) => {
        ctx.completeNode({ workTaskId: completed.id, prUrl: completed.prUrl });
    });

    return { workTaskId: task.id, status: 'pending' };
}
```

The WorkflowService's existing `advanceRun()` loop already handles async node completion — no structural changes needed there.

---

## 5. SQLite Contention Mitigation

### Problem

With 2+ concurrent tasks, each performing status updates (`pending` → `branching` → `running` → `validating` → `completed`), WAL write lock contention increases. Each `updateWorkTaskStatus()` is a separate write.

### Mitigations

1. **WAL mode already enabled** — readers never block writers; writers only block other writers briefly during page flush. Status updates are single-row UPDATEs (~microseconds).

2. **Long-running operations don't hold locks** — `generateRepoMap()`, `runBunInstall()`, `runValidation()`, and Claude sessions happen between status updates. The actual DB write window is tiny.

3. **Dispatch loop uses `BEGIN IMMEDIATE`** — this acquires the write lock upfront, preventing starvation where the tick transaction repeatedly fails due to concurrent status updates.

4. **Retry with backoff on SQLITE_BUSY** — add a Bun SQLite busy timeout:
   ```typescript
   // Already available in bun:sqlite
   db.exec('PRAGMA busy_timeout = 5000'); // 5s retry window
   ```

5. **Batch status updates** — if contention becomes measurable (Phase 2), batch multiple field updates into single transactions rather than individual `UPDATE` statements.

### Expected Impact

At concurrency=2, contention is negligible. The SchedulerService already runs 2 concurrent executions with no observed SQLite issues. The real risk emerges at concurrency 4+ — which is explicitly deferred.

---

## 6. Frontend Contract

### REST API Changes

**Existing endpoints — no breaking changes:**

```
GET    /api/work-tasks           → WorkTask[] (now includes pending tasks with queue info)
POST   /api/work-tasks           → WorkTask (201, status='pending') — no longer 409 for busy projects
GET    /api/work-tasks/:id       → WorkTask | 404
POST   /api/work-tasks/:id/cancel → WorkTask (now works for pending tasks too — removes from queue)
POST   /api/work-tasks/:id/retry  → WorkTask
```

**Key behavioral change:** `POST /api/work-tasks` returns `201` with `status: 'pending'` instead of `409` when a project is busy. The task is queued, not rejected.

### WebSocket Events

**Extended `work_task_update` — emitted on every status transition:**

```typescript
// Server → Client (existing type, now emitted more frequently)
{ type: 'work_task_update'; task: WorkTask }

// Emitted on: pending → branching → running → validating → completed/failed
// Previously only emitted on: creation (running) and completion
```

**New event for queue position changes:**

```typescript
// Server → Client
{
    type: 'work_task_queue_update';
    tasks: Array<{ id: string; position: number; projectId: string }>;
}
```

Emitted when queue ordering changes (task completes, freeing a slot; new task enqueued; task cancelled).

### Parallel Tasks in List Response

The `GET /api/work-tasks` response already returns an array. No structural change needed. Clients that assume only one active task per project need updating — but the API contract is already correct.

### Queue Status Endpoint (new)

```
GET /api/work-tasks/queue-status → {
    activeCount: number;
    pendingCount: number;
    maxConcurrency: number;
    activeByProject: Record<string, string>;  // projectId → taskId
}
```

---

## 7. Phase Plan

### Phase 1 (this PR / #632)

- TaskQueueService with `maxConcurrency = 2`
- Semaphore-based dispatch (polling loop)
- Cross-project parallelism only
- Per-project FIFO queue (no more 409 rejections)
- Schema migration: `priority`, `queued_at` columns
- WebSocket status transition events
- Queue status endpoint

### Phase 2 (future)

- Dependency chains: `dependsOn: [taskId]` column
- TaskQueue resolves dependencies before dispatch
- Same-project sequential chains (explicit opt-in)
- Concurrency limit increase to 4 (after SQLite contention benchmarking)
- Container sandboxing integration (#382) for resource isolation

---

## 8. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| SQLite contention at concurrency=2 | Low | WAL mode + busy_timeout; proven by SchedulerService at same level |
| Git worktree conflicts (same-project) | Medium | Phase 1 is cross-project only; per-project exclusion enforced in dispatch |
| Queue starvation (high-priority tasks block low) | Low | Phase 1 has no priority differentiation (all default 0); FIFO ordering |
| Memory pressure from 2 Claude sessions | Medium | Process manager already handles session lifecycle; monitor and tune |
| Graceful shutdown with pending queue | Low | `stop(drain=true)` drains active tasks; pending tasks survive in DB (persistent queue) |

---

## 9. Open Questions

1. **Should pending tasks expire?** If a task sits in the queue for hours (e.g., project permanently busy), should it auto-fail? Recommendation: not in Phase 1; add a configurable TTL in Phase 2.

2. **Priority escalation for scheduler tasks?** Scheduler-originated work tasks could use `priority = 10` to jump ahead of manually-queued tasks. Needs Frontend Engineer input.

3. **Notification on queue admission?** Should the requester (AlgoChat, Discord, web) receive a "your task is queued at position N" message? Recommendation: yes, via the existing `work_task_update` event with `status = 'pending'`.

---

## Appendix: File Map

| File | Change Type | Description |
|------|-------------|-------------|
| `server/work/queue.ts` | **New** | TaskQueueService implementation |
| `server/work/service.ts` | Modify | Make `executeTask()` package-public; add lifecycle events |
| `server/db/work-tasks.ts` | Modify | Remove atomic exclusion from INSERT; add dispatch query |
| `shared/types/work-tasks.ts` | Modify | Add `priority`, `queuedAt` fields |
| `shared/ws-protocol.ts` | Modify | Add `work_task_queue_update` event type |
| `server/routes/work-tasks.ts` | Modify | Queue status endpoint; update POST behavior |
| `server/workflow/handlers/work-task.ts` | Modify | Use `enqueue()` instead of `create()` |
| `server/index.ts` | Modify | Initialize TaskQueueService, wire dependencies |
| `migrations/072-task-queue.sql` | **New** | Add `priority`, `queued_at` columns + index |
