---
module: discord-config-db
version: 1
status: draft
files:
  - server/db/discord-config.ts
db_tables:
  - discord_config
  - discord_muted_users
  - discord_processed_messages
depends_on: []
---

# Discord Config DB

## Purpose

DB-backed runtime configuration for the Discord integration. Static settings (bot token, app ID, guild ID) remain environment-only. Dynamic settings (channels, users, roles, permissions, status) are stored in the `discord_config` key-value table and can be changed without restarting the server.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getDiscordConfig` | `(db: Database)` | `DiscordDynamicConfig` | Reads all rows from `discord_config` and assembles a typed config object with defaults for missing keys. Returns defaults if the table does not exist |
| `getDiscordConfigRaw` | `(db: Database)` | `Record<string, string>` | Returns all config rows as a flat key-value map without parsing. Returns `{}` if the table does not exist |
| `updateDiscordConfig` | `(db: Database, key: string, value: string)` | `void` | Upserts a single config key-value pair with `INSERT OR REPLACE` |
| `updateDiscordConfigBatch` | `(db: Database, updates: Record<string, string>)` | `number` | Upserts multiple key-value pairs inside a write transaction. Returns the count of keys written |
| `deleteDiscordConfigKey` | `(db: Database, key: string)` | `boolean` | Deletes a config key. Returns `true` if a row was removed |
| `initDiscordConfigFromEnv` | `(db: Database)` | `void` | Seeds config from environment variables using `INSERT OR IGNORE` (preserves existing DB values). Runs inside a write transaction |

### Exported Types

| Type | Description |
|------|-------------|
| `DiscordDynamicConfig` | Typed config object with fields: `additionalChannelIds`, `allowedUserIds`, `mode`, `defaultAgentId`, `publicMode`, `rolePermissions`, `defaultPermissionLevel`, `rateLimitByLevel`, `statusText`, `activityType`, `interactedUsers` |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `VALID_DISCORD_CONFIG_KEYS` | `Set<string>` | Set of 10 valid config keys that can be set via the API (excludes `interacted_users`) |

## Invariants

1. **Key-value storage**: All config is stored as string key-value pairs; parsing (comma-separated lists, JSON, booleans, integers) happens in `getDiscordConfig`
2. **Defaults on missing table**: If `discord_config` table does not exist (migrations not run), `getDiscordConfig` returns a full default config object and `getDiscordConfigRaw` returns `{}`
3. **ENV seeding is non-destructive**: `initDiscordConfigFromEnv` uses `INSERT OR IGNORE` so existing DB values always take precedence over environment variables
4. **Batch writes are transactional**: `updateDiscordConfigBatch` wraps all updates in a single `writeTransaction`
5. **Logging**: All writes are logged via `createLogger('DiscordConfig')`

## Behavioral Examples

### Scenario: Read config with defaults

- **Given** the `discord_config` table has one row: `mode = 'work_intake'`
- **When** `getDiscordConfig(db)` is called
- **Then** returns config with `mode: 'work_intake'` and all other fields at their defaults (e.g. `publicMode: false`, `activityType: 3`)

### Scenario: Seed from environment

- **Given** `DISCORD_BRIDGE_MODE=work_intake` is set and the DB has no `mode` key
- **When** `initDiscordConfigFromEnv(db)` is called
- **Then** a row `(mode, work_intake)` is inserted
- **And** if the DB already had `mode = 'chat'`, that value is preserved

### Scenario: Batch update

- **Given** an empty config table
- **When** `updateDiscordConfigBatch(db, { mode: 'chat', public_mode: 'true' })` is called
- **Then** returns `2` and both keys are inserted

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `discord_config` table does not exist | `getDiscordConfig` catches the error and returns defaults; `getDiscordConfigRaw` returns `{}` |
| Invalid JSON in `role_permissions` value | `getDiscordConfig` returns the default (empty object `{}`) for that field |
| Delete non-existent key | `deleteDiscordConfigKey` returns `false` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/pool` | `writeTransaction` for batch and env-seed operations |
| `server/lib/logger` | `createLogger('DiscordConfig')` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/bridge.ts` | `getDiscordConfig` for runtime settings |
| `server/routes/settings.ts` | All CRUD functions for the admin API |

## Database Tables

### discord_config

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | TEXT | PRIMARY KEY | Config key name (e.g. `mode`, `public_mode`) |
| `value` | TEXT | NOT NULL | Config value as string |
| `updated_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | Last update timestamp |

### discord_muted_users

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | TEXT | PRIMARY KEY | Discord user ID of the muted user |
| `muted_by` | TEXT | DEFAULT NULL | Who muted this user (agent ID or 'system') |
| `created_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | When the user was muted |

### discord_processed_messages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `message_id` | TEXT | PRIMARY KEY | Discord message ID that was processed |
| `channel_id` | TEXT | NOT NULL | Discord channel ID where the message was sent |
| `created_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | When the message was processed |

**Indexes:** `idx_discord_processed_messages_created` on `created_at`

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `DISCORD_ADDITIONAL_CHANNEL_IDS` | (none) | Comma-separated channel IDs to monitor |
| `DISCORD_ALLOWED_USER_IDS` | (none) | Comma-separated allowed user IDs |
| `DISCORD_BRIDGE_MODE` | `chat` | Bridge mode: `chat` or `work_intake` |
| `DISCORD_DEFAULT_AGENT_ID` | (none) | Default agent ID for Discord interactions |
| `DISCORD_PUBLIC_MODE` | `false` | Enable public mode |
| `DISCORD_ROLE_PERMISSIONS` | `{}` | JSON role-to-permission-level mapping |
| `DISCORD_DEFAULT_PERMISSION_LEVEL` | `1` | Default permission level |
| `DISCORD_RATE_LIMIT_BY_LEVEL` | `{}` | JSON rate limit overrides by level |
| `DISCORD_STATUS` | `corvid-agent` | Bot status text |
| `DISCORD_ACTIVITY_TYPE` | `3` | Activity type (0=Playing, 1=Streaming, 2=Listening, 3=Watching, 5=Competing) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec |
