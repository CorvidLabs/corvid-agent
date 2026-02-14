import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { resetDiscordRoleConfigCache } from '../discord/configuration';
import { cleanupOrphanRoles } from '../discord/role-sync-service';
import type { GuildMemberRoles } from '../discord/role-sync-service';

// Test role snowflakes
const ROLE_VERIFIED = '10000000000000001';
const ROLE_NFT = '10000000000000002';
const ROLE_LP = '10000000000000003';
const ROLE_T1 = '10000000000000004';

const ENV_VARS = [
    'ROLE_VERIFIED_ID',
    'ROLE_NFT_HOLDER_ID',
    'ROLE_LP_PROVIDER_ID',
    'ROLE_TIER1_ID',
    'ROLE_TIER2_ID',
    'ROLE_TIER3_ID',
];

describe('cleanupOrphanRoles', () => {
    let savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        savedEnv = {};
        for (const key of ENV_VARS) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
        resetDiscordRoleConfigCache();
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        resetDiscordRoleConfigCache();
    });

    it('returns empty result when no roles configured', () => {
        const members: GuildMemberRoles[] = [
            { memberId: 'user1', currentRoles: new Set(['some-role']) },
        ];
        const result = cleanupOrphanRoles(members, new Set());
        expect(result.removals).toHaveLength(0);
        expect(result.totalRemovals).toBe(0);
    });

    it('does not flag verified members for removal', () => {
        process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
        resetDiscordRoleConfigCache();

        const members: GuildMemberRoles[] = [
            { memberId: 'user1', currentRoles: new Set([ROLE_VERIFIED]) },
        ];
        const verifiedIds = new Set(['user1']);

        const result = cleanupOrphanRoles(members, verifiedIds);
        expect(result.removals).toHaveLength(0);
        expect(result.totalRemovals).toBe(0);
    });

    it('flags non-verified members with managed roles for removal', () => {
        process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
        process.env.ROLE_NFT_HOLDER_ID = ROLE_NFT;
        resetDiscordRoleConfigCache();

        const members: GuildMemberRoles[] = [
            { memberId: 'orphan1', currentRoles: new Set([ROLE_VERIFIED, ROLE_NFT]) },
        ];
        const verifiedIds = new Set<string>();

        const result = cleanupOrphanRoles(members, verifiedIds);
        expect(result.removals).toHaveLength(1);
        expect(result.removals[0].memberId).toBe('orphan1');
        expect(result.removals[0].roleIds).toContain(ROLE_VERIFIED);
        expect(result.removals[0].roleIds).toContain(ROLE_NFT);
        expect(result.totalRemovals).toBe(2);
    });

    it('removes the Verified role from orphaned members', () => {
        process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
        resetDiscordRoleConfigCache();

        const members: GuildMemberRoles[] = [
            { memberId: 'orphan1', currentRoles: new Set([ROLE_VERIFIED]) },
        ];
        const verifiedIds = new Set<string>();

        const result = cleanupOrphanRoles(members, verifiedIds);
        expect(result.removals).toHaveLength(1);
        expect(result.removals[0].roleIds).toContain(ROLE_VERIFIED);
        expect(result.removals[0].roleNames).toContain('Verified');
    });

    it('ignores non-managed roles on non-verified members', () => {
        process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
        resetDiscordRoleConfigCache();

        const NON_MANAGED_ROLE = '99999999999999999';
        const members: GuildMemberRoles[] = [
            { memberId: 'user1', currentRoles: new Set([NON_MANAGED_ROLE]) },
        ];
        const verifiedIds = new Set<string>();

        const result = cleanupOrphanRoles(members, verifiedIds);
        expect(result.removals).toHaveLength(0);
        expect(result.totalRemovals).toBe(0);
    });

    it('handles mixed verified and non-verified members', () => {
        process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
        process.env.ROLE_LP_PROVIDER_ID = ROLE_LP;
        process.env.ROLE_TIER1_ID = ROLE_T1;
        resetDiscordRoleConfigCache();

        const members: GuildMemberRoles[] = [
            // Verified user — should be skipped
            { memberId: 'verified-user', currentRoles: new Set([ROLE_VERIFIED, ROLE_T1, ROLE_LP]) },
            // Orphan — should have managed roles flagged for removal
            { memberId: 'orphan-user', currentRoles: new Set([ROLE_VERIFIED, ROLE_LP]) },
            // Non-verified user without any managed roles — no action needed
            { memberId: 'clean-user', currentRoles: new Set(['unrelated-role']) },
        ];
        const verifiedIds = new Set(['verified-user']);

        const result = cleanupOrphanRoles(members, verifiedIds);
        expect(result.removals).toHaveLength(1);
        expect(result.removals[0].memberId).toBe('orphan-user');
        expect(result.removals[0].roleIds).toContain(ROLE_VERIFIED);
        expect(result.removals[0].roleIds).toContain(ROLE_LP);
        expect(result.totalRemovals).toBe(2);
    });

    it('handles empty guild member list', () => {
        process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
        resetDiscordRoleConfigCache();

        const result = cleanupOrphanRoles([], new Set(['user1']));
        expect(result.removals).toHaveLength(0);
        expect(result.totalRemovals).toBe(0);
    });

    it('handles all members being verified', () => {
        process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
        resetDiscordRoleConfigCache();

        const members: GuildMemberRoles[] = [
            { memberId: 'user1', currentRoles: new Set([ROLE_VERIFIED]) },
            { memberId: 'user2', currentRoles: new Set([ROLE_VERIFIED]) },
        ];
        const verifiedIds = new Set(['user1', 'user2']);

        const result = cleanupOrphanRoles(members, verifiedIds);
        expect(result.removals).toHaveLength(0);
        expect(result.totalRemovals).toBe(0);
    });
});
