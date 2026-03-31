---
spec: health.spec.md
---

## User Stories

- As a platform administrator, I want liveness, readiness, and deep health check endpoints so that load balancers and monitoring systems can assess server availability.
- As an agent operator, I want automatic health monitoring every 5 minutes with notifications on status transitions so that I am alerted when the system goes down or recovers.
- As a platform administrator, I want health check results cached for 5 seconds so that concurrent requests do not cause a thundering-herd of dependency checks.
- As an agent operator, I want disk space and WAL file size monitoring so that I am warned before the database runs out of space.
- As an agent operator, I want API key expiry checked as part of the health check so that I know when my credentials need renewal.

## Acceptance Criteria

- `getHealthCheck` returns a `HealthCheckResult` with overall `status`, `version`, `uptime`, ISO `timestamp`, and per-dependency health map.
- `getHealthCheck` results are cached for 5 seconds; repeated calls within the TTL return the cached result without re-running dependency checks.
- If `isShuttingDown()` returns `true`, the overall status is forced to `unhealthy` regardless of dependency states.
- Any single dependency with status `unhealthy` causes the overall status to be `unhealthy`; any `degraded` dependency (with none unhealthy) causes overall `degraded`.
- Database dependency is critical: if `SELECT 1` throws, the database is marked `unhealthy`.
- GitHub, Algorand, and LLM provider check failures result in `degraded` status, not `unhealthy`.
- The `diskWal` dependency reports `free_mb` and `wal_mb`; `unhealthy` when free disk < 100 MB, `degraded` when free disk < 500 MB or WAL > 100 MB.
- API key expiry: `unhealthy` when expired, `degraded` when expiring soon (with days remaining in the warning).
- `getLivenessCheck` always returns `{ status: 'ok' }` and never throws.
- `getReadinessCheck` checks database connectivity and shutdown state; returns `ready` or `not_ready` with a checks map.
- `HealthMonitorService.start` is idempotent; calling it when already running is a no-op.
- `HealthMonitorService` delays alerting on degradation to `unhealthy` until `ALERT_THRESHOLD` (2) consecutive unhealthy checks have occurred.
- `HealthMonitorService` alerts on recovery (unhealthy -> healthy/degraded) immediately with an info-level "All systems operational" notification.
- Health snapshots older than 30 days are pruned daily by the monitor service.
- When `NotificationService` is not set, health alerts are silently skipped with a warning log.

## Constraints

- Health check caching TTL is fixed at 5 seconds; it is not configurable.
- The health monitor check interval is fixed at 5 minutes; the prune interval is fixed at 24 hours.
- An initial health check is scheduled 30 seconds after `start()` to allow dependencies to initialize.
- Health snapshots are stored in the `server_health_snapshots` table with a 30-day retention period.
- All health check functions are designed to never throw; errors are caught and reflected in the health status.

## Out of Scope

- External uptime monitoring or status page integration.
- Health check authentication or access control (endpoints are public).
- Custom health check plugins or user-defined dependency checks.
- Historical health trend visualization or charting (data is stored; visualization is external).
- Automatic remediation actions on health status changes (only notifications are sent).
- Distributed health checks across multiple corvid-agent instances.
