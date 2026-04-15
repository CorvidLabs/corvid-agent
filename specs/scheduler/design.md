---
spec: scheduler-service.spec.md
sources:
  - server/scheduler/service.ts
---

## Module Structure

Primary file: `server/scheduler/service.ts` — `SchedulerService` class and `validateScheduleFrequency` helper. Supporting files:
- `server/scheduler/cron-parser.ts` — `getNextCronDate()` for cron expression evaluation
- `server/scheduler/handlers/` — individual action type handlers (each action type dispatches to a focused handler function)
- `server/scheduler/pipeline.ts` — execution pipeline: create execution record → check approval → run action → finalize

## Key Classes and Functions

**`SchedulerService`** — Central polling service backed by SQLite. Constructor accepts `db`, `processManager`, optional `workTaskService`, optional `agentMessenger`. Late-inject services (`setReputationServices`, `setImprovementLoopService`, etc.) are called after dependent services initialize.

- `start()` — idempotent; sets `next_run_at` for schedules with NULL; schedules `setInterval` at 30s; runs first tick immediately.
- Poll tick: queries `agent_schedules WHERE status = 'active' AND next_run_at <= now()`. Skips if concurrent executions ≥ `MAX_CONCURRENT_EXECUTIONS` (2). For each due schedule: creates execution record, evaluates approval policy, updates `last_run_at` + `next_run_at`, dispatches action or parks in `awaiting_approval`.
- `resolveApproval(executionId, approved)` — retrieves execution, sets status to `running` (approved) or `denied`, fires action if approved.

**Approval policies:**
- `auto` — no approval needed, action runs immediately
- `owner_approve` — destructive actions (`work_task`, `github_suggest`, `fork_repo`, `codebase_review`, `dependency_audit`, `improvement_loop`) require approval
- `council_approve` — all actions require approval

**Action dispatch flow:** action type → handler function → create/update session/work task/message → mark execution `completed` or `failed`.

**`validateScheduleFrequency()`** — For cron: computes two consecutive fire times, checks gap ≥ 5 minutes. For interval: direct comparison. Throws on violation.

## Configuration Values

| Constant | Value | Description |
|----------|-------|-------------|
| `POLL_INTERVAL_MS` | `30000` | Tick every 30 seconds |
| `MAX_CONCURRENT_EXECUTIONS` | `2` | Simultaneous action limit |
| `MAX_CONSECUTIVE_FAILURES` | `5` | Auto-pause threshold |
| `MIN_SCHEDULE_INTERVAL_MS` | `300000` | Minimum 5-minute interval |

## Related Resources

**DB tables:** `agent_schedules` (schedule config), `schedule_executions` (per-execution audit trail with config snapshot).

**Consumed by:** `server/index.ts` (lifecycle), `server/routes/schedules.ts` (all public methods), `server/process/manager.ts` (injected as scheduler context).

**Action types:** 16 defined types covering git operations, work tasks, councils, messaging, reputation, memory, code review, and custom prompts (see spec for full table).
