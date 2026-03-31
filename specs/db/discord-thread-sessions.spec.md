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

Persists Discord thread-to-session mappings so they survive server restarts. When a bot creates a thread via `/session`, the mapping between the Discord thread ID and session info (session ID, agent, model, owner, topic) is stored in the `discord_thread_sessions` table. On restart, the bot recovers these mappings for conversation continuity.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveThreadSession` | `db: Database, threadId: string, info: ThreadSessionInfo` | `void` | Persists a thread session mapping using INSERT OR REPLACE |
| `getThreadSession` | `db: Database, threadId: string` | `ThreadSessionInfo \| null` | Looks up a session by thread ID; returns null if not found |
| `updateThreadSessionActivity` | `db: Database, threadId: string` | `void` | Updates the `last_activity_at` timestamp to current time |
| `getRecentThreadSessions` | `db: Database, maxAgeHours?: number` | `Array<{ threadId: string; info: ThreadSessionInfo; lastActivityAt: number }>` | Bulk-load recent thread sessions for startup recovery. Default max age is 48 hours |
| `deleteThreadSession` | `db: Database, threadId: string` | `void` | Delete a thread session (e.g. on archival) |
| `pruneOldThreadSessions` | `db: Database, maxAgeDays?: number` | `number` | Remove entries older than the specified age (default 14 days). Returns count deleted |

## Invariants

1. `saveThreadSession` uses `INSERT OR REPLACE` so updating the same `thread_id` is idempotent.
2. `getThreadSession` returns `null` when no matching row exists.
3. `getRecentThreadSessions` appends 'Z' to timestamps if missing for correct UTC parsing.
4. `pruneOldThreadSessions` returns the actual number of rows deleted (may be 0).
5. `buddyConfig` is reconstructed from individual columns only when both `buddy_agent_id` and `buddy_agent_name` are non-null.

## Behavioral Examples

### Scenario: Save and retrieve a session

- **Given** a thread ID `"thread-123"` and session info with agent "Corvid"
- **When** `saveThreadSession(db, "thread-123", info)` is called
- **Then** `getThreadSession(db, "thread-123")` returns the matching `ThreadSessionInfo`

### Scenario: Lookup for unknown thread returns null

- **Given** no rows in `discord_thread_sessions`
- **When** `getThreadSession(db, "unknown-id")` is called
- **Then** returns `null`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getThreadSession` with non-existent thread ID | Returns `null` |
| `deleteThreadSession` with no matching row | Runs without error |
| `pruneOldThreadSessions` with no rows meeting threshold | Returns `0` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `server/discord/thread-session-map` | `ThreadSessionInfo` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/thread-manager.ts` | `getRecentThreadSessions` for startup recovery |

## Database Tables

### discord_thread_sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `thread_id` | TEXT | PRIMARY KEY | Discord thread ID |
| `session_id` | TEXT | NOT NULL | Active session ID |
| `agent_name` | TEXT | NOT NULL | Agent display name |
| `agent_model` | TEXT | NOT NULL | Model identifier |
| `owner_user_id` | TEXT | NOT NULL, DEFAULT '' | Discord user who created the session |
| `topic` | TEXT | | Thread topic |
| `project_name` | TEXT | | Project name context |
| `display_color` | TEXT | | Agent display color |
| `display_icon` | TEXT | | Agent display icon |
| `avatar_url` | TEXT | | Agent avatar URL |
| `creator_perm_level` | INTEGER | | Permission level of session creator |
| `buddy_agent_id` | TEXT | | Buddy mode agent ID |
| `buddy_agent_name` | TEXT | | Buddy mode agent name |
| `buddy_max_rounds` | INTEGER | | Max buddy exchange rounds |
| `last_activity_at` | TEXT | NOT NULL, DEFAULT datetime('now') | Last activity timestamp |
| `created_at` | TEXT | NOT NULL, DEFAULT datetime('now') | Creation timestamp |

### Indexes

- `idx_discord_thread_sessions_session` on `session_id`
- `idx_discord_thread_sessions_activity` on `last_activity_at`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-30 | corvid-agent | Initial spec (migration 112) |
