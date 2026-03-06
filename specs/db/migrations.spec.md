---
module: migrations
version: 1
status: draft
files:
  - server/db/migrate.ts
  - server/db/migrate-cli.ts
  - server/db/migrate-create.ts
db_tables:
  - schema_version
depends_on: []
---

# Migrations

## Purpose

File-based database migration system for managing SQLite schema evolution. Migrations are TypeScript files in `server/db/migrations/` with `up`/`down` exports. The `schema_version` table tracks the current version. Includes a CLI for manual migration management and a helper script for scaffolding new migration files.

## Public API

### Exported Functions (migrate.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `discoverMigrations` | `(dir?: string)` | `MigrationEntry[]` | Scans the migrations directory for files matching `NNN_description.ts` pattern, returns sorted entries |
| `getCurrentVersion` | `(db: Database)` | `number` | Ensures `schema_version` table exists and returns the current version (0 if no rows) |
| `migrateUp` | `(db: Database, target?: number, dir?: string)` | `Promise<{ applied: number; to: number }>` | Applies all pending migrations up to optional target version. Each migration runs in a transaction |
| `migrateDown` | `(db: Database, target?: number, dir?: string)` | `Promise<{ reverted: number; to: number }>` | Reverts migrations down to optional target version (default: one step back). Each revert runs in a transaction |
| `migrationStatus` | `(db: Database, dir?: string)` | `MigrationStatus[]` | Returns all known migrations with their applied/pending status |
| `runPendingMigrations` | `(db: Database)` | `Promise<void>` | Drop-in replacement for legacy `runMigrations()`. Called on startup from `connection.ts` |

### Exported Types (migrate.ts)

| Type | Description |
|------|-------------|
| `MigrationModule` | `{ up: (db: Database) => void; down: (db: Database) => void }` -- interface for migration file exports |
| `MigrationEntry` | `{ version: number; name: string; filename: string }` -- discovered migration file metadata |
| `MigrationStatus` | `{ version: number; name: string; applied: boolean }` -- migration with applied flag |

### CLI Commands (migrate-cli.ts)

| Command | Description |
|---------|-------------|
| `bun run migrate up` | Apply all pending migrations |
| `bun run migrate up --to <ver>` | Apply migrations up to a specific version |
| `bun run migrate down` | Revert the most recent migration |
| `bun run migrate down --to <ver>` | Revert migrations down to a specific version |
| `bun run migrate status` | Display all migrations with applied/pending status |

### Exported Functions (migrate-create.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Template up-migration function (placeholder for scaffolded migrations) |
| `down` | `(db: Database)` | `void` | Template down-migration function (placeholder for scaffolded migrations) |

### CLI Script (migrate-create.ts)

| Command | Description |
|---------|-------------|
| `bun run migrate:create <name>` | Scaffold a new migration file with the next sequential version number |

## Invariants

1. **Filename pattern**: Migration files must match `NNN_description.ts` (3-digit zero-padded version, underscore, lowercase name)
2. **Module contract**: Each migration file must export both `up(db)` and `down(db)` functions; missing either throws an error
3. **Version monotonicity**: Migrations are applied in ascending version order and reverted in descending order
4. **Transactional safety**: Each individual migration (up or down) runs inside a `db.transaction()` -- either fully applies or fully rolls back
5. **Single-row version tracking**: The `schema_version` table always contains exactly one row after the first migration
6. **Version source of truth**: `schema_version.version` is the authoritative record of which migrations have been applied
7. **Migration name validation**: The `migrate-create` script requires names to be lowercase alphanumeric with underscores, starting with a letter
8. **Auto-increment versioning**: New migration files are numbered sequentially from the highest existing version
9. **Idempotent up**: If all migrations are already applied, `migrateUp` returns `{ applied: 0, to: current }`
10. **CLI pragmas**: The CLI sets WAL journal mode, 5-second busy timeout, and foreign keys ON before running migrations

## Behavioral Examples

### Scenario: Apply all pending migrations on startup

- **Given** the database is at version 52 and migration files 053, 054, 055 exist
- **When** `runPendingMigrations(db)` is called
- **Then** migrations 053, 054, 055 are applied in order and `schema_version` is set to 55

### Scenario: Revert one migration

- **Given** the database is at version 55
- **When** `migrateDown(db)` is called with no target
- **Then** migration 055's `down()` is called, `schema_version` is set to 54, and `{ reverted: 1, to: 54 }` is returned

### Scenario: Revert to a specific version

- **Given** the database is at version 55
- **When** `migrateDown(db, 52)` is called
- **Then** migrations 055, 054, 053 are reverted in reverse order and `schema_version` is set to 52

### Scenario: Create a new migration file

- **Given** the highest existing migration is version 55
- **When** `bun run migrate:create add_user_preferences` is executed
- **Then** a file `056_add_user_preferences.ts` is created with `up`/`down` stubs

### Scenario: No pending migrations

- **Given** all migration files have been applied
- **When** `migrateUp(db)` is called
- **Then** returns `{ applied: 0, to: currentVersion }` with no side effects

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Migration file missing `up` or `down` export | Throws `Error: Migration <filename> must export up(db) and down(db) functions` |
| Migration directory does not exist | `discoverMigrations` returns empty array |
| Database at version 0 with `migrateDown` | Returns `{ reverted: 0, to: 0 }` immediately |
| Invalid migration name (uppercase, special chars) | `migrate-create` prints error and exits with code 1 |
| No name argument to `migrate-create` | Prints usage and exits with code 1 |
| Unknown CLI command | Prints error and usage, exits with code 1 |
| Migration `up()` throws during transaction | Transaction rolls back; error propagates |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` class and type |
| `node:fs` | `readdirSync` (discover migrations), `existsSync` (CLI), `writeFileSync` (create) |
| `node:path` | `resolve`, `join` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/db/connection.ts` | `migrateUp`, `getCurrentVersion`, `discoverMigrations` |
| `server/db/migrate-cli.ts` | `migrateUp`, `migrateDown`, `migrationStatus`, `getCurrentVersion` |
| `server/db/migrate-create.ts` | `discoverMigrations` |

## Database Tables

### schema_version

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| version | INTEGER | NOT NULL | Current schema version number (single-row table) |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` (env) | `corvid-agent.db` | Database file path, used by `migrate-cli.ts` only |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
