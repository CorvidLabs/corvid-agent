import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    getRoleName,
    getChannelName,
    isAdminRole,
    suggestRoleMappings,
    saveGuildCache,
    loadGuildCache,
    type GuildRole,
    type GuildChannel,
} from '../discord/guild-api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRole(overrides: Partial<GuildRole> = {}): GuildRole {
    return {
        id: 'role-1',
        name: 'TestRole',
        color: 0,
        position: 1,
        managed: false,
        hoist: false,
        permissions: '0',
        ...overrides,
    };
}

function makeChannel(overrides: Partial<GuildChannel> = {}): GuildChannel {
    return {
        id: 'chan-1',
        name: 'general',
        type: 0,
        position: 0,
        parentId: null,
        ...overrides,
    };
}

// ─── getRoleName ─────────────────────────────────────────────────────────────

describe('getRoleName', () => {
    test('returns role name when found', () => {
        const roles = [makeRole({ id: 'r1', name: 'Admin' })];
        expect(getRoleName(roles, 'r1')).toBe('Admin');
    });

    test('returns roleId as fallback when not found', () => {
        const roles = [makeRole({ id: 'r1', name: 'Admin' })];
        expect(getRoleName(roles, 'unknown-role')).toBe('unknown-role');
    });

    test('returns roleId when roles array is empty', () => {
        expect(getRoleName([], 'r1')).toBe('r1');
    });
});

// ─── getChannelName ───────────────────────────────────────────────────────────

describe('getChannelName', () => {
    test('returns #channelname format when found', () => {
        const channels = [makeChannel({ id: 'c1', name: 'general' })];
        expect(getChannelName(channels, 'c1')).toBe('#general');
    });

    test('returns channelId as fallback when not found', () => {
        const channels = [makeChannel({ id: 'c1', name: 'general' })];
        expect(getChannelName(channels, 'unknown')).toBe('unknown');
    });

    test('returns channelId when channels array is empty', () => {
        expect(getChannelName([], 'c1')).toBe('c1');
    });
});

// ─── isAdminRole ──────────────────────────────────────────────────────────────

describe('isAdminRole', () => {
    test('returns true when role has Administrator permission bit (8)', () => {
        const role = makeRole({ permissions: '8' }); // bit 3 = 1n << 3n = 8
        expect(isAdminRole(role)).toBe(true);
    });

    test('returns false for role with no permissions', () => {
        const role = makeRole({ permissions: '0' });
        expect(isAdminRole(role)).toBe(false);
    });

    test('returns true when permissions include admin bit in larger set', () => {
        // e.g. SEND_MESSAGES (0x800) | ADMINISTRATOR (0x8) = 0x808 = 2056
        const role = makeRole({ permissions: '2056' });
        expect(isAdminRole(role)).toBe(true);
    });

    test('returns false when permissions don\'t include admin bit', () => {
        // SEND_MESSAGES = 0x800 = 2048
        const role = makeRole({ permissions: '2048' });
        expect(isAdminRole(role)).toBe(false);
    });

    test('returns false for invalid permissions string (error handling)', () => {
        const role = makeRole({ permissions: 'not-a-number' });
        expect(isAdminRole(role)).toBe(false);
    });
});

// ─── suggestRoleMappings ──────────────────────────────────────────────────────

