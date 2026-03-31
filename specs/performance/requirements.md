---
spec: performance.spec.md
---

## User Stories

- As a platform administrator, I want periodic performance snapshots (memory, DB health, disk, uptime) persisted to the database so that I can track system health trends over time.
- As a platform administrator, I want automatic regression detection that compares this week's metrics against last week's so that I am alerted to performance degradation before it becomes critical.
- As an agent developer, I want slow query recording so that database performance bottlenecks are captured and can be investigated.
- As an agent operator, I want a performance status report combining the latest snapshot, regressions, and slow query count so that I get a single view of system health.
- As a platform administrator, I want time-series queries for any metric over a configurable date range so that I can build dashboards and analyze trends.

## Acceptance Criteria

- `PerformanceCollector.start` is idempotent; calling it multiple times does not create multiple timers.
- `collect` persists exactly 7 metric rows per snapshot in a single transaction: `memory_heap_used`, `memory_heap_total`, `memory_rss`, `memory_external`, `db_size`, `db_latency`, `uptime`.
- `collect` prunes metrics older than the retention period (default 90 days, configurable via `PERF_RETENTION_DAYS`) on every call.
- Collection interval defaults to 5 minutes, configurable via `PERF_COLLECT_INTERVAL_MS` environment variable.
- `recordSlowQuery` inserts a `db_slow_query` metric row only when `durationMs` exceeds `SLOW_QUERY_THRESHOLD_MS` (default 100, configurable via env var); queries below the threshold are silently dropped.
- `getTimeSeries` returns timestamped values for a specific metric name, clamped to a [1, 365] day range (default 7 days).
- `getMetricNames` returns all distinct metric names stored in `performance_metrics`, sorted alphabetically.
- `detectRegressions` compares this week's average against last week's for key metrics; only reports regressions when the previous week has at least 5 samples.
- Regressions with >50% change are classified as `critical`; those between the threshold (default 25%) and 50% are `warning`.
- `getStatusReportSection` returns a `PerformanceReport` containing the current snapshot, detected regressions, today's slow query count, and total stored metrics count.
- DB latency is measured by executing `SELECT 1` and timing the result.
- All persistence, pruning, and recording errors are caught and logged as warnings; they never propagate to callers.
- `getLatestSnapshot` returns `null` when no metrics exist in the database.

## Constraints

- Metric retention defaults to 90 days; configurable via `PERF_RETENTION_DAYS` environment variable.
- Slow query threshold defaults to 100ms; configurable via `SLOW_QUERY_THRESHOLD_MS` environment variable.
- Collection interval defaults to 5 minutes; configurable via `PERF_COLLECT_INTERVAL_MS` environment variable.
- DB file size is measured via `statSync` on the database file path; if the file does not exist, size is reported as 0.
- The collector uses `process.memoryUsage()` for memory metrics, which reflects the Bun runtime's memory state.

## Out of Scope

- Application Performance Monitoring (APM) integration (Datadog, New Relic, etc.).
- Per-request latency tracking or distributed tracing.
- CPU utilization or load average metrics.
- Network I/O or throughput metrics.
- Alerting on performance regressions (alerting is handled by the health module's notification integration).
- Custom metric registration by plugins or external modules.
