---
module: discord-thread-sessions
version: 1
status: draft
files:
  - server/db/discord-thread-sessions.ts
db_tables:
  - discord_thread_sessions
depends_on:
  - specs/db/migrations.spec.md
---

# Discord Thread Sessions

## Purpose

Persists Discord thread-to-session mappings so they survive server restarts. When a bot creates or joins a Discord thread, the mapping between the thread ID and session info (session ID, agent name, model, owner, etc.) is stored in the `discord_thread_sessions` table. On server restart, these mappings are bulk-loaded so active threads are immediately available without lazy recovery.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveThreadSession` | `(db: Database, threadId: string, info: ThreadSessionInfo)` | `void` | Persist a thread-session mapping using INSERT OR REPLACE; updates `last_activity_at` to now |
| `getThreadSession` | `(db: Database, threadId: string)` | `ThreadSessionInfo \| null` | Look up a thread session by Discord thread ID; returns null if not found |
| `updateThreadSessionActivity` | `(db: Database, threadId: string)` | `void` | Update the `last_activity_at` timestamp for a thread session |
| `getRecentThreadSessions` | `(db: Database, maxAgeHours?: number)` | `Array<{ threadId: string; info: ThreadSessionInfo; lastActivityAt: number }>` | Bulk-load thread sessions active within the lookback window (default 48 hours) for startup recovery; ordered by `last_activity_at DESC` |
| `deleteThreadSession` | `(db: Database, threadId: string)` | `void` | Hard-delete a thread session (e.g. on thread archival) |
| `pruneOldThreadSessions` | `(db: Database, maxAgeDays?: number)` | `number` | Remove thread session entries older than the specified age (default 14 days); returns the number of rows deleted |

## Invariants

1. `saveThreadSession` uses `INSERT OR REPLACE` so updating the same `thread_id` is idempotent.
2. `getThreadSession` returns `null` when no matching row exists.
3. `getRecentThreadSessions` defaults to a 48-hour lookback window if `maxAgeHours` is not provided.
4. `getRecentThreadSessions` returns results ordered by `last_activity_at` descending (most recent first).
5. `pruneOldThreadSessions` defaults to a 14-day retention window if `maxAgeDays` is not provided.
6. `pruneOldThreadSessions` returns the actual number of rows deleted (may be 0).
7. `lastActivityAt` in `getRecentThreadSessions` results is a Unix timestamp in milliseconds.

## Behavioral Examples

### Scenario: Save and retrieve a session

- **Given** a thread ID `"thread-123"` and session info with `sessionId = "s1"`, `agentName = "Corvid"`, `agentModel = "claude-3"`
- **When** `saveThreadSession(db, "thread-123", info)` is called
- **Then** `getThreadSession(db, "thread-123")` returns the same session info

### Scenario: Overwrite existing session

- **Given** a session mapping exists for `threadId = "thread-1"`
- **When** `saveThreadSession(db, "thread-1", { sessionId: "sess-2", ... })` is called
- **Then** the existing row is replaced and `getThreadSession(db, "thread-1")` returns the new session info

### Scenario: Bulk recovery on startup

- **Given** three thread sessions active within the last 48 hours
- **When** `getRecentThreadSessions(db)` is called
- **Then** all three sessions are returned with `threadId`, `info`, and `lastActivityAt` (Unix ms)

### Scenario: Prune old sessions

- **Given** two rows: one with `last_activity_at` 20 days ago, one 5 days ago
- **When** `pruneOldThreadSessions(db, 14)` is called
- **Then** the 20-day-old row is deleted, the 5-day-old row is kept; return value is `1`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getThreadSession` with non-existent thread ID | Returns `null` |
| `deleteThreadSession` with no matching row | Runs without error; no rows deleted |
| `pruneOldThreadSessions` with no rows meeting threshold | Returns `0` |
| `updateThreadSessionActivity` with non-existent thread ID | Runs without error; no rows updated |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all DB operations |
| `server/discord/thread-session-map` | `ThreadSessionInfo` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/thread-manager.ts` | `saveThreadSession`, `getThreadSession`, `deleteThreadSession`, `getRecentThreadSessions` for thread session persistence and startup recovery |

## Database Tables

### discord_thread_sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `thread_id` | TEXT | PRIMARY KEY | Discord thread channel ID |
| `session_id` | TEXT | NOT NULL | Active session ID associated with this thread |
| `agent_name` | TEXT | NOT NULL | Display name of the agent handling the thread |
| `agent_model` | TEXT | NOT NULL | Model identifier used for the session |
| `owner_user_id` | TEXT | NOT NULL DEFAULT '' | Discord user ID of the thread owner |
| `topic` | TEXT | | Thread topic or description |
| `project_name` | TEXT | | Project name for context |
| `display_color` | TEXT | | Agent display color (hex) |
| `display_icon` | TEXT | | Agent display icon URL |
| `avatar_url` | TEXT | | Agent avatar URL |
| `creator_perm_level` | INTEGER | | Permission level of the user who created the session |
| `buddy_agent_id` | TEXT | | Buddy agent ID if buddy mode is active |
| `buddy_agent_name` | TEXT | | Buddy agent display name |
| `buddy_max_rounds` | INTEGER | | Maximum rounds for buddy mode |
| `last_activity_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | When the thread was last active |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | When the mapping was created |

### Indexes

- `idx_discord_thread_sessions_session` on `session_id`
- `idx_discord_thread_sessions_activity` on `last_activity_at`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-30 | corvid-agent | Initial spec (thread-session persistence, migration 112) |
