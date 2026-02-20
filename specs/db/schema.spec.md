---
module: db-schema
version: 1
status: active
files:
  - server/db/schema.ts
db_tables:
  - schema_version
  - projects
  - agents
  - sessions
  - session_messages
  - algochat_conversations
  - algochat_psk_state
  - agent_messages
  - councils
  - council_members
  - council_launches
  - council_launch_logs
  - council_discussion_messages
  - work_tasks
  - agent_memories
  - agent_memories_fts
  - daily_spending
  - escalation_queue
  - algochat_messages
  - algochat_allowlist
  - credit_ledger
  - credit_transactions
  - credit_config
  - agent_schedules
  - schedule_executions
  - webhook_registrations
  - webhook_deliveries
  - mention_polling_configs
  - workflows
  - workflow_runs
  - workflow_node_runs
  - audit_log
  - owner_questions
  - notification_channels
  - owner_notifications
  - notification_deliveries
  - owner_question_dispatches
  - plugins
  - plugin_capabilities
  - sandbox_configs
  - marketplace_listings
  - marketplace_reviews
  - federated_instances
  - agent_reputation
  - reputation_events
  - reputation_attestations
  - tenants
  - api_keys
  - subscriptions
  - usage_records
  - invoices
  - health_snapshots
  - agent_personas
  - skill_bundles
  - agent_skills
  - voice_cache
  - psk_contacts
  - mcp_server_configs
  - project_skills
depends_on: []
---

# Database Schema

## Purpose

Defines and manages the SQLite database schema through a sequential migration system. Contains all `CREATE TABLE`, `ALTER TABLE`, index creation, trigger definitions, and seed data statements. The `runMigrations` function applies all unapplied migrations in a single transaction, bringing the database from any prior version to `SCHEMA_VERSION`.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `runMigrations` | `(db: Database)` | `void` | Apply all pending migrations up to SCHEMA_VERSION in a single transaction |

## Invariants

1. **Sequential versioning**: Migrations are keyed by integer version numbers. `SCHEMA_VERSION` (currently 51) is the target. Versions must never be renumbered (version 11 was intentionally skipped)
2. **Single-transaction atomicity**: All pending migrations run inside a single `db.transaction()` call. Either all succeed or none apply
3. **Idempotent ALTER TABLE**: Before executing `ALTER TABLE ADD COLUMN`, `hasColumn()` checks if the column already exists. This prevents errors on re-runs
4. **CREATE TABLE IF NOT EXISTS**: All table creation statements use `IF NOT EXISTS` for safety
5. **Forward-only migrations**: No rollback mechanism. Migrations only move forward from `currentVersion` to `SCHEMA_VERSION`
6. **Version tracking**: The `schema_version` table stores a single row with the current version. Created if missing, inserted on first run, updated on subsequent runs
7. **FTS sync triggers**: `agent_memories_fts` (migration 29) has `AFTER INSERT/DELETE/UPDATE` triggers to keep the FTS5 index in sync with the `agent_memories` table
8. **Seed data**: Migration 46 and 51 insert preset skill bundles. Migration 20 inserts default credit config values. All use `INSERT OR IGNORE` for idempotency
9. **Table recreation pattern**: When a table needs schema changes that SQLite's `ALTER TABLE` cannot handle (e.g. migration 48 for sessions, migration 23 for PSK state), the pattern is: create new table, copy data, drop old table, rename
10. **No data deletion migrations**: Migrations add tables and columns but never drop existing user data

## Behavioral Examples

### Scenario: Fresh database initialization

- **Given** a new empty database
- **When** `runMigrations(db)` is called
- **Then** `schema_version` table is created, all 51 migrations run, version is set to 51

### Scenario: Incremental migration

- **Given** a database at version 48
- **When** `runMigrations(db)` is called
- **Then** only migrations 49, 50, 51 are applied, version is updated to 51

### Scenario: Already at current version

