---
module: discord-thread-sessions-db
version: 1
status: active
files:
  - server/db/discord-thread-sessions.ts
  - server/db/migrations/112_discord_thread_sessions.ts
db_tables:
  - discord_thread_sessions
depends_on:
  - specs/discord/thread-session-map.spec.md
---

# Discord Thread Sessions DB

## Purpose

Persists Discord thread-to-session mappings in SQLite so that active conversations survive server restarts. On startup, recent thread sessions are bulk-loaded to restore the in-memory thread session map without requiring users to re-create threads.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveThreadSession` | `(db: Database, threadId: string, info: ThreadSessionInfo)` | `void` | Persist or update a thread session mapping (INSERT OR REPLACE) |
| `getThreadSession` | `(db: Database, threadId: string)` | `ThreadSessionInfo \| null` | Look up a thread session by Discord thread ID |
| `updateThreadSessionActivity` | `(db: Database, threadId: string)` | `void` | Update the `last_activity_at` timestamp for a thread session |
| `getRecentThreadSessions` | `(db: Database, maxAgeHours?: number)` | `Array<{ threadId, info, lastActivityAt }>` | Bulk-load recent thread sessions for startup recovery (default: 48 hours) |
| `deleteThreadSession` | `(db: Database, threadId: string)` | `void` | Delete a thread session (e.g. on thread archival) |
| `pruneOldThreadSessions` | `(db: Database, maxAgeDays?: number)` | `number` | Remove thread sessions older than specified age (default: 14 days); returns count of deleted rows |

### Exported Migration Functions (112_discord_thread_sessions.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Creates `discord_thread_sessions` table with indexes; adds `last_activity_at` column to `discord_mention_sessions` if missing |
| `down` | `(db: Database)` | `void` | Drops the `discord_thread_sessions` table |

## Invariants

1. **Primary key is thread_id**: Each Discord thread maps to exactly one session.
2. **INSERT OR REPLACE**: `saveThreadSession` upserts — calling it twice for the same thread overwrites the previous mapping.
3. **Recovery window**: `getRecentThreadSessions` only returns sessions active within the specified hour window (default 48h).
4. **Prune safety**: `pruneOldThreadSessions` only deletes sessions older than the retention period (default 14 days).

## Behavioral Examples

### Scenario: Save and retrieve a thread session

- **Given** a Discord thread with ID "thread-123"
- **When** `saveThreadSession(db, "thread-123", info)` is called followed by `getThreadSession(db, "thread-123")`
- **Then** the returned `ThreadSessionInfo` matches the saved info including buddy config if present

### Scenario: Startup recovery loads recent sessions

- **Given** 3 thread sessions: one from 1 hour ago, one from 24 hours ago, one from 72 hours ago
- **When** `getRecentThreadSessions(db, 48)` is called
- **Then** only the first two sessions are returned, ordered by most recent first

### Scenario: Prune removes stale entries

- **Given** a thread session with `last_activity_at` 30 days ago
- **When** `pruneOldThreadSessions(db, 14)` is called
- **Then** the stale session is deleted and the return value is 1

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getThreadSession` with unknown thread ID | Returns null |
| `deleteThreadSession` with unknown thread ID | No-op (DELETE affects 0 rows) |
| `pruneOldThreadSessions` with no stale sessions | Returns 0 |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `server/discord/thread-session-map.ts` | `ThreadSessionInfo` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/thread-session-map.ts` | All exported functions for persistence and recovery |

## Database Tables

### discord_thread_sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| thread_id | TEXT | PRIMARY KEY | Discord thread ID |
| session_id | TEXT | NOT NULL | Associated session ID |
| agent_name | TEXT | NOT NULL | Agent name handling the thread |
| agent_model | TEXT | NOT NULL | Model identifier |
| owner_user_id | TEXT | NOT NULL DEFAULT '' | Discord user who created the thread |
| topic | TEXT | nullable | Thread topic |
| project_name | TEXT | nullable | Project context |
| display_color | TEXT | nullable | Agent display color |
| display_icon | TEXT | nullable | Agent display icon |
| avatar_url | TEXT | nullable | Agent avatar URL |
| creator_perm_level | INTEGER | nullable | Creator permission level |
| buddy_agent_id | TEXT | nullable | Buddy agent ID for paired sessions |
| buddy_agent_name | TEXT | nullable | Buddy agent name |
| buddy_max_rounds | INTEGER | nullable | Max buddy conversation rounds |
| last_activity_at | TEXT | NOT NULL DEFAULT datetime('now') | Last activity timestamp |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | Creation timestamp |

**Indexes:**
- `idx_discord_thread_sessions_session` on `session_id`
- `idx_discord_thread_sessions_activity` on `last_activity_at`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-30 | corvid-agent | Initial spec (#1754) |
