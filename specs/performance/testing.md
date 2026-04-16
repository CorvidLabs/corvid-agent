---
spec: performance.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/performance-collector.test.ts` | Unit | `collect()` persists 7 metric rows, `takeSnapshot()` returns correct fields, `recordSlowQuery()` threshold logic, `detectRegressions()` severity thresholds, `getTimeSeries()` day clamping, `start()` idempotency, pruning of old metrics |

## Manual Testing

- [ ] Start the server and confirm logs show "Performance collector started" with the configured interval
- [ ] Call `GET /api/performance/snapshot` and verify all 7 metric keys are present with plausible values
- [ ] Call `GET /api/performance/timeseries?metric=memory_rss&days=7` and confirm data points are returned
- [ ] Call `GET /api/performance/regressions` with default threshold and verify empty array when no regression exists
- [ ] Trigger a slow query (mock or inject) and confirm `GET /api/performance/slow-queries?since=today` returns it

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| DB file does not exist (new install) | `sizeBytes` is 0; no error thrown |
| DB is locked when measuring latency | Latency is recorded as the time taken to detect the lock; no exception propagates |
| `collect()` fails to INSERT (locked DB) | Snapshot still returned from `collect()`; error logged as warning |
| `recordSlowQuery()` called with duration exactly at threshold (100ms) | Not recorded (threshold is exclusive: must exceed, not equal) |
| `detectRegressions()` previous week has exactly 4 samples | Metric skipped; not reported as regression |
| `getTimeSeries()` called with `days=0` | Clamped to 1 day |
| `getTimeSeries()` called with `days=400` | Clamped to 365 days |
| `start()` called twice | Second call is a no-op; only one interval timer exists |
| Prune fires when no rows exceed retention | DELETE runs but removes 0 rows; no error |