- **Given** a database at version 51
- **When** `runMigrations(db)` is called
- **Then** returns immediately (no-op)

### Scenario: Column already exists

- **Given** a database where migration 3 was partially applied (column `wallet_address` exists on `agents`)
- **When** `runMigrations(db)` re-runs migration 3
- **Then** `hasColumn` detects the column exists and skips the `ALTER TABLE` statement

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Migration SQL fails | Transaction rolls back, database unchanged |
| Skipped version (no MIGRATIONS entry) | `continue` in loop — silently skipped |
| schema_version table missing | Created automatically |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `runMigrations` called at startup before any DB access |

## Database Tables

### schema_version

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| version | INTEGER | NOT NULL | Current schema version |

Note: This module defines all other database tables in the system. Individual table schemas are documented in the specs of their consuming modules (e.g. `specs/db/sessions.spec.md`, `specs/db/credits.spec.md`).

## Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `SCHEMA_VERSION` | `51` | Target schema version |

## Migration Summary

| Version | Tables/Changes |
|---------|---------------|
| 1 | `projects`, `agents`, `sessions`, `session_messages`, `algochat_conversations` + indexes |
| 2 | `algochat_psk_state` |
| 3 | `agents` wallet columns |
| 4 | `agent_messages` + indexes |
| 5 | `councils`, `council_members`, `council_launches` + session council columns |
| 6 | `council_launch_logs` |
| 7 | `agents.default_project_id` |
| 8 | `work_tasks` + indexes |
| 9 | `council_discussion_messages` + council discussion columns |
| 10 | `agent_memories` + FTS prep |
| 12 | `agent_messages.thread_id` |
| 13 | `daily_spending` |
| 14 | `escalation_queue` |
| 15 | `sessions.total_algo_spent` |
| 16 | `algochat_messages` |
| 17 | `work_tasks` iteration columns |
| 18 | `work_tasks.worktree_dir`, `sessions.work_dir` |
| 19 | `algochat_allowlist` |
| 20 | `credit_ledger`, `credit_transactions`, `credit_config` + defaults |
| 21 | `agents.mcp_tool_permissions` |
| 22 | `council_launches.chat_session_id` |
| 23 | `algochat_psk_state` network-aware (table recreation) |
| 24 | `agent_schedules`, `schedule_executions` |
| 25 | `schedule_executions.config_snapshot` |
| 26 | Provider columns on agents/messages |
| 27 | `agent_schedules.notify_address` |
| 28 | `agent_memories.status` + index |
| 29 | `agent_memories_fts` (FTS5) + sync triggers |
| 30 | `psk_contacts` + migration from legacy PSK |
| 31 | `webhook_registrations`, `webhook_deliveries` |
| 32 | `mention_polling_configs` |
| 33 | `mention_polling_configs.processed_ids` |
| 34 | `workflows`, `workflow_runs`, `workflow_node_runs` |
| 35 | `audit_log` |
| 36 | `owner_questions` |
| 37 | `notification_channels`, `owner_notifications`, `notification_deliveries` |
| 38 | `owner_question_dispatches` |
| 39 | `plugins`, `plugin_capabilities` |
| 40 | `sandbox_configs` |
| 41 | `marketplace_listings`, `marketplace_reviews`, `federated_instances` |
| 42 | `agent_reputation`, `reputation_events`, `reputation_attestations` |
| 43 | `tenants`, `api_keys`, `subscriptions`, `usage_records`, `invoices` |
| 44 | `health_snapshots`, `agent_memories.archived` |
| 45 | `agent_personas` |
| 46 | `skill_bundles`, `agent_skills` + preset bundles |
| 47 | `agents` voice columns, `voice_cache` |
| 48 | `sessions` table recreation (nullable project_id) |
| 49 | `mcp_server_configs` |
| 50 | `owner_question_dispatches.answered_at` |
| 51 | `project_skills` + new preset skill bundles |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
