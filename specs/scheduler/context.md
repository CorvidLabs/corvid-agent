# Scheduler — Context

## Why This Module Exists

Agents need to perform recurring tasks — daily reviews, periodic health checks, scheduled reports, polling external services. The scheduler provides cron-based task scheduling with health-aware execution (tasks can be gated or boosted based on system health).

## Architectural Role

Scheduler is a **time-based orchestration service** — it manages when tasks run, using cron expressions with preset aliases for common patterns.

## Key Design Decisions

- **Cron expressions with presets**: Supports standard cron syntax plus aliases like `@daily`, `@hourly` for common patterns.
- **Health-aware scheduling**: Priority rules can gate scheduled actions when the system is unhealthy (e.g., skip heavy analysis if memory is low) or boost them when healthy.
- **System state detection**: Detects current system state (healthy, degraded, critical) to inform scheduling decisions.
- **Human-readable descriptions**: Cron expressions are converted to human-readable strings for display in the dashboard.

## Relationship to Other Modules

- **Health**: Uses health data for scheduling decisions.
- **Process Manager**: Scheduled tasks create agent sessions.
- **Events**: Schedule executions emit events for real-time dashboard updates.
- **Usage**: Tracks schedule execution history.
