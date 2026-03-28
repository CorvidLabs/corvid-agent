---
module: thread-session-map
version: 1
status: draft
files:
  - server/discord/thread-session-map.ts
db_tables: []
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

## Change Log

| Version | Change |
|---------|--------|
| 1 | Initial spec |
