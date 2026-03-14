---
module: purge-test-data
version: 1
status: draft
files:
  - server/db/purge-test-data.ts
db_tables:
  - councils
  - council_launches
  - sessions
  - session_messages
depends_on: []
---

# Purge Test Data

## Purpose

Identifies and deletes test/sample data from the database by matching name fields against common test-data patterns (`test`, `e2e`, `sample`, `dummy`, `lorem`). Respects foreign key constraints by deleting in dependency order. Supports dry-run mode for previewing deletions.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `purgeTestData` | `(db: Database, options?: { dryRun?: boolean })` | `PurgeResult` | Finds and deletes test data matching pattern names. In dry-run mode, reports counts without deleting. Deletion runs inside a transaction |

### Exported Types

| Type | Description |
|------|-------------|
| `PurgeResult` | `{ councils: number; councilLaunches: number; sessions: number; sessionMessages: number; dryRun: boolean }` |

## Invariants

1. **Pattern matching**: Matches names starting with a pattern or containing the pattern after a space (case-insensitive via `lower()`). Patterns: `test`, `e2e`, `sample`, `dummy`, `lorem`
2. **FK-safe deletion order**: Deletes in order: session_messages -> sessions -> council_launches -> councils
3. **Transactional**: All deletions run inside a single `db.transaction()` (not in dry-run mode)
4. **Cascade awareness**: Council deletes cascade to `council_members`; council_launch deletes cascade to logs and discussion messages
5. **Session linkage**: Sessions linked to test councils via `council_launch_id` are also deleted, even if their name does not match test patterns
6. **Dry-run reporting**: In dry-run mode, logs matched items but returns zero for `councilLaunches` and `sessionMessages` (not computed)
7. **Logging**: All operations are logged via `createLogger('PurgeTestData')`

## Behavioral Examples

### Scenario: Purge test councils and linked sessions

- **Given** a council named `test-council` with 2 launches and 3 sessions linked via `council_launch_id`
- **When** `purgeTestData(db)` is called
- **Then** all session messages, sessions, council launches, and the council are deleted
- **And** returns `{ councils: 1, councilLaunches: 2, sessions: 3, sessionMessages: N, dryRun: false }`

### Scenario: Dry run previews without deleting

- **Given** 2 test councils and 5 test sessions exist
- **When** `purgeTestData(db, { dryRun: true })` is called
- **Then** returns `{ councils: 2, sessions: 5, councilLaunches: 0, sessionMessages: 0, dryRun: true }`
- **And** no rows are deleted

### Scenario: No test data found

- **Given** no names match test patterns
- **When** `purgeTestData(db)` is called
- **Then** returns all counts as 0

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No matching test data | Returns all counts as 0, no transaction executed |
| Transaction failure | Transaction rolls back; error propagates |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger` | `createLogger('PurgeTestData')` |
| `bun:sqlite` | `Database` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| Admin CLI / maintenance scripts | `purgeTestData` for database hygiene |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec |
