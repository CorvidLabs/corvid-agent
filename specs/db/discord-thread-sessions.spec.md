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

Persists Discord thread-session mappings so they survive server restarts. When an agent session is created in a Discord thread, the mapping between the thread ID and session info (session ID, agent name, model, owner, topic, display config, buddy config) is stored in the `discord_thread_sessions` table. On server restart, the bot can bulk-recover these mappings to resume thread-based conversations without lazy DB lookups per message.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveThreadSession` | `db: Database, threadId: string, info: ThreadSessionInfo` | `void` | Persists a thread-session mapping using INSERT OR REPLACE. Sets `last_activity_at` to current time |
| `getThreadSession` | `db: Database, threadId: string` | `ThreadSessionInfo \| null` | Looks up a session by thread ID; returns null if not found |
| `updateThreadSessionActivity` | `db: Database, threadId: string` | `void` | Updates the `last_activity_at` timestamp to the current time for a thread session |
| `getRecentThreadSessions` | `db: Database, maxAgeHours?: number` | `Array<{ threadId: string; info: ThreadSessionInfo; lastActivityAt: number }>` | Bulk-load recent thread sessions for startup recovery. Default max age is 48 hours. Returns entries ordered by `last_activity_at` descending |
| `deleteThreadSession` | `db: Database, threadId: string` | `void` | Deletes a thread session (e.g. on thread archival) |
| `pruneOldThreadSessions` | `db: Database, maxAgeDays?: number` | `number` | Deletes rows older than the specified age (default 14 days); returns the number of deleted rows |

## Invariants

1. `saveThreadSession` uses `INSERT OR REPLACE` so updating the same `thread_id` is idempotent.
2. `getThreadSession` returns `null` when no matching row exists.
3. `getRecentThreadSessions` defaults to a 48-hour window if `maxAgeHours` is not provided.
4. `pruneOldThreadSessions` defaults to a 14-day retention window if `maxAgeDays` is not provided.
5. `pruneOldThreadSessions` returns the actual number of rows deleted (may be 0).
6. Buddy config fields (`buddy_agent_id`, `buddy_agent_name`, `buddy_max_rounds`) are only populated in the returned `ThreadSessionInfo` when both `buddy_agent_id` and `buddy_agent_name` are non-null.
7. Timestamps lacking a trailing 'Z' get one appended when converting `last_activity_at` to epoch milliseconds.

## Behavioral Examples

### Scenario: Save and retrieve a thread session

- **Given** a thread ID `"thread-abc"` and session info with `sessionId: "s1"`, `agentName: "Corvid"`, `agentModel: "claude-3"`
- **When** `saveThreadSession(db, "thread-abc", info)` is called
- **Then** `getThreadSession(db, "thread-abc")` returns the matching `ThreadSessionInfo`

### Scenario: Overwrite existing thread session

- **Given** a session mapping exists for `threadId = "thread-1"`
- **When** `saveThreadSession(db, "thread-1", newInfo)` is called
- **Then** the existing row is replaced and `getThreadSession(db, "thread-1")` returns the new session info

### Scenario: Lookup for unknown thread returns null

- **Given** no rows in `discord_thread_sessions`
- **When** `getThreadSession(db, "unknown-id")` is called
- **Then** returns `null`

### Scenario: Bulk-recover recent sessions

- **Given** two thread sessions: one with activity 12 hours ago, one 72 hours ago
- **When** `getRecentThreadSessions(db, 48)` is called
- **Then** only the 12-hour-old session is returned

### Scenario: Prune old thread sessions

- **Given** two rows: one with activity 20 days ago, one 5 days ago
- **When** `pruneOldThreadSessions(db, 14)` is called
- **Then** the 20-day-old row is deleted, the 5-day-old row is kept; return value is `1`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getThreadSession` with non-existent thread ID | Returns `null` |
| `deleteThreadSession` with no matching row | Runs without error; no rows deleted |
| `pruneOldThreadSessions` with no rows meeting threshold | Returns `0` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all DB operations |
| `server/discord/thread-session-map` | `ThreadSessionInfo` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/thread-manager.ts` | `getRecentThreadSessions` for bulk recovery on startup |

## Database Tables

### discord_thread_sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `thread_id` | TEXT | PRIMARY KEY | Discord thread ID |
| `session_id` | TEXT | NOT NULL | Active session ID associated with this thread |
| `agent_name` | TEXT | NOT NULL | Display name of the agent |
| `agent_model` | TEXT | NOT NULL | Model identifier used for the session |
| `owner_user_id` | TEXT | NOT NULL, DEFAULT '' | Discord user ID of the thread creator |
| `topic` | TEXT | | Thread topic/description |
| `project_name` | TEXT | | Project name for context |
| `display_color` | TEXT | | Agent display color |
| `display_icon` | TEXT | | Agent display icon |
| `avatar_url` | TEXT | | Agent avatar URL |
| `creator_perm_level` | INTEGER | | Permission level of the thread creator |
| `buddy_agent_id` | TEXT | | Buddy agent ID for paired sessions |
| `buddy_agent_name` | TEXT | | Buddy agent display name |
| `buddy_max_rounds` | INTEGER | | Maximum buddy interaction rounds |
| `last_activity_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | When the session was last active |
| `created_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | When the mapping was created |

### Indexes

- `idx_discord_thread_sessions_session` on `session_id`
- `idx_discord_thread_sessions_activity` on `last_activity_at`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-30 | corvid-agent | Initial spec |
