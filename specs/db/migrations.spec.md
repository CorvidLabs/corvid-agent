---
module: migrations
version: 1
status: draft
files:
  - server/db/migrate.ts
  - server/db/migrate-cli.ts
  - server/db/migrate-create.ts
  - server/db/migrations/078_baseline.ts
  - server/db/migrations/079_flock_directory_config.ts
  - server/db/migrations/080_discord_config.ts
  - server/db/migrations/081_task_queue.ts
  - server/db/migrations/082_index_optimization.ts
  - server/db/migrations/083_unique_project_names.ts
  - server/db/migrations/084_model_exams.ts
  - server/db/migrations/085_project_dir_strategy.ts
  - server/db/migrations/086_agent_display_customization.ts
  - server/db/migrations/087_session_metrics.ts
  - server/db/migrations/088_agent_display_columns_fixup.ts
  - server/db/migrations/089_flock_test_results.ts
  - server/db/migrations/091_contact_identities.ts
  - server/db/migrations/092_discord_mention_sessions.ts
  - server/db/migrations/093_mention_session_project_name.ts
  - server/db/migrations/096_mention_session_channel_id.ts
  - server/db/migrations/097_mention_session_conversation_only.ts
  - server/db/migrations/098_schedule_output_destinations.ts
  - server/db/migrations/099_composable_personas.ts
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

## Migration Files

Each migration file exports `up(db: Database): void` and `down(db: Database): void`.

### 078_baseline.ts

