---
module: flock-db
version: 1
status: active
files:
  - server/db/schema/flock.ts
db_tables:
  - flock_directory_config
  - flock_test_results
  - flock_test_challenge_results
depends_on: []
---

# Flock DB

## Purpose

Schema definitions for the Flock Directory subsystem. Covers the key-value configuration store for Flock Directory settings and the automated agent-testing tables that record per-suite and per-challenge test outcomes. These tables are managed via migrations 079 and 089; there is no standalone DB module — callers query them directly.

## Public API

No exported functions — this module exports only schema constants (`tables`, `indexes`).

### Exported Constants

| Export | Type | Description |
|--------|------|-------------|
| `tables` | `string[]` | CREATE TABLE statements for flock domain tables |
| `indexes` | `string[]` | CREATE INDEX statements for flock domain indexes |

## Invariants

1. **Config key uniqueness**: `flock_directory_config` uses `key` as PRIMARY KEY — one value per key.
2. **Test cascade delete**: `flock_test_challenge_results.test_result_id` references `flock_test_results(id) ON DELETE CASCADE` — deleting a test suite removes all its challenge rows.
3. **Score defaults**: All score/count columns default to `0` so incomplete records are still valid rows.
4. **Responded flag**: `flock_test_challenge_results.responded` is stored as INTEGER (SQLite boolean) — `1` = responded, `0` = no response.

## Behavioral Examples

### Scenario: Store a Flock Directory config value

- **Given** an empty `flock_directory_config` table
- **When** `INSERT INTO flock_directory_config(key, value) VALUES ('enabled', 'true')` is executed
- **Then** a row exists with `key='enabled'` and `updated_at` set to current time

### Scenario: Delete test suite cascades to challenges

- **Given** a `flock_test_results` row with 5 associated `flock_test_challenge_results` rows
- **When** the `flock_test_results` row is deleted
- **Then** all 5 challenge result rows are automatically deleted

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Insert duplicate config key | SQLite PRIMARY KEY conflict — use `INSERT OR REPLACE` or `ON CONFLICT DO UPDATE` |
| Insert challenge result with unknown test_result_id | FK violation, row rejected |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/db/schema/index.ts` | `tables`, `indexes` arrays applied at startup |

## Database Tables

### flock_directory_config

Key-value store for Flock Directory runtime configuration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | TEXT | PRIMARY KEY | Configuration key name |
| `value` | TEXT | NOT NULL | Configuration value (serialised string) |
| `updated_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | Last update timestamp |

### flock_test_results

Stores per-agent automated test suite outcomes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID for this test run |
| `agent_id` | TEXT | NOT NULL | Agent under test |
| `overall_score` | INTEGER | NOT NULL, DEFAULT `0` | Aggregate score across all challenges |
| `category_scores` | TEXT | NOT NULL, DEFAULT `'{}'` | JSON object: category → score |
| `challenge_count` | INTEGER | NOT NULL, DEFAULT `0` | Total number of challenges issued |
| `responded_count` | INTEGER | NOT NULL, DEFAULT `0` | Number of challenges that received a response |
| `duration_ms` | INTEGER | NOT NULL, DEFAULT `0` | Total test duration in milliseconds |
| `started_at` | TEXT | NOT NULL | ISO timestamp when the test suite started |
| `completed_at` | TEXT | NOT NULL | ISO timestamp when the test suite finished |
| `created_at` | TEXT | DEFAULT `datetime('now')` | Row creation timestamp |

**Indexes:**
- `idx_flock_test_results_agent` on `agent_id`
- `idx_flock_test_results_completed` on `completed_at`

### flock_test_challenge_results

Individual challenge outcomes within a test suite.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing row ID |
| `test_result_id` | TEXT | NOT NULL, FK `flock_test_results(id)` ON DELETE CASCADE | Parent test suite |
| `challenge_id` | TEXT | NOT NULL | Identifier for the specific challenge |
| `category` | TEXT | NOT NULL | Challenge category (e.g. `reasoning`, `memory`) |
| `score` | INTEGER | NOT NULL, DEFAULT `0` | Score awarded for this challenge |
| `responded` | INTEGER | NOT NULL, DEFAULT `0` | Whether the agent responded (boolean: 1/0) |
| `response_time_ms` | INTEGER | DEFAULT NULL | Response latency in milliseconds |
| `response` | TEXT | DEFAULT NULL | Raw response text from the agent |
| `reason` | TEXT | DEFAULT NULL | Explanation or grading notes |
| `weight` | INTEGER | NOT NULL, DEFAULT `1` | Challenge weight for score aggregation |

**Indexes:**
- `idx_flock_test_challenge_results_test` on `test_result_id`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-29 | jackdaw | Initial spec (migration 079, 089) |
