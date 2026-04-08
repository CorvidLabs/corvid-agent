---
module: thread-session-map
version: 1
status: active
files:
  - server/discord/thread-session-map.ts
  - server/db/discord-thread-sessions.ts
db_tables:
  - discord_thread_sessions
depends_on: []
---

# Discord Thread Session Map

## Purpose

Owns the in-memory state types for thread-based Discord conversations and the DB-backed recovery logic for restoring thread-to-session mappings after server restart.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `ThreadSessionInfo` | Session metadata for a Discord thread: session ID, agent name/model, owner, topic, project, display settings, permission level, and optional buddy config. |
| `ThreadCallbackInfo` | Associates a session ID with its event callback for a Discord thread. |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `normalizeTimestamp` | `(ts: string)` | `string` | Normalizes a timestamp string for consistent comparison. |
| `formatDuration` | `(ms: number)` | `string` | Formats a duration in milliseconds to a human-readable string. |
| `tryRecoverThread` | `(db: Database, threadSessions: Map, threadId: string)` | `ThreadSessionInfo \| null` | Attempts to recover a thread-to-session mapping from the database when not found in memory. Returns the recovered info or null. |

### Exported Functions (discord-thread-sessions.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveThreadSession` | `(db: Database, threadId: string, info: ThreadSessionInfo)` | `void` | Persists a thread session mapping to the database (INSERT OR REPLACE). |
| `getThreadSession` | `(db: Database, threadId: string)` | `ThreadSessionInfo \| null` | Looks up a thread session by Discord thread ID. Returns null if not found. |
| `updateThreadSessionActivity` | `(db: Database, threadId: string)` | `void` | Updates the `last_activity_at` timestamp for a thread session. |
| `getRecentThreadSessions` | `(db: Database, maxAgeHours?: number)` | `Array<{ threadId, info, lastActivityAt }>` | Bulk-loads recent thread sessions for startup recovery (default: 48 hours). |
| `deleteThreadSession` | `(db: Database, threadId: string)` | `void` | Deletes a thread session (e.g. on archival). |
| `pruneOldThreadSessions` | `(db: Database, maxAgeDays?: number)` | `number` | Removes thread session entries older than the specified age (default: 14 days). Returns count of deleted rows. |

## Invariants

- ThreadSessionInfo always contains sessionId, agentName, agentModel, and ownerUserId.
- tryRecoverThread only recovers from DB if the thread is not already in the in-memory map.
- Recovery populates the in-memory map on success.

## Behavioral Examples

- Server restart: threads in active Discord conversations are recovered from DB on first message.
- formatDuration(3661000) returns "1h 1m".

## Error Cases

- DB query failure in tryRecoverThread: returns null, does not throw.
- Missing session in DB: returns null.

## Dependencies

- `bun:sqlite` — database access
- `server/lib/logger.ts` — structured logging

## Database Tables

### discord_thread_sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| thread_id | TEXT | PRIMARY KEY | Discord thread ID |
| session_id | TEXT | NOT NULL | Agent session ID |
| agent_name | TEXT | NOT NULL | Name of the agent handling the thread |
| agent_model | TEXT | NOT NULL | Model used by the agent |
| owner_user_id | TEXT | NOT NULL DEFAULT '' | Discord user who created the thread |
| topic | TEXT | | Thread topic |
| project_name | TEXT | | Associated project name |
| display_color | TEXT | | Agent display color |
| display_icon | TEXT | | Agent display icon |
| avatar_url | TEXT | | Agent avatar URL |
| creator_perm_level | INTEGER | | Creator permission level |
| buddy_agent_id | TEXT | | Buddy agent ID (if buddy mode) |
| buddy_agent_name | TEXT | | Buddy agent name |
| buddy_max_rounds | INTEGER | | Max buddy interaction rounds |
| last_activity_at | TEXT | NOT NULL DEFAULT datetime('now') | Last activity timestamp |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | Creation timestamp |

## Change Log

| Version | Change |
|---------|--------|
| 2 | Add discord-thread-sessions.ts DB persistence layer and discord_thread_sessions table |
| 1 | Initial spec |
