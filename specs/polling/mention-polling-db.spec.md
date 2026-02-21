---
module: mention-polling-db
version: 1
status: active
files:
  - server/db/mention-polling.ts
db_tables:
  - mention_polling_configs
depends_on: []
---

# Mention Polling DB

## Purpose

Pure data-access layer for GitHub mention polling configuration CRUD and state management. Provides all database operations for creating, reading, updating, and deleting polling configs, as well as updating poll state (timestamps, processed IDs, trigger counts). No business logic — just SQL queries with row-to-domain mapping.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createMentionPollingConfig` | `(db: Database, input: CreateMentionPollingInput)` | `MentionPollingConfig` | Insert a new polling config with generated UUID |
| `getMentionPollingConfig` | `(db: Database, id: string)` | `MentionPollingConfig \| null` | Fetch a single config by ID |
| `listMentionPollingConfigs` | `(db: Database, agentId?: string)` | `MentionPollingConfig[]` | List all configs, optionally filtered by agent. Ordered by `created_at DESC` |
| `findDuePollingConfigs` | `(db: Database)` | `MentionPollingConfig[]` | Find active configs past their poll interval. Returns configs where `last_poll_at` is NULL or older than `interval_seconds` |
| `updateMentionPollingConfig` | `(db: Database, id: string, input: UpdateMentionPollingInput)` | `MentionPollingConfig \| null` | Partial update — only provided fields are changed. Returns null if config not found |
| `deleteMentionPollingConfig` | `(db: Database, id: string)` | `boolean` | Delete a config. Returns false if not found |
| `updatePollState` | `(db: Database, id: string, lastSeenId?: string)` | `void` | Update `last_poll_at` to now, optionally set `last_seen_id` |
| `incrementPollingTriggerCount` | `(db: Database, id: string)` | `void` | Increment `trigger_count` by 1 |
| `updateProcessedIds` | `(db: Database, id: string, processedIds: string[])` | `void` | Replace the `processed_ids` JSON array, capping at MAX_PROCESSED_IDS (200) |

## Invariants

1. **processedIds capped at 200**: `MAX_PROCESSED_IDS = 200`. When the array exceeds this limit, `updateProcessedIds` trims from the front (oldest entries removed) using `slice(-MAX_PROCESSED_IDS)`
2. **findDuePollingConfigs only returns active configs past their interval**: Query filters by `status = 'active'` AND checks that `last_poll_at` is NULL or `datetime(last_poll_at, '+interval_seconds seconds') <= datetime('now')`. Results ordered by `last_poll_at ASC NULLS FIRST`
3. **updateMentionPollingConfig supports partial updates**: Only fields present in the input object are included in the UPDATE SET clause. If no fields are provided, the existing config is returned unchanged
4. **agentId is updatable**: `updateMentionPollingConfig` accepts `agentId` in the input, allowing reassignment of a config to a different agent

## Behavioral Examples

### Scenario: Create a polling config

- **Given** valid input with `agentId`, `repo`, and `mentionUsername`
- **When** `createMentionPollingConfig(db, input)` is called
- **Then** a new config is created with UUID, status `active`, `triggerCount: 0`, and default interval of 60s

### Scenario: Find due configs

- **Given** two active configs: one last polled 5 minutes ago with 60s interval, one never polled
- **When** `findDuePollingConfigs(db)` is called
- **Then** both are returned, with the never-polled config first (`NULLS FIRST`)

### Scenario: Partial update

- **Given** an existing config with `intervalSeconds: 60`
- **When** `updateMentionPollingConfig(db, id, { intervalSeconds: 120 })` is called
- **Then** only `interval_seconds` and `updated_at` are changed; all other fields remain the same

### Scenario: processedIds cap

- **Given** a config with 195 processed IDs
- **When** `updateProcessedIds(db, id, [...195ids, ...10newIds])` is called (205 total)
- **Then** only the last 200 IDs are stored (the 5 oldest are trimmed)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getMentionPollingConfig` with nonexistent ID | Returns `null` |
| `updateMentionPollingConfig` with nonexistent ID | Returns `null` |
| `deleteMentionPollingConfig` with nonexistent ID | Returns `false` |
| `updateMentionPollingConfig` with empty input | Returns existing config unchanged |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types` | `MentionPollingConfig`, `CreateMentionPollingInput`, `UpdateMentionPollingInput`, `MentionPollingStatus` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/polling/service.ts` | `findDuePollingConfigs`, `updatePollState`, `incrementPollingTriggerCount`, `updateProcessedIds` |
| `server/routes/mention-polling.ts` | `listMentionPollingConfigs`, `getMentionPollingConfig`, `createMentionPollingConfig`, `updateMentionPollingConfig`, `deleteMentionPollingConfig` |

## Database Tables

### mention_polling_configs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL | Agent to trigger when mentions are detected |
| repo | TEXT | NOT NULL | GitHub repo (`owner/repo`) or org/user name |
| mention_username | TEXT | NOT NULL | GitHub username to watch for @mentions |
| project_id | TEXT | nullable | Optional project scope |
| interval_seconds | INTEGER | DEFAULT 60 | Poll interval in seconds (min 30) |
| status | TEXT | DEFAULT 'active' | `active` or `paused` |
| trigger_count | INTEGER | DEFAULT 0 | Total number of sessions triggered |
| last_poll_at | TEXT | nullable | ISO timestamp of last successful poll |
| last_seen_id | TEXT | nullable | Legacy: ID of most recent processed mention |
| processed_ids | TEXT | DEFAULT '[]' | JSON array of all processed mention IDs (capped at 200) |
| event_filter | TEXT | DEFAULT '[]' | JSON array of event types to poll (empty = all) |
| allowed_users | TEXT | DEFAULT '[]' | JSON array of usernames allowed to trigger (empty = all) |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification timestamp |

## Configuration

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_PROCESSED_IDS` | `200` | Maximum number of processed mention IDs stored per config |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
