---
spec: connection.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/db.test.ts` | Integration | Singleton behavior, WAL/foreign-keys pragmas, `initDb` idempotency, `closeDb` reset |
| `server/__tests__/migrate.test.ts` | Integration | Migration idempotency, version tracking, `reconcileTables` safety net, `hasColumn` guard |
| `server/__tests__/purge-test-data.test.ts` | Integration | DB transaction isolation, cleanup helper behavior |

## Manual Testing

- [ ] Start server fresh (no db file): confirm db is created, migrations run to current `SCHEMA_VERSION`, WAL files appear
- [ ] Start server with existing db at older version: confirm only delta migrations apply
- [ ] Inspect `corvid-agent.db` file permissions: confirm `0o600` (not world-readable)
- [ ] Call `getDb()` from two places in the same process: confirm same object reference returned
- [ ] Corrupt a JSON column value in the DB directly; trigger a query that reads it: confirm warning logged and default returned, no crash

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `getDb()` called before file directory exists | SQLite throws on open; stack trace logged |
| `initDb()` called concurrently from multiple async contexts | Only one migration run; second await returns same result |
| `closeDb()` called then `getDb()` called again | New `Database` instance created; migrations re-run |
| `writeTransaction` encounters `SQLITE_BUSY` | Retries up to 3 times with exponential backoff; after max retries, throws |
| `writeTransaction` encounters non-busy SQLite error | Rolls back immediately; error re-thrown |
| `chmod` fails (e.g., Windows or read-only FS) | Silently caught; non-fatal; db still works |
| `safeJsonParse` receives `null` | Behavior depends on implementation; should return default without crash |
| `queryCount` SQL returns no rows | Returns 0 (not NaN or null) |
| Migration file missing from `MIGRATIONS` map | Silently skipped via `continue`; version gap is allowed |
| `hasColumn` called with table name containing SQL injection chars | `SAFE_SQL_IDENTIFIER` regex blocks it; throws or returns false |
