---
module: connection
version: 1
status: draft
files:
  - server/db/connection.ts
  - server/db/types.ts
  - server/db/json-utils.ts
db_tables: []
depends_on: []
---

# Connection

## Purpose
Provides the singleton SQLite database connection, shared query utility types/functions, and safe JSON parsing for database values. This is the foundational infrastructure module that all other `db/` modules depend on.

## Public API

### Exported Functions

#### From `server/db/connection.ts`
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getDb` | `path?: string` | `Database` | Returns the singleton database connection, creating and initializing it on first call. Sets WAL journal mode, 5s busy timeout, enables foreign keys, runs legacy migrations (v1-52), and initializes credit config from env. `path` defaults to `'corvid-agent.db'`. |
| `initDb` | _(none)_ | `Promise<void>` | Runs any pending file-based migrations (v53+) beyond the legacy schema version. Safe to call multiple times; only runs once via a cached promise. Must be called after `getDb()`. |
| `getDbPool` | `options?: { maxReadConnections?: number }` | `DbPool` | Returns or creates a connection pool for the current database. The pool provides separate read and write connections with BEGIN IMMEDIATE transactions and SQLITE_BUSY retry logic. Falls back to a minimal single-connection pool for in-memory databases. |
| `dbWriteTransaction` | `fn: (db: Database) => T, options?: WriteTransactionOptions` | `T` | Executes `fn` inside a BEGIN IMMEDIATE write transaction with SQLITE_BUSY retry on the singleton database connection. Delegates to `writeTransaction` from `db/pool`. |
| `closeDb` | _(none)_ | `void` | Closes the database connection, the connection pool, and resets the singleton and init promise to `null`. |

#### From `server/db/types.ts`
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `queryCount` | `db: Database, sql: string, ...params: SQLQueryBindings[]` | `number` | Executes a `SELECT COUNT(*) as cnt` query and returns the numeric count (0 if no row) |
| `queryExists` | `db: Database, sql: string, ...params: SQLQueryBindings[]` | `boolean` | Returns `true` when the count query yields > 0 rows; convenience wrapper around `queryCount` |

#### From `server/db/json-utils.ts`
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `safeJsonParse` | `json: string, defaultValue: T, context?: string` | `T` | Generic function. Safely parses a JSON string, returning `defaultValue` on failure. Logs a structured warning with a preview of the failed input. |

### Exported Types

#### From `server/db/types.ts`
| Type | Description |
|------|-------------|
| `CountRow` | `{ cnt: number }` — row shape returned by `SELECT COUNT(*) as cnt` queries |
| `PaginatedResult` | `{ items: T[]; total: number }` — generic paginated result wrapper |
| `IdRow` | `{ id: string }` — row with a string `id` column |
| `NumericIdRow` | `{ id: number }` — row with a numeric `id` column |

## Invariants
1. `getDb` is a singleton: only one `Database` instance is ever created. Subsequent calls return the same instance.
2. On first call, `getDb` always sets `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 5000`, and `PRAGMA foreign_keys = ON` before running any migrations.
3. `getDb` runs legacy inline migrations synchronously (via `runMigrations`) so the returned `Database` is immediately usable for v1-52 schema.
4. `initDb` is idempotent: the init promise is cached so multiple calls await the same work.
5. `closeDb` fully resets state: both the `Database` reference and the `_initPromise` are set to `null`, allowing a fresh initialization on next `getDb()` call.
6. Database file permissions are set to `0o600` (owner read/write only) for the main file, WAL file, and SHM file. Failure is non-fatal (for cross-platform compatibility).
7. `queryCount` always returns a number (defaults to 0 if the query returns null).
8. `safeJsonParse` never throws; on parse failure it logs a warning and returns the provided default value.

## Behavioral Examples
### Scenario: First database initialization
- **Given** no database connection exists
- **When** `getDb()` is called
- **Then** a new SQLite database is created with WAL mode, busy timeout, and foreign keys enabled; legacy migrations run synchronously; credit config is initialized from env; file permissions are set to 0o600

### Scenario: Subsequent getDb calls
- **Given** `getDb()` has already been called
- **When** `getDb()` is called again
- **Then** the same `Database` instance is returned without re-initialization

### Scenario: Running file-based migrations
- **Given** `getDb()` has been called and there are pending file-based migrations at v53+
- **When** `await initDb()` is called
- **Then** pending migrations are discovered and applied; a log message reports the count and new version

### Scenario: Safe JSON parse with corrupted data
- **Given** a database column contains `"{invalid json"`
- **When** `safeJsonParse("{invalid json", [], "agent-config")` is called
- **Then** a warning is logged with context `"agent-config"` and a preview of the input, and `[]` is returned

### Scenario: Counting rows with queryCount
- **Given** a table `agents` with 5 rows
- **When** `queryCount(db, 'SELECT COUNT(*) as cnt FROM agents')` is called
- **Then** it returns `5`

## Error Cases
| Condition | Behavior |
|-----------|----------|
| Database file cannot be created | `new Database()` throws a SQLite error |
| `chmod` fails (e.g., on Windows) | Silently caught; non-fatal |
| `safeJsonParse` receives invalid JSON | Returns `defaultValue`; logs a warning |
| `queryCount` query returns no rows | Returns `0` |
| `initDb` called before `getDb` | `getDb()` is called internally, so initialization happens |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` class and `SQLQueryBindings` type |
| `node:fs` | `chmodSync`, `existsSync` for file permission management |
| `db/schema` | `runMigrations` for legacy inline migrations (v1-52) |
| `db/migrate` | `migrateUp`, `getCurrentVersion`, `discoverMigrations` for file-based migrations (v53+) |
| `db/credits` | `initCreditConfigFromEnv` for initializing credit configuration |
| `db/pool` | `DbPool`, `writeTransaction`, `WriteTransactionOptions` for connection pooling and write transaction handling |
| `lib/logger` | `createLogger('JsonUtils')` for structured warning logs (json-utils.ts) |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/index.ts` | `getDb()`, `initDb()` for application startup |
| `server/middleware/auth.ts` | `getDb()` for authentication checks |
| `server/db/allowlist.ts` | `queryCount` from types.ts |
| `server/db/audit.ts` | `queryCount` from types.ts |
| `server/db/schedules.ts` | `queryCount`, `PaginatedResult`, utility types from types.ts |
| `server/db/algochat-messages.ts` | `queryCount`, utility types from types.ts |
| `server/db/github-allowlist.ts` | `queryCount` from types.ts |
| `server/db/agent-memories.ts` | `queryCount`, utility types from types.ts |
| `server/db/agent-messages.ts` | `queryCount`, utility types from types.ts |

## Database Tables
This module does not define database tables. It is infrastructure that provides the database connection and utility functions used by all other `db/` modules.

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
