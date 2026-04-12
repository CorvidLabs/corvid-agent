---
module: telegram-config-db
version: 1
status: draft
files:
  - server/db/telegram-config.ts
db_tables:
  - telegram_config
depends_on: []
---

# Telegram Config DB

## Purpose

DB-backed runtime configuration for the Telegram integration. Static settings (bot token, chat ID) remain environment-only. Dynamic settings (allowed users, mode) are stored in the `telegram_config` key-value table and can be changed without restarting the server.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getTelegramConfig` | `(db: Database)` | `TelegramDynamicConfig` | Reads all rows from `telegram_config` and assembles a typed config object with defaults for missing keys. Returns defaults if the table does not exist |
| `getTelegramConfigRaw` | `(db: Database)` | `Record<string, string>` | Returns all config rows as a flat key-value map without parsing. Returns `{}` if the table does not exist |
| `updateTelegramConfigBatch` | `(db: Database, updates: Record<string, string>)` | `number` | Upserts multiple key-value pairs inside a write transaction. Returns the count of keys written |
| `initTelegramConfigFromEnv` | `(db: Database)` | `void` | Seeds config from environment variables using `INSERT OR IGNORE` (preserves existing DB values). Runs inside a write transaction |

### Exported Types

| Type | Description |
|------|-------------|
| `TelegramDynamicConfig` | Typed config object with fields: `allowedUserIds` (string array), `mode` (`'chat'` or `'work_intake'`) |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `VALID_TELEGRAM_CONFIG_KEYS` | `Set<string>` | Set of valid config keys that can be set via the API: `allowed_user_ids`, `mode` |

## Invariants

1. **Key-value storage**: All config is stored as string key-value pairs; parsing (comma-separated lists) happens in `getTelegramConfig`
2. **Defaults on missing table**: If `telegram_config` table does not exist (migrations not run), `getTelegramConfig` returns a full default config object and `getTelegramConfigRaw` returns `{}`
3. **ENV seeding is non-destructive**: `initTelegramConfigFromEnv` uses `INSERT OR IGNORE` so existing DB values always take precedence over environment variables
4. **Batch writes are transactional**: `updateTelegramConfigBatch` wraps all updates in a single `writeTransaction`
5. **Logging**: All writes are logged via `createLogger('TelegramConfig')`

## Behavioral Examples

### Scenario: Read config with defaults

- **Given** the `telegram_config` table has one row: `mode = 'work_intake'`
- **When** `getTelegramConfig(db)` is called
- **Then** returns config with `mode: 'work_intake'` and `allowedUserIds: []` (default)

### Scenario: Seed from environment

- **Given** `TELEGRAM_BRIDGE_MODE=work_intake` is set and the DB has no `mode` key
- **When** `initTelegramConfigFromEnv(db)` is called
- **Then** a row `(mode, work_intake)` is inserted
- **And** if the DB already had `mode = 'chat'`, that value is preserved

### Scenario: Batch update

- **Given** an empty config table
- **When** `updateTelegramConfigBatch(db, { mode: 'chat', allowed_user_ids: '123,456' })` is called
- **Then** returns `2` and both keys are inserted

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `telegram_config` table does not exist | `getTelegramConfig` catches the error and returns defaults; `getTelegramConfigRaw` returns `{}` |
| Empty `allowed_user_ids` value | `getTelegramConfig` returns empty array for `allowedUserIds` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/pool` | `writeTransaction` for batch and env-seed operations |
| `server/lib/logger` | `createLogger('TelegramConfig')` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/telegram/bridge.ts` | `getTelegramConfig` for runtime settings |
| `server/routes/settings.ts` | CRUD functions for the admin API |

## Database Tables

### telegram_config

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | TEXT | PRIMARY KEY | Config key name (e.g. `mode`, `allowed_user_ids`) |
| `value` | TEXT | NOT NULL | Config value as string |
| `updated_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | Last update timestamp |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `TELEGRAM_ALLOWED_USER_IDS` | (none) | Comma-separated allowed Telegram user IDs |
| `TELEGRAM_BRIDGE_MODE` | `chat` | Bridge mode: `chat` or `work_intake` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-11 | corvid-agent | Initial spec |
