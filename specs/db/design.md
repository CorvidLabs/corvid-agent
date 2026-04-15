---
spec: connection.spec.md
sources:
  - server/db/connection.ts
  - server/db/pool.ts
  - server/db/types.ts
  - server/db/json-utils.ts
---

## Layout

Infrastructure module — no UI. Four files with distinct responsibilities:

```
server/db/
  connection.ts  — Singleton DB instance, WAL setup, migration orchestration
  pool.ts        — DbPool class, writeTransaction with SQLITE_BUSY retry
  types.ts       — Query utility functions (queryCount, queryExists) and shared types
  json-utils.ts  — safeJsonParse with structured warning logging
```

All higher-level `db/` modules depend on this module. Nothing here imports from domain modules.

## Components

### Singleton Connection (`connection.ts`)

`getDb()` creates and returns a single `Database` instance for the process lifetime. On first call:
1. Creates the SQLite file (or opens existing)
2. Sets `PRAGMA journal_mode = WAL`
3. Sets `PRAGMA busy_timeout = 5000`
4. Sets `PRAGMA foreign_keys = ON`
5. Runs legacy inline migrations (v1–52 via `runMigrations`)
6. Initializes credit config from env
7. Sets file permissions to `0o600`

`initDb()` runs file-based migrations (v53+) asynchronously. Uses a cached promise so multiple concurrent calls await the same work exactly once.

### Connection Pool (`pool.ts`)

`DbPool` provides:
- 1 write connection with `BEGIN IMMEDIATE` + SQLITE_BUSY retry (exponential backoff, configurable retries/delays)
- N read-only connections in round-robin rotation
- `write(fn)` and `read(fn)` transaction helpers
- `isSqliteBusy(err)` utility for error classification

`writeTransaction(db, fn, options)` wraps a function in a `BEGIN IMMEDIATE` transaction. On `SQLITE_BUSY`, retries with backoff (default: 3 retries, 50ms base delay). Rolls back on non-busy errors.

### Query Utilities (`types.ts`)

`queryCount` and `queryExists` are thin wrappers that run `SELECT COUNT(*) as cnt` queries and return numeric/boolean results. Used throughout `db/` modules to avoid boilerplate.

### Safe JSON (`json-utils.ts`)

`safeJsonParse<T>(json, defaultValue, context?)` — never throws. On parse failure, logs a structured warning (with input preview) and returns the caller's default value. Used whenever DB columns store JSON blobs.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| `PRAGMA journal_mode` | `WAL` | Write-ahead logging for concurrent reads |
| `PRAGMA busy_timeout` | `5000` ms | Wait time before SQLITE_BUSY errors |
| `PRAGMA foreign_keys` | `ON` | Enforce referential integrity |
| File permissions | `0o600` | Owner read/write only for db, WAL, and SHM files |
| Write retry default | 3 retries, 50ms base | `writeTransaction` retry configuration |

## Assets

| Resource | Description |
|----------|-------------|
| `corvid-agent.db` | Primary SQLite database file |
| `corvid-agent.db-wal` | WAL file (auto-created by SQLite) |
| `corvid-agent.db-shm` | Shared memory file (auto-created by SQLite) |
| `server/db/schema/` | Domain schema files consumed by `runMigrations` |
| `server/db/migrations/` | File-based migration scripts (v53+) consumed by `migrateUp` |
