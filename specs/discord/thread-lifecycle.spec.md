---
module: thread-lifecycle
version: 1
status: draft
files:
  - server/discord/thread-lifecycle.ts
db_tables: []
depends_on: []
---

# Discord Thread Lifecycle

## Purpose

Manages Discord thread lifecycle operations including creation, archival, and stale thread cleanup via the Discord REST API.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `archiveThread` | `(botToken: string, threadId: string)` | `Promise<void>` | Archives a single Discord thread via the REST API. |
| `createStandaloneThread` | `(botToken: string, channelId: string, name: string)` | `Promise<string \| null>` | Creates a new standalone thread in a channel. Returns the thread ID or null on failure. |
| `archiveStaleThreads` | `(botToken: string, threadSessions: Map, threadCallbacks: Map, processManager: ProcessManager, delivery: DeliveryTracker, staleThresholdMs: number, threadLastActivity: Map)` | `Promise<void>` | Archives threads that have been inactive beyond the stale threshold. Sends a notification embed before archiving. |

## Invariants

- Thread IDs must be valid Discord snowflakes (validated via assertSnowflake).
- Archival is idempotent — archiving an already-archived thread is a no-op.
- Stale thread cleanup only targets threads older than the configured threshold.

## Behavioral Examples

- archiveThread: sends PATCH to Discord API to set archived: true.
- archiveStaleThreads: iterates tracked threads, identifies stale ones, sends warning embed, then archives.

## Error Cases

- Discord API returns non-200: logs warning, does not throw.
- Invalid snowflake ID: throws via assertSnowflake.

## Dependencies

- `server/discord/embeds.ts` — embed building and Discord API helpers
- `server/discord/thread-session-map.ts` — thread session types
- `server/lib/logger.ts` — structured logging

## Change Log

| Version | Change |
|---------|--------|
| 1 | Initial spec |
