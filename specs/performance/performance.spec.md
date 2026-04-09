---
module: performance
version: 1
status: draft
files:
  - server/performance/collector.ts
db_tables:
  - performance_metrics
depends_on:
  - specs/db/connection.spec.md
  - specs/lib/infra/infra.spec.md
---

# Performance

## Purpose

Periodically samples system performance metrics (memory usage, database health, disk usage, uptime) and persists snapshots to the `performance_metrics` database table for trend detection, regression analysis, and status reporting.

## Public API

### Exported Functions

(None -- all functionality is exposed through the `PerformanceCollector` class.)

### Exported Types

| Type | Description |
|------|-------------|
| `PerformanceSnapshot` | Point-in-time performance data: `timestamp` (ISO string), `memory` (heapUsed, heapTotal, rss, external in bytes), `db` (sizeBytes, latencyMs), and `uptime` (seconds). |
| `Regression` | Detected regression: `metric` name, `thisWeekAvg`, `lastWeekAvg`, `changePercent`, and `severity` (`'warning' \| 'critical'`). |
| `PerformanceReport` | Status report data: `snapshot` (PerformanceSnapshot), `regressions` (Regression[]), `slowQueriestoday` (count), and `metricsStoredTotal` (count). |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `SLOW_QUERY_THRESHOLD_MS` | `number` | Threshold in milliseconds above which a query is considered slow. Configurable via `SLOW_QUERY_THRESHOLD_MS` env var (default: 100). |

### Exported Classes

| Class | Description |
|-------|-------------|
| `PerformanceCollector` | Core class that manages periodic collection, persistence, querying, and regression detection of performance metrics. |

#### PerformanceCollector Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, dbPath?: string, startTime?: number` | `PerformanceCollector` | Create a collector instance. `dbPath` defaults to `'corvid-agent.db'`, `startTime` defaults to `Date.now()`. |
| `start` | (none) | `void` | Start periodic collection. Collects immediately, then at the configured interval. Idempotent -- subsequent calls are no-ops if already started. |
| `stop` | (none) | `void` | Stop periodic collection by clearing the interval timer. |
| `collect` | (none) | `Promise<PerformanceSnapshot>` | Take a single snapshot, persist it to the database, prune old metrics, and return the snapshot. |
| `takeSnapshot` | (none) | `PerformanceSnapshot` | Take a point-in-time snapshot of memory, DB stats, and uptime without persisting to the database. |
| `recordSlowQuery` | `operation: string, durationMs: number` | `void` | Record a slow query event if `durationMs` exceeds `SLOW_QUERY_THRESHOLD_MS`. Inserts a `db_slow_query` metric row. |
| `getLatestSnapshot` | (none) | `PerformanceSnapshot \| null` | Retrieve the most recent snapshot from the database. Returns null if no metrics exist. |
| `getTimeSeries` | `metric: string, days?: number` | `{ timestamp: string; value: number }[]` | Get time-series data for a specific metric over a date range (default: 7 days, clamped to 1-365). |
| `getMetricNames` | (none) | `string[]` | Get all distinct metric names stored in the `performance_metrics` table, sorted alphabetically. |
| `detectRegressions` | `thresholdPercent?: number` | `Regression[]` | Compare this week's average vs last week's for key metrics. Returns metrics where the current week is worse by more than `thresholdPercent` (default: 25%). |
| `getStatusReportSection` | (none) | `PerformanceReport` | Get a comprehensive performance summary with current snapshot, regressions, today's slow query count, and total stored metrics count. |

## Invariants