Squashed baseline migration capturing the full schema at v78 (v0.21.0 boundary). Replaces 29 incremental migration files (001-078) with a single idempotent pass. Uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` throughout. For existing databases already at version 78+, this migration is skipped by the runner.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates all tables and indexes for the full schema at v78 |
| `down` | `(db: Database)` | `void` | Drops all tables and indexes created by the baseline |

### 079_flock_directory_config.ts

Creates the `flock_directory_config` key-value table for Flock Directory runtime settings.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates `flock_directory_config` table with columns `key` (PK), `value`, `updated_at` |
| `down` | `(db: Database)` | `void` | Drops `flock_directory_config` table |

### 080_discord_config.ts

Creates the `discord_config` key-value table for Discord runtime settings.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates `discord_config` table with columns `key` (PK), `value`, `updated_at` |
| `down` | `(db: Database)` | `void` | Drops `discord_config` table |

### 081_task_queue.ts

Adds `priority` and `queued_at` columns to `work_tasks` for TaskQueueService dispatch, plus a compound index for efficient pending-task queries.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Adds `priority` (INTEGER, default 2) and `queued_at` (TEXT, nullable) columns; creates `idx_work_tasks_pending_dispatch` index |
| `down` | `(db: Database)` | `void` | Drops the index and both columns (with `hasColumn` guard) |

### 082_index_optimization.ts

Adds 7 compound indexes to optimize common multi-column query patterns identified during the v0.23.0 stabilization audit (#742).

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates indexes: `idx_agent_messages_from`, `idx_schedule_executions_schedule_status`, `idx_credit_txn_wallet_type_created`, `idx_council_launches_council_created`, `idx_workflow_runs_workflow_started`, `idx_session_messages_session_timestamp`, `idx_algochat_conversations_created` |
| `down` | `(db: Database)` | `void` | Drops all 7 indexes |

### 083_unique_project_names.ts

Enforces unique project names per tenant by deduplicating existing rows and adding a case-insensitive unique index. Fixes #991.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Deletes duplicate projects (keeps most recent per tenant+name), then creates `idx_projects_tenant_name` unique index with `COLLATE NOCASE` |
| `down` | `(db: Database)` | `void` | Drops `idx_projects_tenant_name` index |

### 084_model_exams.ts

Creates `model_exam_runs` and `model_exam_results` tables for persisting exam scorecards and per-case results.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates `model_exam_runs` and `model_exam_results` tables with 4 indexes |
| `down` | `(db: Database)` | `void` | Drops all indexes and both tables in reverse order |

### 085_project_dir_strategy.ts

Adds `git_url`, `dir_strategy`, and `base_clone_path` columns to the `projects` table for flexible directory strategies (persistent, clone-on-demand, ephemeral, worktree).

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Adds 3 columns: `git_url` (TEXT, nullable), `dir_strategy` (TEXT, default `'persistent'`), `base_clone_path` (TEXT, nullable) |
| `down` | `(db: Database)` | `void` | Recreates the `projects` table without the new columns via backup-and-restore |

### 086_agent_display_customization.ts

Adds display customization fields to the `agents` table: `display_color`, `display_icon`, `avatar_url`, and `disabled`.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Adds 4 columns: `display_color` (TEXT, nullable), `display_icon` (TEXT, nullable), `avatar_url` (TEXT, nullable), `disabled` (INTEGER, default 0) |
| `down` | `(db: Database)` | `void` | Recreates the `agents` table without the new columns via backup-and-restore |

### 087_session_metrics.ts

Adds session metrics tracking columns and tables for analytics.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates session metrics tables and indexes |
| `down` | `(db: Database)` | `void` | Drops session metrics tables and indexes |

### 088_agent_display_columns_fixup.ts

Fixup migration for agent display customization columns added in 086.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Ensures agent display columns are correctly configured |
| `down` | `(db: Database)` | `void` | Reverts fixup changes |

### 089_flock_test_results.ts

Creates `flock_test_results` and `flock_test_challenge_results` tables for storing Flock Directory automated agent test outcomes.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates `flock_test_results` and `flock_test_challenge_results` tables with indexes for agent ID and test result lookups |
| `down` | `(db: Database)` | `void` | Drops both tables and their indexes |

### 091_contact_identities.ts

Creates `contacts` and `contact_platform_links` tables for cross-platform identity mapping. Links Discord IDs, AlgoChat addresses, and GitHub handles to unified contact records.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates `contacts` and `contact_platform_links` tables with indexes for tenant+name lookup and unique platform identity constraint |
| `down` | `(db: Database)` | `void` | Drops `contact_platform_links` and `contacts` tables |

### 092_discord_mention_sessions.ts

Creates the `discord_mention_sessions` table for persisting mention-reply session mappings across server restarts. Maps bot message IDs to session info (session ID, agent name, agent model).

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates `discord_mention_sessions` table with `bot_message_id` as primary key, plus index on `session_id` |
| `down` | `(db: Database)` | `void` | Drops the `discord_mention_sessions` table |

### 093_mention_session_project_name.ts

Adds `project_name` column to `discord_mention_sessions` for persisting the project context in Discord footer metadata.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Adds `project_name` TEXT column to `discord_mention_sessions` |
| `down` | `(db: Database)` | `void` | Drops `project_name` column from `discord_mention_sessions` |

### 096_mention_session_channel_id.ts

Adds `channel_id` column to `discord_mention_sessions` for tracking which Discord channel a mention session originated from.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Adds `channel_id` TEXT column to `discord_mention_sessions` |
| `down` | `(db: Database)` | `void` | Drops `channel_id` column from `discord_mention_sessions` |

### 097_mention_session_conversation_only.ts

Adds `conversation_only` column to `discord_mention_sessions` for tracking whether a session was created via the /message command (conversation-only mode with no tools).

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Adds `conversation_only` INTEGER DEFAULT 0 column to `discord_mention_sessions` (idempotent — checks column existence first) |
| `down` | `(db: Database)` | `void` | Drops `conversation_only` column from `discord_mention_sessions` |

### 098_schedule_output_destinations.ts

Adds `output_destinations` column to `agent_schedules` for routing schedule execution results to Discord channels or AlgoChat addresses.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Adds `output_destinations` TEXT column to `agent_schedules` (idempotent — checks column existence first) |
| `down` | `(db: Database)` | `void` | Drops `output_destinations` column from `agent_schedules` |

### 099_composable_personas.ts

Converts agent personas from a one-to-one model (`agent_personas` keyed by `agent_id`) to a many-to-many model with a standalone `personas` table and an `agent_persona_assignments` junction table. Migrates existing data and drops the old table.

**Exported Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates `personas` and `agent_persona_assignments` tables, migrates data from `agent_personas`, drops old table (idempotent — checks table existence) |
| `down` | `(db: Database)` | `void` | Recreates `agent_personas`, migrates first assigned persona per agent back, drops new tables |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-22 | corvid-agent | Add migration 099 to spec coverage |
| 2026-03-21 | corvid-agent | Add migration 098 to spec coverage |
| 2026-03-20 | corvid-agent | Add migration 097 to spec coverage |
| 2026-03-16 | corvid-agent | Add migration 092 to spec coverage |
| 2026-03-15 | corvid-agent | Add migration 091 to spec coverage |
| 2026-03-14 | corvid-agent | Add migrations 087-089 to spec coverage |
| 2026-03-14 | corvid-agent | Add migration 086 to spec coverage |
| 2026-03-13 | corvid-agent | Add 8 migration files (078-085) to spec coverage |
| 2026-03-04 | corvid-agent | Initial spec |
