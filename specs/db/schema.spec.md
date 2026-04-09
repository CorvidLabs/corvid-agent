---
module: db-schema
version: 1
status: active
files:
  - server/db/schema/index.ts
  - server/db/schema/agents.ts
  - server/db/schema/algochat.ts
  - server/db/schema/auth.ts
  - server/db/schema/buddy.ts
  - server/db/schema/contacts.ts
  - server/db/schema/councils.ts
  - server/db/schema/credits.ts
  - server/db/schema/discord.ts
  - server/db/schema/flock.ts
  - server/db/schema/library.ts
  - server/db/schema/marketplace.ts
  - server/db/schema/memory.ts
  - server/db/schema/model-exams.ts
  - server/db/schema/monitoring.ts
  - server/db/schema/notifications.ts
  - server/db/schema/projects.ts
  - server/db/schema/reputation.ts
  - server/db/schema/schedules.ts
  - server/db/schema/sessions.ts
  - server/db/schema/webhooks.ts
  - server/db/schema/work.ts
  - server/db/schema/workflows.ts
db_tables:
  - schema_version
  - projects
  - agents
  - agent_daily_spending
  - agent_identity
  - agent_messages
  - agent_skills
  - agent_usdc_revenue
  - agent_conversation_allowlist
  - agent_conversation_blocklist
  - agent_conversation_rate_limits
  - agent_spending_caps
  - agent_variants
  - agent_variant_assignments
  - personas
  - agent_persona_assignments
  - sessions
  - session_messages
  - session_metrics
  - algochat_conversations
  - algochat_psk_state
  - algochat_messages
  - algochat_allowlist
  - psk_contacts
  - contacts
  - contact_platform_links
  - councils
  - council_members
  - council_launches
  - council_launch_logs
  - council_discussion_messages
  - governance_proposals
  - governance_votes
  - governance_member_votes
  - proposal_vetoes
  - work_tasks
  - pr_outcomes
  - repo_blocklist
  - agent_memories
  - agent_memories_fts
  - memory_observations
  - agent_library
  - daily_spending
  - credit_ledger
  - credit_transactions
  - credit_config
  - subscriptions
  - subscription_items
  - usage_records
  - invoices
  - agent_schedules
  - schedule_executions
  - repo_locks
  - escalation_queue
  - owner_questions
  - owner_question_dispatches
  - notification_channels
  - owner_notifications
  - notification_deliveries
  - webhook_registrations
  - webhook_deliveries
  - mention_polling_configs
  - workflows
  - workflow_runs
  - workflow_node_runs
  - audit_log
  - health_snapshots
  - server_health_snapshots
  - performance_metrics
  - dedup_state
  - rate_limit_state
  - sandbox_configs
  - voice_cache
  - plugins
  - plugin_capabilities
  - skill_bundles
  - project_skills
  - mcp_server_configs
  - marketplace_listings
  - marketplace_reviews
  - marketplace_pricing_tiers
  - marketplace_subscriptions
  - marketplace_trials
  - marketplace_usage_events
  - escrow_transactions
  - federated_instances
  - agent_reputation
  - reputation_events
  - reputation_attestations
  - reputation_history
  - response_feedback
  - agent_blocklist
  - tenants
  - tenant_members
  - api_keys
  - github_allowlist
  - permission_checks
  - permission_grants
  - discord_config
  - discord_muted_users
  - discord_mention_sessions
  - discord_processed_messages
  - discord_thread_sessions
  - flock_agents
  - flock_directory_config
  - flock_test_results
  - flock_test_challenge_results
  - model_exam_runs
  - model_exam_results
  - buddy_pairings
  - buddy_sessions
  - buddy_messages
depends_on: []
---

# Database Schema

## Purpose

Defines and manages the SQLite database schema through a sequential migration system. Contains all `CREATE TABLE`, `ALTER TABLE`, index creation, trigger definitions, and seed data statements. The `runMigrations` function applies all unapplied migrations in a single transaction, bringing the database from any prior version to `SCHEMA_VERSION`.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `runMigrations` | `(db: Database)` | `void` | Apply all pending migrations up to SCHEMA_VERSION in a single transaction, then run `reconcileTables()` as a safety net to ensure all idempotent CREATE/INDEX/TRIGGER/INSERT statements are applied |

### Exported Constants (per domain file)

| Export | Type | Required | Description |
|--------|------|----------|-------------|
| `tables` | `string[]` | yes | SQL CREATE TABLE IF NOT EXISTS statements for the domain's tables |
| `indexes` | `string[]` | yes | SQL CREATE INDEX IF NOT EXISTS statements for the domain's indexes |
| `virtualTables` | `string[]` | no | SQL CREATE VIRTUAL TABLE statements (e.g. FTS5) |
| `triggers` | `string[]` | no | SQL CREATE TRIGGER statements (e.g. FTS sync) |
| `seedData` | `string[]` | no | SQL INSERT OR IGNORE statements for preset data |

## Invariants

