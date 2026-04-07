---
module: discord-guild-api
version: 1
status: active
files:
  - server/discord/guild-api.ts
db_tables:
  - discord_config
depends_on:
  - specs/discord/bridge.spec.md
  - specs/db/discord-config.spec.md
---

# Discord Guild API

## Purpose

Discord Guild REST API client for fetching server roles, channels, and metadata. Used for auto-discovery so admins don't have to manually enter role IDs. Results are cached in the `discord_config` DB table and refreshed via `syncGuildData`. Includes heuristic-based role-to-permission-level suggestions for onboarding.

## Public API

### Exported Interfaces

| Interface | Description |
|-----------|-------------|
| `GuildRole` | Subset of Discord role object (id, name, color, position, managed, hoist, permissions) |
| `GuildChannel` | Subset of Discord channel object (id, name, type, position, parentId) |
| `GuildInfo` | High-level guild metadata (id, name, description, icon, rules/system channels, memberCount, fetchedAt) |
| `GuildCache` | Complete cached guild data containing info, roles, and channels arrays |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `fetchGuildRoles` | `botToken: string, guildId: string` | `Promise<GuildRole[] \| null>` | Fetch all roles in a guild via Discord REST API |
| `fetchGuildChannels` | `botToken: string, guildId: string` | `Promise<GuildChannel[] \| null>` | Fetch all channels in a guild via Discord REST API |
| `fetchGuildInfo` | `botToken: string, guildId: string` | `Promise<GuildInfo \| null>` | Fetch guild metadata including member count |
| `saveGuildCache` | `db: Database, cache: GuildCache` | `void` | Persist fetched guild data into the discord_config table |
| `loadGuildCache` | `db: Database` | `GuildCache` | Load cached guild data from DB; returns empty collections if not cached |
| `syncGuildData` | `db: Database, botToken: string, guildId: string \| undefined` | `Promise<GuildCache \| null>` | Fetch all guild data and persist to DB cache; returns null if no guild ID configured |
| `getRoleName` | `roles: GuildRole[], roleId: string` | `string` | Look up a role name from cached roles; returns role ID as fallback |
| `getChannelName` | `channels: GuildChannel[], channelId: string` | `string` | Look up a channel name from cached channels; returns channel ID as fallback |
| `isAdminRole` | `role: GuildRole` | `boolean` | Check if a role has the ADMINISTRATOR permission bit set |
| `suggestRoleMappings` | `roles: GuildRole[], guildId: string` | `Record<string, { level: number; reason: string }>` | Suggest permission level mappings based on role names and Discord permissions |

## Invariants

1. All Discord REST calls go through the `DiscordRestClient` (from rest-client module) for consistent rate-limit handling.
2. API failures return `null` rather than throwing — callers must handle missing data gracefully.
3. `syncGuildData` fetches roles, channels, and info in parallel via `Promise.all`.
4. Cache is stored as JSON strings in the `discord_config` table under keys `guild_roles_cache`, `guild_channels_cache`, and `guild_info_cache`.
5. `loadGuildCache` returns empty arrays/null on parse errors or missing data — never throws.
6. `suggestRoleMappings` skips `@everyone` (role ID === guild ID) and bot-managed roles.
7. Role mapping heuristics: admin keywords/permission → level 3, staff keywords or hoisted roles → level 2, unmapped roles fall through to `defaultPermissionLevel`.

## Behavioral Examples

1. **First-time guild sync**: `syncGuildData` fetches roles, channels, and info in parallel, persists all to DB, returns the combined cache.
2. **Partial API failure**: If `fetchGuildRoles` succeeds but `fetchGuildChannels` returns null, the cache stores the roles and skips channels — no data is lost from the successful call.
3. **No guild configured**: `syncGuildData` with `undefined` guild ID returns `null` immediately without making API calls.
4. **Role suggestion for onboarding**: `suggestRoleMappings` scans roles and returns a map of role IDs to suggested permission levels with human-readable reasons.

## Error Cases

1. Discord REST API returns non-200 status → `fetchJson` logs a warning and returns `null`.
2. Network error during fetch → caught, logged, returns `null`.
3. Corrupt JSON in `discord_config` cache → `parseJson` returns the fallback value (empty array or null).
4. Invalid permissions bigint string on a role → `isAdminRole` catches the error and returns `false`.

## Dependencies

- `server/discord/rest-client.ts` — `DiscordRestClient` for rate-limited HTTP requests to Discord API.
- `server/db/discord-config.ts` — `updateDiscordConfig` for persisting cache entries.
- `server/lib/logger.ts` — `createLogger` for structured logging.

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-03-23 | Initial spec — guild API client with cache, sync, and role suggestion heuristics |
