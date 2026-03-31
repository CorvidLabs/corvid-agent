---
spec: connection.spec.md
---

## User Stories

- As an agent operator, I want the database to initialize automatically on first server start so that I do not need to run manual setup scripts
- As a platform administrator, I want database migrations to apply atomically so that a failed migration never leaves the schema in an inconsistent state
- As an agent developer, I want a connection pool with separate read and write connections so that concurrent read queries do not block writes
- As a platform administrator, I want automated backups with configurable retention so that I can recover from data loss without manual intervention
- As a platform administrator, I want an immutable audit log of sensitive operations so that I can investigate security incidents after the fact
- As a platform administrator, I want a data retention policy that automatically purges old session messages and logs so that the database does not grow unboundedly
- As an agent developer, I want safe JSON parsing utilities that never throw on corrupt data so that a single malformed row cannot crash a query path
- As a platform administrator, I want the ability to purge test data by pattern matching so that development artifacts do not pollute production analytics

## Acceptance Criteria

- `getDb()` returns a singleton Database instance; calling it multiple times returns the same object
- On first call, `getDb()` sets `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 5000`, and `PRAGMA foreign_keys = ON`
- `runMigrations(db)` applies all pending migrations from the current version up to `SCHEMA_VERSION` (currently 70) inside a single `db.transaction()` call
- If any migration SQL fails, the entire transaction rolls back and the schema version is unchanged
- `hasColumn()` checks prevent duplicate `ALTER TABLE ADD COLUMN` errors on re-run
- `initDb()` is idempotent: multiple concurrent calls resolve the same promise
- `closeDb()` resets both the Database singleton and the init promise to null, allowing clean re-initialization
- `getDbPool()` returns a pool with one write connection using `BEGIN IMMEDIATE` and configurable read connections with round-robin dispatch
- `writeTransaction()` retries on `SQLITE_BUSY` with exponential backoff (default 3 retries, 50ms base delay)
- `safeJsonParse()` returns the provided default value on parse failure and logs a structured warning with input preview
- `queryCount()` always returns a number (defaults to 0 when the query returns null)
- Database files (main, WAL, SHM) have permissions set to `0o600`; permission failures are non-fatal
- Audit log entries include timestamp, actor, action, and target fields and cannot be modified after insertion
- `purgeTestData()` matches names against patterns (`test`, `e2e`, `sample`, `dummy`, `lorem`) case-insensitively and deletes in FK-safe order: session_messages, sessions, council_launches, councils
- `purgeTestData()` supports dry-run mode that reports counts without deleting any rows

## Constraints

- SQLite only; no support for PostgreSQL or other RDBMS
- WAL journal mode is mandatory for concurrent read/write access
- Migrations are forward-only; no rollback or down-migration support
- All schema DDL must use `CREATE TABLE IF NOT EXISTS` and `hasColumn()` guards for idempotency
- File-based migrations (v53+) are discovered from the `server/db/migrations/` directory and run via `migrateUp()`
- The `agent_memories_fts` FTS5 virtual table must stay in sync via `AFTER INSERT/DELETE/UPDATE` triggers
- Database path defaults to `./corvid-agent.db` but is configurable via `DATABASE_PATH` environment variable
- Maximum busy timeout is 5 seconds; operations exceeding this will receive SQLITE_BUSY errors
- Schema currently defines 90+ tables across 21 domain files in `server/db/schema/`

## Out of Scope

- Multi-database replication or clustering
- Database schema rollback / down migrations
- Remote database connections (SQLite is local-file only)
- Row-level access control (handled by application-layer middleware)
- Automatic schema diffing or ORM-generated migrations
