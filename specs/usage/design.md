---
spec: usage.spec.md
sources:
  - server/usage/monitor.ts
---

## Module Structure

`server/usage/` contains a single file:

- `monitor.ts` — `UsageMonitor` class: subscribes to session events, runs periodic long-running checks, and backfills execution costs on startup.

The module sits between the process manager (source of session lifecycle events) and the notification service (destination for alerts). It accesses the database directly for schedule_executions, sessions, and agent_schedules.

## Key Classes and Functions

### UsageMonitor

The central class. Constructed with `db` and `processManager`; the `NotificationService` is injected later via `setNotificationService` to avoid circular dependencies at startup.

**Session event handler** — registered via `processManager.subscribeAll`. Only reacts to `session_exited` and `session_stopped` events. On each matching event:
1. Looks up the schedule_execution linked to the session.
2. Backfills `cost_usd` from the session's `total_cost_usd` if the execution's cost is still 0.
3. Checks for a cost spike by computing a rolling 30-day average over the last N completed executions (requires at least `MIN_EXECUTIONS_FOR_SPIKE = 3`). If the current cost exceeds `COST_SPIKE_MULTIPLIER * avg` (2x), sends a warning notification once (guarded by `alertedExecutions`).

**Periodic timer** — runs every `LONG_RUNNING_CHECK_INTERVAL_MS` (5 minutes). Queries `schedule_executions` with status `running`. For each, computes elapsed time from `started_at`. If elapsed exceeds `LONG_RUNNING_THRESHOLD_SEC` (1800s / 30 minutes), sends a warning notification once per execution (guarded by `alertedExecutions`).

**`backfillCosts()`** — SQL UPDATE joining `schedule_executions` with `sessions` to copy `total_cost_usd` where `cost_usd = 0` and the session cost is non-zero. Returns row count. Called once at startup by `server/index.ts`.

## Configuration Values / Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_EXECUTIONS_FOR_SPIKE` | `3` | Minimum past completed executions before spike detection activates |
| `COST_SPIKE_MULTIPLIER` | `2` | Ratio threshold for cost spike (2x rolling average) |
| `LONG_RUNNING_THRESHOLD_SEC` | `1800` | Seconds (30 min) before a running session is flagged |
| `LONG_RUNNING_CHECK_INTERVAL_MS` | `300000` | Polling interval (5 min) for the long-running check timer |
| Rolling window | 30 days | Only past executions within 30 days count toward the average |

## Related Resources

**DB tables consumed:**
- `schedule_executions` — reads running/completed executions, updates `cost_usd`
- `sessions` — reads `total_cost_usd` for backfill and spike calculation
- `agent_schedules` — reads schedule name and `agent_id` for alert content

**In-memory state:**
- `alertedExecutions: Set<string>` — keyed `spike:{executionId}` or `long:{executionId}` to prevent duplicate alerts. Reset on `stop()`.

**External services:**
- `NotificationService` — delivers `warn`-level notifications to the agent's owner channel
