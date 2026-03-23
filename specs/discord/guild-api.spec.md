---
module: discord-guild-api
version: 1
status: draft
files:
  - server/discord/guild-api.ts
db_tables:
  - discord_config
depends_on:
  - specs/discord/bridge.spec.md
---

# Discord Guild API

## Purpose

Fetches Discord guild metadata (roles, channels, server info) via the REST API and caches the results in the `discord_config` DB table. Used for auto-discovery so admins don't have to manually enter role IDs when configuring permission mappings. Includes heuristic-based role-to-permission-level suggestions.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `GuildRole` | Subset of Discord role object: `id`, `name`, `color`, `position`, `managed`, `hoist`, `permissions` |
| `GuildChannel` | Subset of Discord channel object: `id`, `name`, `type`, `position`, `parentId` |
| `GuildInfo` | Guild metadata: `id`, `name`, `description`, `rulesChannelId`, `systemChannelId`, `memberCount`, `icon`, `fetchedAt` |
| `GuildCache` | Complete cached guild data: `{ info: GuildInfo \| null, roles: GuildRole[], channels: GuildChannel[] }` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `fetchGuildRoles` | `botToken: string, guildId: string` | `Promise<GuildRole[] \| null>` | Fetches all roles in a guild via Discord REST API |
| `fetchGuildChannels` | `botToken: string, guildId: string` | `Promise<GuildChannel[] \| null>` | Fetches all channels in a guild via Discord REST API |
| `fetchGuildInfo` | `botToken: string, guildId: string` | `Promise<GuildInfo \| null>` | Fetches guild metadata (name, description, member count, etc.) |
| `saveGuildCache` | `db: Database, cache: GuildCache` | `void` | Persists fetched guild data into `discord_config` table |
| `loadGuildCache` | `db: Database` | `GuildCache` | Loads cached guild data from DB; returns empty collections if not cached |
| `syncGuildData` | `db: Database, botToken: string, guildId: string \| undefined` | `Promise<GuildCache \| null>` | Fetches all guild data in parallel and persists to DB cache |
| `getRoleName` | `roles: GuildRole[], roleId: string` | `string` | Looks up a role name from cached roles; returns role ID as fallback |
| `getChannelName` | `channels: GuildChannel[], channelId: string` | `string` | Looks up a channel name from cached channels; returns channel ID as fallback |
| `isAdminRole` | `role: GuildRole` | `boolean` | Checks if a role has the ADMINISTRATOR permission bit set |
| `suggestRoleMappings` | `roles: GuildRole[], guildId: string` | `Record<string, { level: number; reason: string }>` | Suggests permission level mappings using heuristics based on role names, permissions, and hoisted status |

## Invariants

1. `fetchGuildRoles`, `fetchGuildChannels`, and `fetchGuildInfo` return `null` on any API error (never throw).
2. `saveGuildCache` only writes entries for non-empty collections (roles/channels with length > 0, info when non-null).
3. `loadGuildCache` returns `{ info: null, roles: [], channels: [] }` on any DB or parse error.
4. `syncGuildData` returns `null` immediately if `guildId` is undefined.
5. `syncGuildData` fetches roles, channels, and info in parallel via `Promise.all`.
6. `suggestRoleMappings` skips the `@everyone` role (ID matches guild ID) and bot-managed roles.
7. Cache data is stored as JSON strings under keys `guild_roles_cache`, `guild_channels_cache`, `guild_info_cache` in `discord_config`.

## Behavioral Examples

### Scenario: Successful guild sync

- **Given** a valid bot token and guild ID
- **When** `syncGuildData(db, token, guildId)` is called
- **Then** fetches roles, channels, and info in parallel, saves to DB, and returns the `GuildCache`

### Scenario: No guild ID configured

- **Given** `guildId` is `undefined`
- **When** `syncGuildData(db, token, undefined)` is called
- **Then** returns `null` without making any API calls

### Scenario: Role permission suggestion

- **Given** a role with ADMINISTRATOR bit set in `permissions`
- **When** `suggestRoleMappings` processes the role
- **Then** suggests level 3 with reason "Has Administrator permission"

### Scenario: Loading empty cache

- **Given** no guild data has been cached in `discord_config`
- **When** `loadGuildCache(db)` is called
- **Then** returns `{ info: null, roles: [], channels: [] }`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Discord API returns non-200 | `fetchJson` logs warning and returns `null` |
| Discord API network error | `fetchJson` catches error, logs warning, returns `null` |
| Invalid JSON in DB cache | `parseJson` returns the provided fallback value |
| DB query error in `loadGuildCache` | Returns empty `GuildCache` |
| Invalid BigInt in `isAdminRole` | Returns `false` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `server/discord/embeds` | `discordFetch` for authenticated HTTP requests |
| `server/db/discord-config` | `updateDiscordConfig` for persisting cache entries |
| `server/lib/logger` | `createLogger('DiscordGuildAPI')` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/admin-commands.ts` | `syncGuildData` for `/admin sync` command |
| `client/src/app/features/settings/settings.component.ts` | Guild role data displayed in role permission picker UI |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-23 | corvid-agent | Initial spec |
