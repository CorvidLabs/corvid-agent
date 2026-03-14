---
module: daily-review-db
version: 1
status: draft
files:
  - server/db/daily-review.ts
db_tables:
  - schedule_executions
  - pr_outcomes
  - server_health_snapshots
depends_on: []
---

# Daily Review DB

## Purpose

Provides date-filtered aggregation queries for the daily review schedule action. Summarizes schedule execution outcomes, PR activity, and server health snapshots for a single day's retrospective report.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getExecutionStatsForDay` | `(db: Database, date: string)` | `ExecutionStats` | Aggregates schedule execution counts by status and action type for a given date (ISO date string, e.g. `2026-03-13`) |
| `getPrStatsForDay` | `(db: Database, date: string)` | `DailyPrStats` | Counts PRs opened, merged, and closed on the given date, plus repos that rejected PRs |
| `getHealthDeltaForDay` | `(db: Database, date: string)` | `HealthDelta` | Summarizes server health snapshots for the day: counts by status and computed uptime percentage |

### Exported Types

| Type | Description |
|------|-------------|
| `ExecutionStats` | `{ total: number; completed: number; failed: number; cancelled: number; byActionType: Record<string, number> }` |
| `DailyPrStats` | `{ opened: number; merged: number; closed: number; rejectedRepos: string[] }` |
| `HealthDelta` | `{ snapshotCount: number; healthyCount: number; degradedCount: number; unhealthyCount: number; uptimePercent: number }` |

## Invariants

1. **Date range**: All queries filter using `{date}T00:00:00.000Z` to `{date}T23:59:59.999Z` inclusive
2. **Uptime formula**: `uptimePercent = round(((healthy + degraded) / total) * 100, 2)` -- degraded counts as up
3. **Zero-snapshot default**: If no health snapshots exist for the day, `uptimePercent` defaults to `100`
4. **Rejected repos**: Only PRs with `pr_state = 'closed'` are counted as rejections; merged PRs are not

## Behavioral Examples

### Scenario: Day with mixed execution results

- **Given** 3 completed, 1 failed, and 1 cancelled execution on 2026-03-13
- **When** `getExecutionStatsForDay(db, '2026-03-13')` is called
- **Then** returns `{ total: 5, completed: 3, failed: 1, cancelled: 1, byActionType: { ... } }`

### Scenario: Day with no PR activity

- **Given** no rows in `pr_outcomes` with dates on 2026-03-13
- **When** `getPrStatsForDay(db, '2026-03-13')` is called
- **Then** returns `{ opened: 0, merged: 0, closed: 0, rejectedRepos: [] }`

### Scenario: Health uptime calculation

- **Given** 10 snapshots: 8 healthy, 1 degraded, 1 unhealthy
- **When** `getHealthDeltaForDay(db, '2026-03-13')` is called
- **Then** returns `uptimePercent: 90.0` (9 of 10 are healthy or degraded)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No schedule executions for the day | Returns `{ total: 0, completed: 0, failed: 0, cancelled: 0, byActionType: {} }` |
| No PR outcomes for the day | Returns `{ opened: 0, merged: 0, closed: 0, rejectedRepos: [] }` |
| No health snapshots for the day | Returns `{ snapshotCount: 0, ..., uptimePercent: 100 }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| Schedule actions (daily review) | All three exported functions for building the daily summary |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec |
