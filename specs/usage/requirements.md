---
spec: usage.spec.md
---

## User Stories

- As an agent operator, I want execution costs automatically backfilled from completed sessions so that schedule_executions always reflect actual spending.
- As an agent operator, I want to be alerted when a scheduled execution costs more than 2x the rolling average so that I can investigate unexpected cost spikes promptly.
- As an agent operator, I want to be alerted when a scheduled session runs longer than 30 minutes so that I can detect stuck or runaway processes.
- As a platform administrator, I want duplicate alerts suppressed per execution ID so that operators are not overwhelmed by repeated notifications for the same event.

## Acceptance Criteria

- `UsageMonitor.start` subscribes to all session events via `processManager.subscribeAll` and starts a periodic long-running check timer every 5 minutes.
- `UsageMonitor.stop` unsubscribes from session events and clears the periodic check timer.
- `backfillCosts` updates `schedule_executions` where `cost_usd = 0` and the linked session has `total_cost_usd > 0`; it never overwrites already-backfilled values.
- Cost spike detection requires at least 3 past completed executions (`MIN_EXECUTIONS_FOR_SPIKE`) within the last 30 days before alerting.
- Cost spike threshold is 2x the rolling average (`COST_SPIKE_MULTIPLIER`); the rolling average excludes the current execution and only considers `completed` executions from the last 30 days.
- Long-running session detection flags executions with status `running` that have been active for more than 30 minutes (`LONG_RUNNING_THRESHOLD_SEC`).
- Each alert (cost spike or long-running) is sent at most once per execution ID, tracked via an in-memory `alertedExecutions` set keyed by `spike:{executionId}` or `long:{executionId}`.
- If no `NotificationService` is configured, alerts are silently skipped with a debug-level log.
- Session events are only processed for `session_exited` and `session_stopped` event types; all other event types are ignored.
- Notification send failures are caught and logged at warn level; they never propagate to callers.
- When the schedule has no `agent_id`, the alert is silently skipped.

## Constraints

- The alert deduplication set is in-memory and resets on process restart; this is acceptable because cost data is persisted in the database.
- The monitor depends on `ProcessManager` for session event subscriptions and `NotificationService` for sending alerts; both are optional at construction time.
- Long-running checks poll every 5 minutes; sub-minute detection granularity is not supported.
- The rolling average for cost spikes only considers the last 30 days of completed executions.

## Out of Scope

- Per-tenant usage dashboards or historical usage visualization (handled by the billing module).
- Credit balance tracking or credit deduction (handled by `server/db/credits`).
- Usage-based rate limiting or throttling of agent sessions.
- Real-time cost streaming during active sessions.
- Alerting on non-scheduled sessions (only schedule_executions are monitored).
