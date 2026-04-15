---
spec: health.spec.md
sources:
  - server/health/monitor.ts
  - server/health/service.ts
  - server/health/types.ts
---

## Layout

Module under `server/health/`:
- `types.ts` — type definitions (`HealthStatus`, `DependencyHealth`, `HealthCheckResult`, `HealthCheckDeps`, `ShutdownInfo`)
- `service.ts` — `getHealthCheck`, `getLivenessCheck`, `getReadinessCheck`, `resetHealthCache`
- `monitor.ts` — `HealthMonitorService` class for periodic self-checks and alerting

## Components

### service.ts (stateless check functions)

**`getHealthCheck(deps)`** — runs all dependency checks and returns a `HealthCheckResult`:
- Database: `SELECT 1` connectivity check (failure → `unhealthy`)
- GitHub: HTTP call to `api.github.com` with 5s timeout (failure → `degraded`)
- Algorand: checks `isAlgoChatConnected()` (failure → `degraded`)
- LLM providers: calls `hasClaudeAccess()` (failure → `degraded`)
- API key: checks expiry via `isApiKeyExpired` / `getApiKeyExpiryWarning` (expired → `unhealthy`, expiring → `degraded`)
- diskWal: checks free disk space and SQLite WAL file size (< 100 MB free → `unhealthy`; < 500 MB or WAL > 100 MB → `degraded`)
- Shutdown state: if `isShuttingDown()` returns true, overall status forced to `unhealthy`

Results are cached for 5 seconds. Overall status: any `unhealthy` dep → `unhealthy`; any `degraded` (no `unhealthy`) → `degraded`; all healthy → `healthy`.

**`getLivenessCheck()`** — always returns `{ status: 'ok' }`; never throws.

**`getReadinessCheck(deps)`** — checks only database and shutdown state; returns `ready` or `not_ready`.

### HealthMonitorService (monitor.ts)
Periodic monitor with three timers:
1. Health check timer — every 5 minutes, calls `getHealthCheck`, saves snapshot to DB
2. Prune timer — daily, removes snapshots older than 30 days
3. Initial check — fires 30 seconds after `start()` is called

**Alert logic:**
- Status transitions from any level to `unhealthy` → alert only after `ALERT_THRESHOLD` (2) consecutive unhealthy checks
- Recovery (unhealthy → healthy/degraded) → immediate info alert "All systems operational"
- Notification sent via injected `NotificationService`; missing service → silent warning log

`start()` is idempotent. `stop()` clears all timers.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Health cache TTL | 5 seconds | `getHealthCheck` result caching |
| Monitor interval | 5 minutes | Periodic health check frequency |
| Prune interval | 24 hours | Snapshot pruning frequency |
| Initial check delay | 30 seconds | Delay after `start()` before first check |
| Snapshot retention | 30 days | Snapshots older than this are pruned |
| Alert threshold | 2 consecutive checks | Required before alerting on degradation to unhealthy |
| Disk free unhealthy threshold | 100 MB | Below this → diskWal dependency `unhealthy` |
| Disk free degraded threshold | 500 MB | Below this (but above 100 MB) → `degraded` |
| WAL degraded threshold | 100 MB | WAL file size above this → `degraded` |

## Assets

**DB table:**
- `server_health_snapshots` — stores periodic health check results with status and timestamps

**External services checked:**
- `api.github.com` — HTTP liveness check for GitHub dependency
- Algorand node — checked via `isAlgoChatConnected()`
- LLM provider — checked via `hasClaudeAccess()`
