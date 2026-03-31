# Usage — Context

## Why This Module Exists

Operators need visibility into how much agents are being used — session counts, schedule executions, resource consumption. The usage monitor tracks these metrics and alerts operators when usage approaches limits or exhibits unusual patterns.

## Architectural Role

Usage is a **monitoring and alerting service** — it watches usage patterns and notifies operators of anomalies or approaching limits.

## Key Design Decisions

- **Schedule execution tracking**: Tracks which schedules have run and their outcomes.
- **Session monitoring**: Monitors active and historical session counts.
- **Alert integration**: Unusual usage patterns trigger notifications to operators.

## Relationship to Other Modules

- **Scheduler**: Tracks schedule execution history.
- **Process Manager**: Monitors session counts and durations.
- **Notifications**: Sends usage alerts.
- **DB**: Reads from `schedule_executions`, `sessions`, `agent_schedules` tables.
