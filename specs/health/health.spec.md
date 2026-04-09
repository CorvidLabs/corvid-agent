---
module: health
version: 1
status: draft
files:
  - server/health/monitor.ts
  - server/health/service.ts
  - server/health/types.ts
db_tables:
  - server_health_snapshots
depends_on:
  - specs/notifications/service.spec.md
  - specs/providers/provider-system.spec.md
  - specs/middleware/middleware-pipeline.spec.md
  - specs/db/connection.spec.md
  - specs/lib/infra/infra.spec.md
---

# Health

## Purpose

Provides system health checking (liveness, readiness, and deep dependency checks) with periodic self-monitoring, status-transition alerting, snapshot persistence, and result caching to prevent thundering-herd problems.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getHealthCheck` | `deps: HealthCheckDeps` | `Promise<HealthCheckResult>` | Runs a full health check across all dependencies (database, GitHub, Algorand, LLM providers, API key) with 5-second result caching. |
| `getLivenessCheck` | _(none)_ | `{ status: 'ok' }` | Simple liveness probe indicating the process is alive and responsive. |
| `getReadinessCheck` | `deps: HealthCheckDeps` | `{ status: 'ready' \| 'not_ready'; checks: Record<string, boolean> }` | Readiness probe checking database connectivity and shutdown state. |
| `resetHealthCache` | _(none)_ | `void` | Clears the cached health check result. Intended for testing. |

### Exported Types

| Type | Description |
|------|-------------|
| `HealthStatus` | Union type: `'healthy' \| 'degraded' \| 'unhealthy'`. |
| `DependencyHealth` | Per-dependency health result with `status`, optional `latency_ms`, optional `error`, and arbitrary extra fields via index signature. |
| `ShutdownInfo` | Shutdown state descriptor with `phase` (`'idle' \| 'shutting_down' \| 'completed' \| 'forced'`) and `registeredHandlers` count. |
| `HealthCheckResult` | Full health check response: `status`, `version`, `uptime` (seconds), ISO `timestamp`, `dependencies` map, and optional `shutdown` info. |
| `HealthCheckDeps` | Interface describing all dependencies needed to perform a health check: `db`, `startTime`, `version`, `getActiveSessions`, `isAlgoChatConnected`, `isShuttingDown`, `getSchedulerStats`, `getMentionPollingStats`, `getWorkflowStats`, and optional `getAuthConfig`. |

### Exported Classes

| Class | Description |
|-------|-------------|
| `HealthMonitorService` | Periodic self-check service that runs every 5 minutes, stores snapshots, and fires notifications on status transitions. |

#### HealthMonitorService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, healthDeps: HealthCheckDeps` | `HealthMonitorService` | Creates a new monitor bound to the given database and health-check dependencies. |
| `setNotificationService` | `service: NotificationService` | `void` | Injects the notification service used for health alerts. |
| `start` | _(none)_ | `void` | Starts the periodic check timer (5 min), prune timer (24 h), and schedules an initial check after 30 seconds. Idempotent. |
| `stop` | _(none)_ | `void` | Clears all timers and stops monitoring. |
| `check` | _(none)_ | `Promise<void>` | Executes a single health check, persists a snapshot, tracks consecutive failures, and triggers status-transition alerts. |

## Invariants

1. `getHealthCheck` results are cached for 5 seconds; repeated calls within the TTL return the cached result without re-checking dependencies.
2. If `isShuttingDown()` returns true, the overall status is forced to `'unhealthy'` regardless of dependency states.
3. Any single dependency with status `'unhealthy'` causes the overall status to be `'unhealthy'`. Any dependency `'degraded'` (with none unhealthy) causes overall `'degraded'`.
4. `HealthMonitorService` alerts on recovery (unhealthy to healthy/degraded) immediately, but delays alerting on degradation to unhealthy until `ALERT_THRESHOLD` (2) consecutive unhealthy checks have occurred.
5. Health snapshots older than 30 days are pruned daily.
6. `getLivenessCheck` and `getReadinessCheck` never throw; they always return a result.
7. `HealthMonitorService.start()` is idempotent; calling it when already running is a no-op.
8. Individual dependency check failures (GitHub, Algorand, LLM) result in `'degraded'` status, not `'unhealthy'`, except for the database which is critical.
9. The `diskWal` dependency check reports `free_mb` (free disk space) and `wal_mb` (SQLite WAL file size). Thresholds: `'unhealthy'` when free disk space is below 100 MB; `'degraded'` when free disk space is below 500 MB or WAL file size exceeds 100 MB.

## Behavioral Examples

### Scenario: All dependencies healthy
- **Given** the database responds, GitHub API returns 200, at least one LLM provider is available, and the server is not shutting down
- **When** `getHealthCheck` is called
- **Then** it returns `{ status: 'healthy', ... }` with all dependency statuses set to `'healthy'`

### Scenario: Database unreachable
- **Given** the database query `SELECT 1` throws an error
- **When** `getHealthCheck` is called
- **Then** the overall status is `'unhealthy'` because the database dependency is `'unhealthy'`

### Scenario: Server is shutting down
- **Given** `isShuttingDown()` returns true and all dependencies are healthy
- **When** `getHealthCheck` is called
- **Then** the overall status is forced to `'unhealthy'`

### Scenario: Consecutive unhealthy checks trigger alert
- **Given** the HealthMonitorService has been running and the system transitions from healthy to unhealthy
- **When** 2 consecutive health checks return `'unhealthy'`
- **Then** a critical notification is sent with the title "SERVER DOWN" and dependency details

### Scenario: Recovery notification
- **Given** the last recorded status was `'unhealthy'`
- **When** the next health check returns `'healthy'`
- **Then** an info-level notification is sent indicating recovery with "All systems operational"

## Error Cases

| Condition | Behavior |
|-----------|----------|
| GitHub API times out (>5s) | GitHub dependency marked `'degraded'` with error message; overall status becomes `'degraded'` at minimum. |
| No LLM providers configured or reachable | LLM dependency marked `'degraded'`; overall status becomes `'degraded'`. |
| `getHealthCheck` itself throws during monitor check | Snapshot saved as `'unhealthy'`; consecutive failure counter incremented; alert sent after threshold. |
| NotificationService not set on HealthMonitorService | Health alerts are silently skipped with a warning log. |
| Notification send fails | Error is logged but does not affect health check flow. |
| API key expired | `apiKey` dependency marked `'unhealthy'` with error "API key expired". |
| API key expiring soon | `apiKey` dependency marked `'degraded'` with warning and days remaining. |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `notifications` | `NotificationService` for sending health transition alerts. |
| `providers` | `hasClaudeAccess()` from `router` to check Anthropic API availability. |
| `middleware` | `AuthConfig`, `isApiKeyExpired`, `getApiKeyExpiryWarning` from `auth` for API key health checks. |
| `db` | `insertHealthSnapshot`, `pruneHealthSnapshots` from `health-snapshots` for persisting and pruning monitor data. |
| `lib` | `createLogger` for structured logging. |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Imports `getHealthCheck`, `getLivenessCheck`, `getReadinessCheck`, `HealthCheckDeps`, and `HealthMonitorService` for API routes and server startup. |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-06 | corvid-agent | Added diskWal dependency check reporting free disk space and WAL file size. |
