---
spec: health.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/health-service.test.ts` | Unit | `getHealthCheck` with mocked deps: all-healthy, database failure, shutdown state, individual dep failures; cache TTL behavior; `getLivenessCheck` and `getReadinessCheck` |
| `server/__tests__/health-monitor.test.ts` | Unit | `HealthMonitorService`: start/stop idempotency, alert threshold logic, recovery notification, snapshot persistence, prune timer |
| `server/__tests__/health-snapshots.test.ts` | Unit | DB snapshot insert and prune operations |
| `server/__tests__/routes-health.test.ts` | Route | `/health`, `/health/liveness`, `/health/readiness` HTTP endpoints |
| `server/__tests__/routes-health-handler.test.ts` | Route | Route handler error mapping and response shape |

## Manual Testing

- [ ] Call `GET /health` with all services running; verify `status: 'healthy'` in response
- [ ] Stop the database; call `GET /health`; verify `status: 'unhealthy'` with database dep marked `unhealthy`
- [ ] Unset `GH_TOKEN`; call `GET /health`; verify GitHub dep is `degraded` but overall can still be `healthy` if all other deps pass
- [ ] Call `GET /health/liveness`; verify `{ status: 'ok' }` always returns without error
- [ ] Trigger server shutdown; call `GET /health`; verify status is forced to `unhealthy`
- [ ] Call `GET /health` twice within 5 seconds; verify second call returns cached result (check latency)
- [ ] Call `resetHealthCache()` and then `GET /health`; verify a fresh check is performed
- [ ] Start `HealthMonitorService`; let 2 consecutive unhealthy checks accumulate; verify notification is sent
- [ ] Recover from unhealthy state; verify immediate recovery notification is sent on next healthy check
- [ ] Verify disk WAL check reports `free_mb` and `wal_mb` in the dependency health output

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| All dependencies healthy but `isShuttingDown()` returns true | Overall status forced to `unhealthy` |
| Database check throws (not just returns error) | Caught; database dep marked `unhealthy`; overall `unhealthy` |
| GitHub API times out after 5 seconds | GitHub dep marked `degraded`; overall becomes at least `degraded` |
| No LLM providers configured | LLM dep marked `degraded`; overall `degraded` unless database also fails |
| API key expired | `apiKey` dep marked `unhealthy`; overall `unhealthy` |
| API key expiring within warning window | `apiKey` dep marked `degraded` with days-remaining info |
| `HealthMonitorService.start()` called twice | Second call is no-op; only one set of timers active |
| `NotificationService` not injected | Alert silently skipped with warning log; health check flow unaffected |
| Notification send fails | Error logged; does not affect health check or snapshot persistence |
| Free disk < 100 MB | `diskWal` dep is `unhealthy`; overall is `unhealthy` |
| Free disk between 100 MB and 500 MB | `diskWal` dep is `degraded` |
| WAL file > 100 MB | `diskWal` dep is `degraded` |
| 1 consecutive unhealthy check (below alert threshold) | No notification sent; counter incremented |
| 2nd consecutive unhealthy check (at threshold) | Critical "SERVER DOWN" notification fired |