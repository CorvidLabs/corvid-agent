---
spec: performance.spec.md
sources:
  - server/performance/collector.ts
---

## Module Structure

Single-file module: `server/performance/collector.ts`. Exports `PerformanceCollector` class plus `PerformanceSnapshot`, `Regression`, `PerformanceReport` types and `SLOW_QUERY_THRESHOLD_MS` constant. No sub-modules.

## Key Classes and Functions

**`PerformanceCollector`** — Core service class. Holds references to the SQLite `Database`, the `dbPath` string (for `statSync`), and `startTime` (epoch ms for uptime calculation). Manages a single `setInterval` handle; `start()` guards against double-start via a flag.

- `collect()` — atomic sequence: `takeSnapshot()` → `INSERT` 7 rows in a transaction → prune rows older than retention window → return snapshot. All DB errors are caught and logged; the snapshot is returned regardless.
- `takeSnapshot()` — reads `process.memoryUsage()`, `statSync(dbPath).size` (0 on ENOENT), and times `SELECT 1` for DB latency.
- `detectRegressions()` — queries avg values per metric for two 7-day windows, then compares. Skips metrics with fewer than 5 samples in the previous window. Classifies: >50% change = `'critical'`, threshold–50% = `'warning'`.
- `recordSlowQuery()` — single INSERT for `db_slow_query` metric; silently drops if duration < threshold.

## Configuration Values

| Env Var | Default | Usage |
|---------|---------|-------|
| `PERF_COLLECT_INTERVAL_MS` | `300000` (5 min) | Timer interval for periodic collection |
| `PERF_RETENTION_DAYS` | `90` | Days to keep metrics before pruning |
| `SLOW_QUERY_THRESHOLD_MS` | `100` | ms above which a query is recorded |

## Related Resources

**DB table:** `performance_metrics` — columns: `id`, `metric`, `value`, `unit`, `labels`, `recorded_at`. Indexed on `metric` and `recorded_at` for time-series queries.

**Consumed by:**
- `server/index.ts` — instantiates and starts the collector at server boot
- `server/routes/performance.ts` — exposes `getLatestSnapshot`, `getTimeSeries`, `getMetricNames`, `detectRegressions`, `getStatusReportSection` via REST
- `server/routes/index.ts` — injects `PerformanceCollector` into route handler context
