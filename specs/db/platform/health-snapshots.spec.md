---
module: health-snapshots
version: 1
status: draft
files:
  - server/db/health-snapshots.ts
db_tables:
  - server_health_snapshots
depends_on: []
---

# Health Snapshots

## Purpose
Provides database operations for recording, querying, and pruning server health check snapshots. Supports uptime statistics aggregation for monitoring dashboards.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `insertHealthSnapshot` | `db: Database, snapshot: { status: string; responseTimeMs?: number; dependencies?: Record<string, unknown>; source?: string }` | `HealthSnapshot` | Inserts a new health snapshot and returns the created record |
| `listHealthSnapshots` | `db: Database, opts?: { limit?: number; since?: string }` | `HealthSnapshot[]` | Lists snapshots ordered by timestamp descending, with optional limit (default 100) and since filter |
| `getUptimeStats` | `db: Database, since: string` | `UptimeStats` | Aggregates uptime statistics for all snapshots since the given ISO 8601 timestamp |
| `pruneHealthSnapshots` | `db: Database, olderThanDays: number` | `number` | Deletes snapshots older than the specified number of days; returns count of deleted rows |

### Exported Types
| Type | Description |
|------|-------------|
| `HealthSnapshot` | `{ id: number; timestamp: string; status: string; responseTimeMs: number \| null; dependencies: Record<string, unknown> \| null; source: string }` — A single health check record |
| `UptimeStats` | `{ totalChecks: number; healthyChecks: number; degradedChecks: number; unhealthyChecks: number; uptimePercent: number; periodStart: string; periodEnd: string }` — Aggregated uptime statistics for a time period |

## Invariants
1. The `dependencies` column is stored as a JSON string in the database and parsed to an object on read.
2. The `source` field defaults to `"internal"` when not provided on insert.
3. The `uptimePercent` calculation treats both `"healthy"` and `"degraded"` statuses as "up", only `"unhealthy"` counts as down.
4. `uptimePercent` is rounded to two decimal places (multiplied by 10000, rounded, divided by 100).
5. When no snapshots exist for a period, `uptimePercent` defaults to `100`.
6. When no snapshots exist, `periodStart` defaults to the `since` parameter and `periodEnd` defaults to the current ISO timestamp.
7. `listHealthSnapshots` defaults to a limit of 100 when not specified.
8. `pruneHealthSnapshots` calculates the cutoff using `Date.now()` minus the specified days in milliseconds.

## Behavioral Examples
### Scenario: Inserting a healthy snapshot
- **Given** an empty `server_health_snapshots` table
- **When** `insertHealthSnapshot(db, { status: "healthy", responseTimeMs: 42, source: "cron" })` is called
- **Then** a new row is inserted and the returned `HealthSnapshot` has `status = "healthy"`, `responseTimeMs = 42`, `source = "cron"`, and an auto-generated `id` and `timestamp`

### Scenario: Computing uptime with mixed statuses
- **Given** 8 healthy snapshots, 1 degraded snapshot, and 1 unhealthy snapshot since the target timestamp
- **When** `getUptimeStats(db, since)` is called
- **Then** `totalChecks = 10`, `healthyChecks = 8`, `degradedChecks = 1`, `unhealthyChecks = 1`, and `uptimePercent = 90.0`

### Scenario: Pruning old snapshots
- **Given** snapshots exist with timestamps spanning the last 60 days
- **When** `pruneHealthSnapshots(db, 30)` is called
- **Then** all snapshots older than 30 days are deleted and the count of deleted rows is returned

### Scenario: Listing with since filter
- **Given** snapshots exist across multiple days
- **When** `listHealthSnapshots(db, { since: "2026-03-01T00:00:00Z", limit: 50 })` is called
- **Then** only snapshots with `timestamp >= "2026-03-01T00:00:00Z"` are returned, up to 50, ordered newest first

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `listHealthSnapshots` with no matching rows | Returns empty array `[]` |
| `getUptimeStats` with no snapshots in the period | Returns `totalChecks = 0`, `uptimePercent = 100`, `periodStart` = `since`, `periodEnd` = current time |
| `pruneHealthSnapshots` with no old snapshots | Returns `0` |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all DB operations |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/health/monitor.ts` | `insertHealthSnapshot`, `pruneHealthSnapshots` for periodic health recording and cleanup |
| `server/index.ts` | `listHealthSnapshots`, `getUptimeStats` for health API endpoints |

## Database Tables
### server_health_snapshots
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing unique identifier |
| timestamp | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO 8601 timestamp of the health check |
| status | TEXT | NOT NULL | Health status: "healthy", "degraded", or "unhealthy" |
| response_time_ms | INTEGER | DEFAULT NULL | Response time in milliseconds, if measured |
| dependencies | TEXT | DEFAULT NULL | JSON-encoded map of dependency health states |
| source | TEXT | NOT NULL DEFAULT 'internal' | Origin of the health check (e.g., "internal", "cron") |

### Indexes
- `idx_server_health_snapshots_timestamp` on `timestamp`
- `idx_server_health_snapshots_status` on `status`

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
