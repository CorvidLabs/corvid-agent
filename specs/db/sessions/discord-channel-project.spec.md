---
module: discord-channel-project-db
version: 1
status: active
files:
  - server/db/discord-channel-project.ts
db_tables:
  - discord_channel_project
depends_on: []
---

# Discord Channel-Project Affinity DB

## Purpose

Tracks which project was last used in each Discord channel so that @mentions default to the channel's established context instead of the agent's global default project.

## Public API

### Exported Functions (discord-channel-project.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getChannelProjectId` | `(db: Database, channelId: string)` | `string \| null` | Returns the project ID most recently used in the channel, or null if no affinity recorded |
| `setChannelProjectId` | `(db: Database, channelId: string, projectId: string)` | `void` | Upserts the channel-project affinity. Called when a session is created with an explicit project |

## Database Schema

### `discord_channel_project` table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `channel_id` | TEXT | PRIMARY KEY | Discord channel snowflake ID |
| `project_id` | TEXT | NOT NULL | Associated project ID |
| `updated_at` | TEXT | NOT NULL | ISO datetime of last update |

## Invariants

- `channel_id` is unique — each channel has at most one project affinity
- `setChannelProjectId` uses upsert (INSERT ... ON CONFLICT DO UPDATE) so it never creates duplicates
- `getChannelProjectId` returns null (not undefined) when no affinity exists

## Behavioral Examples

- When a user starts a session in channel X with project A, `setChannelProjectId(db, X, A)` records the affinity
- Subsequent @mentions in channel X with no explicit project will use `getChannelProjectId(db, X)` → returns A
- If a different project B is later used in channel X, the affinity updates to B (upsert)

## Error Cases

- No affinity recorded for a channel: `getChannelProjectId` returns `null`, caller falls back to agent default project
- Invalid project ID: not validated at this layer — caller responsibility

## Dependencies

None. This module only depends on `bun:sqlite` Database type.

## Change Log

| Date | Change |
|------|--------|
| 2026-04-11 | Initial spec — documents channel-project affinity persistence |
