---
module: discord-mention-sessions
version: 1
status: draft
files:
  - server/db/discord-mention-sessions.ts
db_tables:
  - discord_mention_sessions
depends_on: []
---

# Discord Mention Sessions

## Purpose

Provides database persistence for Discord mention-reply session mappings. When a user mentions the bot and the bot responds, the association between the bot's message ID and the session info is stored so that it survives server restarts. This enables conversation continuity when users reply to bot messages after a restart.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveMentionSession` | `db: Database, botMessageId: string, info: MentionSessionInfo` | `void` | Persists a mention-reply session mapping using INSERT OR REPLACE |
| `getMentionSession` | `db: Database, botMessageId: string` | `MentionSessionInfo \| null` | Looks up a session by bot message ID; returns null if not found |
| `deleteMentionSessionsBySessionId` | `db: Database, sessionId: string` | `void` | Deletes all mention session mappings for a given session ID |
| `pruneOldMentionSessions` | `db: Database, maxAgeDays?: number` | `number` | Removes entries older than the specified age (default 7 days); returns count of deleted rows |

## Invariants

1. `saveMentionSession` uses `INSERT OR REPLACE` so calling it with an existing `botMessageId` updates the row rather than failing.
2. `getMentionSession` maps database column names (`session_id`, `agent_name`, `agent_model`) to camelCase `MentionSessionInfo` fields.
3. `pruneOldMentionSessions` defaults to 7 days when `maxAgeDays` is not provided.
4. `pruneOldMentionSessions` uses SQLite's `datetime('now', ...)` for age calculation and returns `result.changes`.
5. `deleteMentionSessionsBySessionId` deletes by `session_id`, not by `bot_message_id`.

## Behavioral Examples

### Scenario: Round-trip save and get

- **Given** an empty `discord_mention_sessions` table
- **When** `saveMentionSession(db, "msg-1", { sessionId: "sess-1", agentName: "agent-a", agentModel: "opus" })` is called
- **And** `getMentionSession(db, "msg-1")` is called
- **Then** returns `{ sessionId: "sess-1", agentName: "agent-a", agentModel: "opus" }`

### Scenario: Overwrite existing session

- **Given** a session mapping exists for `botMessageId = "msg-1"`
- **When** `saveMentionSession(db, "msg-1", { sessionId: "sess-2", agentName: "agent-b", agentModel: "sonnet" })` is called
- **Then** the existing row is replaced and `getMentionSession(db, "msg-1")` returns the new session info

### Scenario: Delete by session ID

- **Given** two bot messages map to `sessionId = "sess-1"`
- **When** `deleteMentionSessionsBySessionId(db, "sess-1")` is called
- **Then** both rows are deleted

### Scenario: Prune old sessions

- **Given** sessions exist with `created_at` timestamps spanning the last 14 days
- **When** `pruneOldMentionSessions(db, 7)` is called
- **Then** sessions older than 7 days are deleted and the count of deleted rows is returned

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getMentionSession` with non-existent bot message ID | Returns `null` |
| `deleteMentionSessionsBySessionId` with non-existent session ID | No-op (no rows affected) |
| `pruneOldMentionSessions` with no old sessions | Returns `0` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all DB operations |
| `server/discord/message-handler` | `MentionSessionInfo` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/message-handler.ts` | `saveMentionSession`, `getMentionSession` for mention-reply session tracking |

## Database Tables

### discord_mention_sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `bot_message_id` | TEXT | PRIMARY KEY | The bot's Discord message ID |
| `session_id` | TEXT | NOT NULL | The session ID associated with this mention thread |
| `agent_name` | TEXT | NOT NULL | Name of the agent that handled the mention |
| `agent_model` | TEXT | NOT NULL | Model used by the agent |
| `created_at` | TEXT | DEFAULT datetime('now') | Timestamp of when the mapping was created |

### Indexes

- `idx_discord_mention_sessions_session` on `session_id`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-16 | corvid-agent | Initial spec |
