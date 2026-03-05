---
module: usage
version: 1
status: draft
files:
  - server/usage/monitor.ts
db_tables:
  - schedule_executions
  - sessions
  - agent_schedules
depends_on:
  - specs/process/process-manager.spec.md
  - specs/notifications/service.spec.md
  - specs/lib/infra.spec.md
---

# Usage

## Purpose

Monitors scheduled session completions to backfill execution costs, detect long-running sessions, and alert on cost spikes. Provides anomaly detection for scheduled agent work by comparing execution costs against rolling averages and tracking session durations.

## Public API

### Exported Functions

_(none -- all functionality is exposed via the `UsageMonitor` class)_

### Exported Types

_(none)_

### Exported Classes

| Class | Description |
|-------|-------------|
| `UsageMonitor` | Watches scheduled session completions, backfills costs from linked sessions, detects long-running sessions (>30 min), and detects cost spikes (>2x rolling average). Sends alerts via the notification service. |

#### UsageMonitor Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, processManager: ProcessManager` | `UsageMonitor` | Creates a new UsageMonitor. The notification service is optional and set separately. |
| `setNotificationService` | `service: NotificationService` | `void` | Registers the notification service used for sending alerts. Must be called before alerts can be delivered. |
| `start` | _(none)_ | `void` | Starts monitoring: subscribes to all session events via `processManager.subscribeAll` and starts a periodic timer (every 5 minutes) to check for long-running scheduled sessions. |
| `stop` | _(none)_ | `void` | Stops monitoring: unsubscribes from session events and clears the periodic check timer. |
| `backfillCosts` | _(none)_ | `number` | Backfills `cost_usd` for all `schedule_executions` that have a linked `session_id` but `cost_usd = 0` and status is `completed` or `failed`. Returns the number of rows updated. Intended to be called once on startup and can be triggered manually. |

## Invariants

1. Cost backfill only updates `schedule_executions` where `cost_usd = 0` AND the linked session has `total_cost_usd > 0`, preventing overwrites of already-backfilled values.
2. Cost spike detection requires at least 3 past completed executions (`MIN_EXECUTIONS_FOR_SPIKE`) within the last 30 days before alerting, preventing false positives on new schedules.
3. Cost spike threshold is 2x the rolling average (`COST_SPIKE_MULTIPLIER`); executions at or below this ratio do not trigger alerts.
4. Long-running session threshold is 30 minutes (`LONG_RUNNING_THRESHOLD_SEC`); sessions shorter than this are never flagged.
5. Each alert (cost spike or long-running) is sent at most once per execution ID, tracked via an in-memory `alertedExecutions` set keyed by `spike:{executionId}` or `long:{executionId}`.
6. If no `NotificationService` is configured, alerts are silently skipped (logged at debug level only).
7. The rolling average for cost spikes excludes the current execution and only considers executions from the last 30 days with status `completed`.
8. Long-running checks poll every 5 minutes (`LONG_RUNNING_CHECK_INTERVAL_MS`) and only consider executions with status `running`.
9. Session events are only processed for `session_exited` and `session_stopped` event types; all other event types are ignored.

## Behavioral Examples

### Scenario: Session completes and cost is backfilled to execution
- **Given** a schedule_execution with `session_id = 'sess-1'` and `cost_usd = 0`
- **When** a `session_exited` event fires for `sess-1` and the session has `total_cost_usd = 0.15`
- **Then** the execution's `cost_usd` is updated to `0.15`

### Scenario: Cost spike detected on completion
- **Given** a schedule has 5 past completed executions averaging $0.10 each
- **When** the latest execution completes with `cost_usd = $0.25` (2.5x the average)
- **Then** a warning notification is sent with the title "Cost Spike Detected" including the ratio and average details

### Scenario: No cost spike when insufficient history
- **Given** a schedule has only 2 past completed executions
- **When** the latest execution completes with a high cost
- **Then** no cost spike alert is generated (minimum 3 executions required)

### Scenario: Long-running session detected
- **Given** a schedule_execution has been in `running` status for 35 minutes
- **When** the periodic long-running check fires
- **Then** a warning notification is sent with title "Long-Running Session" including the duration and session ID

### Scenario: Duplicate alerts are suppressed
- **Given** a cost spike alert was already sent for execution `exec-1`
- **When** the same execution triggers the spike check again
- **Then** no additional alert is sent

### Scenario: Startup backfill updates missing costs
- **Given** 3 schedule_executions have `cost_usd = 0` but their linked sessions have non-zero `total_cost_usd`
- **When** `backfillCosts()` is called on startup
- **Then** all 3 executions are updated and the method returns `3`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No `NotificationService` set when alert triggers | Alert is silently skipped; debug log emitted |
| Notification send fails | Error is caught and logged at warn level; does not propagate |
| Session event for a session with no linked schedule_execution | Event is ignored silently |
| Session has no cost data (`total_cost_usd` is null/zero) | No cost backfill or spike check is performed |
| Schedule not found when resolving schedule name for alert | Uses the `scheduleId` string as the name fallback |
| Schedule has no `agent_id` when sending alert | Alert is silently skipped (no notification sent) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `process` | `ProcessManager` for subscribing to session events (`subscribeAll`, `unsubscribeAll`) and `ClaudeStreamEvent` type |
| `notifications` | `NotificationService` for sending alert notifications (`notify`) |
| `lib` | `createLogger` from `server/lib/logger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `UsageMonitor` class -- instantiated with `db` and `processManager`, connected to notification service, started on boot, registered for shutdown |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
