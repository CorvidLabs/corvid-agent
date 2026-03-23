/**
 * Discord Guild REST API — fetches server roles, channels, and metadata.
 *
 * Used for auto-discovery so admins don't have to manually enter role IDs.
 * Results are cached in the discord_config DB table and refreshed periodically.
 */

import type { Database } from 'bun:sqlite';
import { discordFetch } from './embeds';
import { updateDiscordConfig } from '../db/discord-config';
import { createLogger } from '../lib/logger';

const log = createLogger('DiscordGuildAPI');

// ─── Types ────────────────────────────────────────────────────────────────

/** Subset of Discord role object that we cache. */
export interface GuildRole {
    id: string;
    name: string;
    color: number;
    position: number;
    /** Bot-managed roles (integrations) — typically shouldn't be assigned permissions. */
    managed: boolean;
    /** Whether this role is displayed separately in the member list. */
    hoist: boolean;
    /** Discord permission bitfield (string). */
    permissions: string;
}

/** Subset of Discord channel object that we cache. */
export interface GuildChannel {
    id: string;
    name: string;
    /** 0=text, 2=voice, 4=category, 5=announcement, 13=stage, 15=forum, 16=media */
    type: number;
    position: number;
    parentId: string | null;
}

/** High-level guild metadata. */
export interface GuildInfo {
    id: string;
    name: string;
    description: string | null;
    /** Channel where Discord's community rules/guidelines are displayed. */
    rulesChannelId: string | null;
    /** System messages channel. */
    systemChannelId: string | null;
    memberCount?: number;
    icon: string | null;
    /** When this info was last fetched. */
    fetchedAt: string;
}

/** Complete cached guild data. */
export interface GuildCache {
    info: GuildInfo | null;
    roles: GuildRole[];
    channels: GuildChannel[];
}

// ─── Discord permission bits we care about ────────────────────────────────
const ADMINISTRATOR = 1n << 3n;

// ─── REST API calls ──────────────────────────────────────────────────────

async function fetchJson<T>(botToken: string, path: string): Promise<T | null> {
    try {
        const response = await discordFetch(
            `https://discord.com/api/v10${path}`,
            {
                method: 'GET',
                headers: { 'Authorization': `Bot ${botToken}` },
            },
        );
        if (!response.ok) {
            const error = await response.text().catch(() => '');
            log.warn(`Discord API ${path} failed`, { status: response.status, error: error.slice(0, 200) });
            return null;
        }
        return await response.json() as T;
    } catch (err) {
        log.warn(`Discord API ${path} error`, { error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}

/** Fetch all roles in the guild. */
export async function fetchGuildRoles(botToken: string, guildId: string): Promise<GuildRole[] | null> {
    const raw = await fetchJson<Array<{
        id: string; name: string; color: number; position: number;
        managed: boolean; hoist: boolean; permissions: string;
    }>>(botToken, `/guilds/${encodeURIComponent(guildId)}/roles`);
    if (!raw) return null;
    return raw.map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        managed: r.managed,
        hoist: r.hoist,
        permissions: r.permissions,
    }));
}

/** Fetch all channels in the guild. */
export async function fetchGuildChannels(botToken: string, guildId: string): Promise<GuildChannel[] | null> {
    const raw = await fetchJson<Array<{
        id: string; name: string; type: number; position: number; parent_id: string | null;
    }>>(botToken, `/guilds/${encodeURIComponent(guildId)}/channels`);
    if (!raw) return null;
    return raw.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
        parentId: c.parent_id,
    }));
}

/** Fetch guild metadata (name, description, rules channel, etc.). */
export async function fetchGuildInfo(botToken: string, guildId: string): Promise<GuildInfo | null> {
    const raw = await fetchJson<{
        id: string; name: string; description: string | null;
        rules_channel_id: string | null; system_channel_id: string | null;
        approximate_member_count?: number; icon: string | null;
    }>(botToken, `/guilds/${encodeURIComponent(guildId)}?with_counts=true`);
    if (!raw) return null;
    return {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        rulesChannelId: raw.rules_channel_id,
        systemChannelId: raw.system_channel_id,
        memberCount: raw.approximate_member_count,
        icon: raw.icon,
        fetchedAt: new Date().toISOString(),
    };
}

// ─── Cache management ────────────────────────────────────────────────────

const CACHE_DB_KEYS = {
    roles: 'guild_roles_cache',
    channels: 'guild_channels_cache',
    info: 'guild_info_cache',
} as const;

/** Persist fetched guild data into the discord_config table. */
export function saveGuildCache(db: Database, cache: GuildCache): void {
    if (cache.roles.length > 0) {
        updateDiscordConfig(db, CACHE_DB_KEYS.roles, JSON.stringify(cache.roles));
    }
    if (cache.channels.length > 0) {
        updateDiscordConfig(db, CACHE_DB_KEYS.channels, JSON.stringify(cache.channels));
    }
    if (cache.info) {
        updateDiscordConfig(db, CACHE_DB_KEYS.info, JSON.stringify(cache.info));
    }
}