1. `start()` is idempotent -- calling it multiple times does not create multiple timers.
2. Collection interval defaults to 5 minutes, configurable via `PERF_COLLECT_INTERVAL_MS` environment variable.
3. Metric retention defaults to 90 days, configurable via `PERF_RETENTION_DAYS` environment variable.
4. Slow query threshold defaults to 100ms, configurable via `SLOW_QUERY_THRESHOLD_MS` environment variable.
5. Every `collect()` call persists exactly 7 metric rows in a single transaction: `memory_heap_used`, `memory_heap_total`, `memory_rss`, `memory_external`, `db_size`, `db_latency`, `uptime`.
6. Old metrics beyond the retention period are pruned on every `collect()` call.
7. `recordSlowQuery()` silently drops queries below the threshold -- it does not record them.
8. All persistence and pruning errors are caught and logged as warnings; they never propagate to callers.
9. `detectRegressions()` only reports a regression if the previous week has at least 5 samples.
10. Regressions with >50% change are classified as `'critical'`; those between the threshold and 50% are `'warning'`.
11. `getTimeSeries()` clamps the `days` parameter to the range [1, 365].
12. DB latency is measured by executing `SELECT 1` and timing the result.

## Behavioral Examples

### Scenario: Starting the collector
- **Given** a `PerformanceCollector` is constructed with a valid database
- **When** `start()` is called
- **Then** an immediate snapshot is collected and persisted, a periodic timer is set at the configured interval, and an info log is emitted.

### Scenario: Taking a snapshot
- **Given** the server has been running for 120 seconds with heap usage of 50MB
- **When** `takeSnapshot()` is called
- **Then** a `PerformanceSnapshot` is returned with `uptime: 120`, `memory.heapUsed` reflecting actual process memory, and `db.sizeBytes` reflecting the database file size on disk.

### Scenario: Recording a slow query
- **Given** `SLOW_QUERY_THRESHOLD_MS` is 100
- **When** `recordSlowQuery('SELECT * FROM sessions', 250)` is called
- **Then** a row is inserted into `performance_metrics` with metric `'db_slow_query'`, labels `'SELECT * FROM sessions'`, value `250`, and unit `'ms'`.

### Scenario: Recording a fast query (below threshold)
- **Given** `SLOW_QUERY_THRESHOLD_MS` is 100
- **When** `recordSlowQuery('SELECT 1', 5)` is called
- **Then** nothing is recorded -- the call returns immediately without a database insert.

### Scenario: Detecting a memory regression
- **Given** last week's average `memory_rss` was 100MB (with 10+ samples) and this week's average is 150MB
- **When** `detectRegressions(25)` is called
- **Then** a `Regression` is returned with `metric: 'memory_rss'`, `changePercent: 50`, and `severity: 'warning'`.

### Scenario: Pruning old metrics
- **Given** `PERF_RETENTION_DAYS` is 90 and there are metrics older than 90 days
- **When** `collect()` is called
- **Then** metrics older than 90 days are deleted and the count of deleted rows is logged.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Database file does not exist when measuring size | `sizeBytes` is reported as 0. |
| Database is locked when measuring latency | Latency measurement catches the error; measurement completes with the time taken. |
| Snapshot persistence fails (e.g., DB locked) | Error is caught and logged as a warning. The snapshot is still returned from `collect()`. |
| Metric pruning fails | Error is caught silently. |
| `recordSlowQuery()` DB insert fails | Error is caught silently; caller is not affected. |
| Initial collection on `start()` fails | Error is caught and logged as a warning; the periodic timer is still set. |
| `getLatestSnapshot()` finds no metrics in DB | Returns null. |
| `detectRegressions()` has fewer than 5 samples for previous week | That metric is skipped (not reported as a regression). |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for database access |
| `node:fs` | `statSync` for measuring database file size |
| lib (logger) | `createLogger('PerfCollector')` for logging |
| db (types) | `queryCount` utility for count queries |

### Consumed By

| Module | What is used |
|--------|-------------|
| server/index.ts | `PerformanceCollector` class instantiation and lifecycle management |
| server/routes/performance.ts | `PerformanceCollector` type for route handler dependency injection |
| server/routes/index.ts | `PerformanceCollector` type for route registration |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