describe('suggestRoleMappings', () => {
    const GUILD_ID = 'guild-123';

    test('skips @everyone (roleId === guildId)', () => {
        const roles = [makeRole({ id: GUILD_ID, name: '@everyone' })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result[GUILD_ID]).toBeUndefined();
    });

    test('skips bot-managed roles', () => {
        const roles = [makeRole({ id: 'bot-role', name: 'SomeBot', managed: true })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result['bot-role']).toBeUndefined();
    });

    test('maps role with Administrator permission to level 3', () => {
        const roles = [makeRole({ id: 'admin-role', permissions: '8', name: 'Owner' })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result['admin-role']?.level).toBe(3);
    });

    test('maps role named "admin" to level 3', () => {
        const roles = [makeRole({ id: 'r1', name: 'Admin' })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result['r1']?.level).toBe(3);
    });

    test('maps role named "owner" to level 3', () => {
        const roles = [makeRole({ id: 'r1', name: 'Server Owner' })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result['r1']?.level).toBe(3);
    });

    test('maps role named "moderator" to level 2', () => {
        const roles = [makeRole({ id: 'r1', name: 'Moderator' })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result['r1']?.level).toBe(2);
    });

    test('maps role named "staff" to level 2', () => {
        const roles = [makeRole({ id: 'r1', name: 'Staff Team' })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result['r1']?.level).toBe(2);
    });

    test('maps role named "member" to level 2', () => {
        const roles = [makeRole({ id: 'r1', name: 'Member' })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result['r1']?.level).toBe(2);
    });

    test('maps hoisted role with position > 1 to level 2', () => {
        const roles = [makeRole({ id: 'r1', name: 'Regulars', hoist: true, position: 2 })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result['r1']?.level).toBe(2);
    });

    test('does not map hoisted role with position <= 1', () => {
        const roles = [makeRole({ id: 'r1', name: 'Basic', hoist: true, position: 1 })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result['r1']).toBeUndefined();
    });

    test('returns no entry for unmapped plain role', () => {
        const roles = [makeRole({ id: 'r1', name: 'SomeRandomRole', hoist: false, position: 0 })];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(result['r1']).toBeUndefined();
    });

    test('processes multiple roles correctly', () => {
        const roles = [
            makeRole({ id: GUILD_ID, name: '@everyone' }),            // skipped
            makeRole({ id: 'bot', name: 'BotRole', managed: true }), // skipped
            makeRole({ id: 'admin', name: 'Admin', permissions: '8' }), // level 3
            makeRole({ id: 'mod', name: 'Moderator' }),               // level 2
        ];
        const result = suggestRoleMappings(roles, GUILD_ID);
        expect(Object.keys(result)).toHaveLength(2);
        expect(result['admin']?.level).toBe(3);
        expect(result['mod']?.level).toBe(2);
    });
});

// ─── saveGuildCache / loadGuildCache ──────────────────────────────────────────

describe('saveGuildCache / loadGuildCache', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        runMigrations(db);
    });

    test('loadGuildCache returns empty collections when nothing cached', () => {
        const cache = loadGuildCache(db);
        expect(cache.roles).toEqual([]);
        expect(cache.channels).toEqual([]);
        expect(cache.info).toBeNull();
    });

    test('round-trips roles correctly', () => {
        const roles: GuildRole[] = [
            makeRole({ id: 'r1', name: 'Admin', permissions: '8' }),
            makeRole({ id: 'r2', name: 'Member', permissions: '0' }),
        ];
        saveGuildCache(db, { roles, channels: [], info: null });
        const loaded = loadGuildCache(db);
        expect(loaded.roles).toHaveLength(2);
        expect(loaded.roles[0]?.id).toBe('r1');
        expect(loaded.roles[1]?.name).toBe('Member');
    });

    test('round-trips channels correctly', () => {
        const channels: GuildChannel[] = [
            makeChannel({ id: 'c1', name: 'general', type: 0 }),
            makeChannel({ id: 'c2', name: 'announcements', type: 5 }),
        ];
        saveGuildCache(db, { roles: [], channels, info: null });
        const loaded = loadGuildCache(db);
        expect(loaded.channels).toHaveLength(2);
        expect(loaded.channels[0]?.name).toBe('general');
        expect(loaded.channels[1]?.type).toBe(5);
    });

    test('does not save roles when array is empty (preserves existing)', () => {
        // First save roles
        const roles: GuildRole[] = [makeRole({ id: 'r1' })];
        saveGuildCache(db, { roles, channels: [], info: null });
        // Then save with empty roles (should not overwrite)
        saveGuildCache(db, { roles: [], channels: [], info: null });
        const loaded = loadGuildCache(db);
        expect(loaded.roles).toHaveLength(1);
    });

    test('handles corrupt JSON in DB gracefully', () => {
        // Insert corrupt JSON directly
        db.query(`INSERT OR REPLACE INTO discord_config (key, value) VALUES (?, ?)`)
            .run('guild_roles_cache', 'not valid json {{{');
        const cache = loadGuildCache(db);
        expect(cache.roles).toEqual([]);
    });
});
