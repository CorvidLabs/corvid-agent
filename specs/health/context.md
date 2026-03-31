# Health — Context

## Why This Module Exists

A production system needs continuous health monitoring. The health module periodically checks system vitals (memory, CPU, disk, database, provider availability, middleware pipeline) and stores snapshots for trend analysis. When health degrades, it triggers notifications to operators.

## Architectural Role

Health is an **observability service** that runs on a timer, collecting and persisting health snapshots. It complements the CLI doctor (which checks pre-boot health) with runtime monitoring.

## Key Design Decisions

- **Snapshot-based**: Health data is stored as periodic snapshots rather than streaming metrics. This keeps storage bounded and makes trend analysis straightforward.
- **Provider health tracking**: Monitors LLM provider availability (API key validity, rate limits, error rates), which is critical since provider outages directly impact agent functionality.
- **Notification integration**: Health degradation triggers operator notifications through the notification service.

## Relationship to Other Modules

- **Performance**: Performance module collects similar metrics but focuses on system-level stats. Health is higher-level ("is the system working?").
- **Notifications**: Sends alerts when health degrades below thresholds.
- **Improvement**: Health data feeds into the improvement module's daily review.
- **Scheduler**: Health-aware scheduling gates or boosts tasks based on system health.
