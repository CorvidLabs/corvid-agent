---
module: retention
version: 1
status: draft
files:
  - server/db/retention.ts
db_tables: []
depends_on: []
---

# Retention

## Purpose

Implements retention policies for append-only tables, periodically pruning old records to prevent unbounded growth in SQLite. Designed to be called at server startup and on a daily interval.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `pruneTable` | `(db: Database, policy: RetentionPolicy)` | `number` | Delete records older than the retention period for a single table. Uses date-only format (`YYYY-MM-DD`) for policies with `timestampColumn = 'date'`, otherwise ISO 8601. Returns the number of deleted rows |
| `runRetentionCleanup` | `(db: Database)` | `void` | Run retention cleanup across all configured policies. Iterates over `RETENTION_POLICIES`, calling `pruneTable` for each. Catches and logs errors per table (e.g. if a table does not yet exist due to missing migration) |
| `RETENTION_POLICIES` | (constant) | `RetentionPolicy[]` | Exported array of default retention policies. Exported for testing purposes |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | `RetentionPolicy` interface is not exported (internal only) |

## Invariants

1. **Non-destructive on missing tables**: If a table referenced in a policy does not exist (migration not yet applied), the error is caught and logged at `debug` level; cleanup continues with remaining tables
2. **Date format awareness**: Policies with `timestampColumn = 'date'` use date-only cutoff format (`YYYY-MM-DD`); all others use full ISO 8601 timestamp
3. **Idempotent**: Safe to call `runRetentionCleanup` multiple times; re-running after a recent cleanup simply deletes zero rows
4. **No transaction wrapping**: Each table is pruned independently; a failure on one table does not roll back deletions from prior tables
5. **Logging**: Non-zero deletions are logged at `info` level per table and in aggregate; skipped tables are logged at `debug` level

## Default Retention Policies

| Table | Timestamp Column | Retention Days |
|-------|-----------------|----------------|
| `daily_spending` | `date` | 90 |
| `agent_daily_spending` | `date` | 90 |
| `credit_transactions` | `created_at` | 365 |
| `audit_log` | `timestamp` | 180 |
| `reputation_events` | `created_at` | 180 |

## Behavioral Examples

### Scenario: Prune records older than retention period
- **Given** `daily_spending` contains records from 120 days ago and 30 days ago
- **When** `runRetentionCleanup(db)` is called
- **Then** the 120-day-old record is deleted (exceeds 90-day policy) and the 30-day-old record is retained; the function logs `{ table: 'daily_spending', deleted: 1, retentionDays: 90 }`

### Scenario: No records to prune
- **Given** all records in all tables are within their retention windows
- **When** `runRetentionCleanup(db)` is called
- **Then** no rows are deleted and no per-table log messages are emitted

### Scenario: Table does not exist yet
- **Given** the `audit_log` table has not been created (migration not applied)
- **When** `runRetentionCleanup(db)` is called
- **Then** the error for `audit_log` is caught and logged at `debug` level; cleanup continues for remaining tables

### Scenario: Date-only vs ISO 8601 cutoff format
- **Given** a policy with `timestampColumn = 'date'` and `retentionDays = 90`
- **When** `pruneTable` computes the cutoff
- **Then** the cutoff is formatted as `YYYY-MM-DD` (not a full ISO 8601 timestamp), matching the column's storage format

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Table does not exist | Error is caught; logged at `debug` level; other tables still processed |
| Database is read-only | SQLite throws an error; not caught by the per-table handler since it is not a "table not found" scenario |
| Negative `retentionDays` | Would compute a future cutoff date, effectively deleting all records (no guard against this) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger` | `createLogger('Retention')` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `runRetentionCleanup` intended to be called at startup and on daily interval (wiring pending) |

## Database Tables

This module does not own any tables. It performs cleanup operations on tables owned by other modules:

- `daily_spending` (owned by spending/credits modules)
- `agent_daily_spending` (owned by spending/credits modules)
- `credit_transactions` (owned by credits module)
- `audit_log` (owned by audit module)
- `reputation_events` (owned by reputation module)

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