/** Load cached guild data from DB. Returns empty collections if not cached. */
export function loadGuildCache(db: Database): GuildCache {
    let rows: { key: string; value: string }[];
    try {
        rows = db.query(
            `SELECT key, value FROM discord_config WHERE key IN (?, ?, ?)`,
        ).all(CACHE_DB_KEYS.roles, CACHE_DB_KEYS.channels, CACHE_DB_KEYS.info) as { key: string; value: string }[];
    } catch {
        return { info: null, roles: [], channels: [] };
    }
    const map = new Map(rows.map(r => [r.key, r.value]));
    return {
        roles: parseJson<GuildRole[]>(map.get(CACHE_DB_KEYS.roles), []),
        channels: parseJson<GuildChannel[]>(map.get(CACHE_DB_KEYS.channels), []),
        info: parseJson<GuildInfo | null>(map.get(CACHE_DB_KEYS.info), null),
    };
}

function parseJson<T>(value: string | undefined, fallback: T): T {
    if (!value) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
}

// ─── Full sync ───────────────────────────────────────────────────────────

/**
 * Fetch all guild data and persist to DB cache.
 * Returns the fetched data, or null if the guild ID is not configured.
 */
export async function syncGuildData(
    db: Database,
    botToken: string,
    guildId: string | undefined,
): Promise<GuildCache | null> {
    if (!guildId) {
        log.debug('No guild ID configured, skipping guild sync');
        return null;
    }

    log.info('Syncing guild data from Discord', { guildId });

    const [roles, channels, info] = await Promise.all([
        fetchGuildRoles(botToken, guildId),
        fetchGuildChannels(botToken, guildId),
        fetchGuildInfo(botToken, guildId),
    ]);

    const cache: GuildCache = {
        roles: roles ?? [],
        channels: channels ?? [],
        info: info ?? null,
    };

    if (roles || channels || info) {
        saveGuildCache(db, cache);
        log.info('Guild data synced', {
            roles: cache.roles.length,
            channels: cache.channels.length,
            guildName: cache.info?.name,
        });
    } else {
        log.warn('Failed to fetch any guild data from Discord');
    }

    return cache;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Look up a role name from cached roles. Returns the role ID as fallback. */
export function getRoleName(roles: GuildRole[], roleId: string): string {
    const role = roles.find(r => r.id === roleId);
    return role ? role.name : roleId;
}

/** Look up a channel name from cached channels. Returns the channel ID as fallback. */
export function getChannelName(channels: GuildChannel[], channelId: string): string {
    const ch = channels.find(c => c.id === channelId);
    return ch ? `#${ch.name}` : channelId;
}

/**
 * Check if a role has the ADMINISTRATOR permission.
 * Roles with this bit should typically be mapped to ADMIN level.
 */
export function isAdminRole(role: GuildRole): boolean {
    try {
        return (BigInt(role.permissions) & ADMINISTRATOR) !== 0n;
    } catch {
        return false;
    }
}

/**
 * Suggest permission level mappings based on guild roles.
 * Uses heuristics:
 * - @everyone → skip (use defaultPermissionLevel instead)
 * - Managed (bot) roles → skip
 * - Admin permission → ADMIN (3)
 * - Roles with "mod", "staff", "team" in name → STANDARD (2)
 * - Other hoisted roles → STANDARD (2)
 * - All others → not mapped (fall through to default)
 */
export function suggestRoleMappings(roles: GuildRole[], guildId: string): Record<string, { level: number; reason: string }> {
    const suggestions: Record<string, { level: number; reason: string }> = {};

    for (const role of roles) {
        // Skip @everyone (same ID as guild)
        if (role.id === guildId) continue;
        // Skip bot-managed roles
        if (role.managed) continue;

        const nameLower = role.name.toLowerCase();

        if (isAdminRole(role)) {
            suggestions[role.id] = { level: 3, reason: 'Has Administrator permission' };
        } else if (/\b(admin|owner|council|founder)\b/i.test(nameLower)) {
            suggestions[role.id] = { level: 3, reason: `Role name contains admin keyword` };
        } else if (/\b(mod|moderator|staff|team|manager|lead)\b/i.test(nameLower)) {
            suggestions[role.id] = { level: 2, reason: `Role name contains staff keyword` };
        } else if (/\b(member|verified|trusted|community|vip)\b/i.test(nameLower)) {
            suggestions[role.id] = { level: 2, reason: `Role name suggests trusted member` };
        } else if (role.hoist && role.position > 1) {
            suggestions[role.id] = { level: 2, reason: 'Hoisted role (displayed separately)' };
        }
        // Roles not matched get no suggestion — they'll use defaultPermissionLevel
    }

    return suggestions;
}