1. **Sequential versioning**: Migrations are keyed by integer version numbers. `SCHEMA_VERSION` (currently 116) is the target. Versions must never be renumbered (version 11 was intentionally skipped; versions 52-67 and 71-77 were collapsed into the v78 baseline)
2. **Single-transaction atomicity**: All pending migrations run inside a single `db.transaction()` call. Either all succeed or none apply
3. **Idempotent ALTER TABLE**: Before executing `ALTER TABLE ADD COLUMN`, `hasColumn()` checks if the column already exists. `hasColumn()` validates table names against a `SAFE_SQL_IDENTIFIER` regex to prevent SQL injection
4. **CREATE TABLE IF NOT EXISTS**: All table creation statements use `IF NOT EXISTS` for safety
5. **Forward-only migrations**: No rollback mechanism. Migrations only move forward from `currentVersion` to `SCHEMA_VERSION`
6. **Version tracking**: The `schema_version` table stores a single row with the current version. Created if missing, inserted on first run, updated on subsequent runs
7. **FTS sync triggers**: `agent_memories_fts` has `AFTER INSERT/DELETE/UPDATE` triggers to keep the FTS5 index in sync with the `agent_memories` table
8. **Seed data**: Domain files may include `seedData` arrays with `INSERT OR IGNORE` statements for preset data (e.g., skill bundles, credit config defaults)
9. **Table recreation pattern**: When a table needs schema changes that SQLite's `ALTER TABLE` cannot handle, the pattern is: create new table, copy data, drop old table, rename
10. **No data deletion migrations**: Migrations add tables and columns but never drop existing user data
11. **Collapsed baseline**: Migration v78 is a collapsed baseline containing all idempotent CREATE TABLE/INDEX/VIRTUAL TABLE/TRIGGER and seed data statements from all domain files. Prior individual migrations (1-77) are no longer present as separate entries
12. **Reconciliation safety net**: After applying pending migrations, `reconcileTables()` re-runs all idempotent statements (CREATE TABLE/INDEX/VIRTUAL TABLE/TRIGGER IF NOT EXISTS, INSERT OR IGNORE) to catch tables missed when schema_version was bumped by file-based migrations before inline migrations were added
13. **Domain-based schema organization**: Table and index definitions are organized into co-located domain files (e.g., `agents.ts`, `councils.ts`, `library.ts`) each exporting `tables`, `indexes`, and optionally `virtualTables`, `triggers`, `seedData`

## Behavioral Examples

### Scenario: Fresh database initialization

- **Given** a new empty database
- **When** `runMigrations(db)` is called
- **Then** `schema_version` table is created, all migrations from v78 baseline through v116 run, version is set to 116, then `reconcileTables()` runs as a safety net

### Scenario: Incremental migration

- **Given** a database at version 112
- **When** `runMigrations(db)` is called
- **Then** only migrations 113-116 are applied, version is updated to 116, then `reconcileTables()` runs

### Scenario: Already at current version

- **Given** a database at version 116
- **When** `runMigrations(db)` is called
- **Then** skips the migration transaction (no-op), but still runs `reconcileTables()` to ensure all idempotent statements are applied

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

Note: This module defines all other database tables in the system. Individual table schemas are documented in the specs of their consuming modules (e.g. `specs/db/sessions/sessions.spec.md`, `specs/db/operations/credits.spec.md`).

## Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `SCHEMA_VERSION` | `116` | Target schema version |

## Migration Summary

| Version | Tables/Changes |
|---------|---------------|
| 78 | **Collapsed baseline** — all idempotent CREATE TABLE/INDEX/VIRTUAL TABLE/TRIGGER and seed data from all domain files (replaces individual migrations 1-77) |
| 79 | `flock_directory_config` |
| 80 | `discord_config` |
| 84 | `model_exam_runs`, `model_exam_results` + indexes |
| 89 | `flock_test_results`, `flock_test_challenge_results` + indexes |
| 90 | `response_feedback` + indexes |
| 91 | `contacts`, `contact_platform_links` + indexes |
| 92 | `discord_mention_sessions` + indexes |
| 93 | `discord_mention_sessions.project_name` |
| 94 | `agent_memories.asa_id` (ARC-69 long-term memory) |
| 95 | `memory_observations` + indexes |
| 96 | `discord_mention_sessions.channel_id` |
| 97 | `discord_mention_sessions.conversation_only` |
| 98 | `agent_schedules.output_destinations` |
| 99 | `personas`, `agent_persona_assignments` (composable personas) |
| 100 | `agent_variants`, `agent_variant_assignments` |
| 102 | `agents.conversation_mode`, `agents.conversation_rate_limit_window`, `agents.conversation_rate_limit_max`, `agent_conversation_allowlist`, `agent_conversation_blocklist`, `agent_conversation_rate_limits` |
| 103 | `discord_muted_users` — persist Discord mutes across restarts |
| 104 | `buddy_pairings`, `buddy_sessions`, `buddy_messages` |
| 105 | `sessions.restart_pending` + partial index |
| 106 | `agent_library` (CRVLIB shared agent knowledge library) |
| 107 | `sessions.server_restart_initiated_at` |
| 108 | `agent_memories.book`, `agent_memories.page` + book/page index and trigger |
| 109 | `discord_processed_messages` + indexes |
| 110 | `sessions.conversation_summary` |
| 111 | `agent_library.title` |
| 112 | `discord_thread_sessions` + indexes, `discord_mention_sessions.last_activity_at` |
| 113 | `agent_memories.expires_at` + index, `agent_memories.access_count` (short-term memory decay) |
| 114 | `tenant_members.email` + unique index (proxy trust mode) |
| 115 | Deduplicate AlgoChat conversations: enforce unique `participant_addr` index |
| 116 | `governance_proposals.voting_opened_at`, `governance_proposals.voting_deadline`, `proposal_vetoes` + indexes |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
| 2026-03-06 | corvid-agent | Added migrations 68-70: council on-chain mode, USDC revenue tracking, AlgoChat defaults. |
| 2026-04-09 | corvid-agent | Major update: SCHEMA_VERSION 70->116, collapsed baseline at v78, added library.ts domain file, reconcileTables() safety net, 40+ new migrations (79-116), updated db_tables list with all current tables, updated invariants for new architecture. |
