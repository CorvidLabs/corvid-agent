---
module: discord-mention-sessions
version: 1
status: draft
files:
  - server/db/discord-mention-sessions.ts
db_tables:
  - discord_mention_sessions
depends_on:
  - specs/db/migrations.spec.md
---

# Discord Mention Sessions

## Purpose

Persists Discord mention-reply session mappings so they survive server restarts. When a bot replies to a mention, the mapping between the bot's message ID and the ongoing session info (session ID, agent name, model) is stored in the `discord_mention_sessions` table. On server restart, the bot can look up this mapping when a user replies to one of its messages, enabling conversation continuity.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveMentionSession` | `db: Database, botMessageId: string, info: MentionSessionInfo` | `void` | Persists a mention-reply session mapping using INSERT OR REPLACE |
| `getMentionSession` | `db: Database, botMessageId: string` | `MentionSessionInfo \| null` | Looks up a session by bot message ID; returns null if not found |
| `deleteMentionSessionsBySessionId` | `db: Database, sessionId: string` | `void` | Removes all mention session entries for a given session ID |
| `getRecentMentionSessions` | `db: Database, maxAgeHours?: number` | `Array<{ botMessageId: string; info: MentionSessionInfo; createdAt: string }>` | Loads recent mention sessions from the database for recovery after restart (default: 24 hours) |
| `pruneOldMentionSessions` | `db: Database, maxAgeDays?: number` | `number` | Deletes rows older than the specified age (default 7 days); returns the number of deleted rows |

## Invariants

1. `saveMentionSession` uses `INSERT OR REPLACE` so updating the same `bot_message_id` is idempotent.
2. `getMentionSession` returns `null` when no matching row exists.
3. `deleteMentionSessionsBySessionId` deletes all rows for the session; a session may have multiple bot message IDs.
4. `pruneOldMentionSessions` defaults to a 7-day retention window if `maxAgeDays` is not provided.
5. `pruneOldMentionSessions` returns the actual number of rows deleted (may be 0).
6. An index on `session_id` exists to make `deleteMentionSessionsBySessionId` efficient.
7. `getRecentMentionSessions` defaults to a 24-hour lookback window if `maxAgeHours` is not provided.
8. `getRecentMentionSessions` returns results ordered by `created_at` descending (most recent first).

## Behavioral Examples

### Scenario: Save and retrieve a session

- **Given** a bot message ID `"msg-abc"` and session info `{ sessionId: "s1", agentName: "Corvid", agentModel: "claude-3" }`
- **When** `saveMentionSession(db, "msg-abc", info)` is called
- **Then** `getMentionSession(db, "msg-abc")` returns `{ sessionId: "s1", agentName: "Corvid", agentModel: "claude-3" }`

### Scenario: Overwrite existing session

- **Given** a session mapping exists for `botMessageId = "msg-1"`
- **When** `saveMentionSession(db, "msg-1", { sessionId: "sess-2", agentName: "agent-b", agentModel: "sonnet" })` is called
- **Then** the existing row is replaced and `getMentionSession(db, "msg-1")` returns the new session info

### Scenario: Lookup for unknown message returns null

- **Given** no rows in `discord_mention_sessions`
- **When** `getMentionSession(db, "unknown-id")` is called
- **Then** returns `null`

### Scenario: Delete by session ID removes all related mappings

- **Given** two bot messages `"msg-1"` and `"msg-2"` both mapped to session `"s1"`
- **When** `deleteMentionSessionsBySessionId(db, "s1")` is called
- **Then** both rows are removed; `getMentionSession` for either message returns `null`

### Scenario: Prune old sessions

- **Given** two rows: one created 10 days ago, one created 3 days ago
- **When** `pruneOldMentionSessions(db, 7)` is called
- **Then** the 10-day-old row is deleted, the 3-day-old row is kept; return value is `1`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getMentionSession` with non-existent bot message ID | Returns `null` |
| `deleteMentionSessionsBySessionId` with no matching rows | Runs without error; no rows deleted |
| `pruneOldMentionSessions` with no rows meeting threshold | Returns `0` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all DB operations |
| `server/discord/message-handler` | `MentionSessionInfo` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/message-handler.ts` | `saveMentionSession` on mention reply, `getMentionSession` on incoming reply, `deleteMentionSessionsBySessionId` on session end |
| `server/discord/thread-manager.ts` | `getRecentMentionSessions` for recovering mention sessions on startup |

## Database Tables

### discord_mention_sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `bot_message_id` | TEXT | PRIMARY KEY | Discord message ID of the bot's reply |
| `session_id` | TEXT | NOT NULL | Active session ID associated with this mention reply |
| `agent_name` | TEXT | NOT NULL | Display name of the agent that handled the mention |
| `agent_model` | TEXT | NOT NULL | Model identifier used for the session |
| `project_name` | TEXT | | Project name for embed footer context (migration 093) |
| `channel_id` | TEXT | | Discord channel ID where the mention originated (migration 096) |
| `conversation_only` | INTEGER | DEFAULT 0 | Whether this session is conversation-only mode (no work tasks) |
| `created_at` | TEXT | DEFAULT `datetime('now')` | When the mapping was created |

### Indexes

- `idx_discord_mention_sessions_session` on `session_id`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-16 | corvid-agent | Initial spec (mention-reply persistence, migration 092) |
| 2026-03-20 | corvid-agent | Add channel_id column (migration 096) |
