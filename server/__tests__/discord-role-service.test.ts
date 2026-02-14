import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { resetDiscordRoleConfigCache } from '../discord/configuration';
import {
    syncRolesBulk,
    removeAllManagedRoles,
    getManagedRoleIds,
    getManagedRoleNames,
    tierRoleForBalance,
} from '../discord/role-service';
import type { VerifiedUserInfo } from '../discord/role-service';

// Test role snowflakes
const ROLE_VERIFIED = '10000000000000001';
const ROLE_NFT = '10000000000000002';
const ROLE_LP = '10000000000000003';
const ROLE_T1 = '10000000000000004';
const ROLE_T2 = '10000000000000005';
const ROLE_T3 = '10000000000000006';

const ENV_VARS = [
    'ROLE_VERIFIED_ID',
    'ROLE_NFT_HOLDER_ID',
    'ROLE_LP_PROVIDER_ID',
    'ROLE_TIER1_ID',
    'ROLE_TIER2_ID',
    'ROLE_TIER3_ID',
];

describe('RoleService', () => {
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

    function setAllRoles() {
        process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
        process.env.ROLE_NFT_HOLDER_ID = ROLE_NFT;
        process.env.ROLE_LP_PROVIDER_ID = ROLE_LP;
        process.env.ROLE_TIER1_ID = ROLE_T1;
        process.env.ROLE_TIER2_ID = ROLE_T2;
        process.env.ROLE_TIER3_ID = ROLE_T3;
        resetDiscordRoleConfigCache();
    }

    describe('getManagedRoleIds', () => {
        it('returns empty set when no roles configured', () => {
            const ids = getManagedRoleIds();
            expect(ids.size).toBe(0);
        });

        it('returns only configured role IDs', () => {
            process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
            process.env.ROLE_NFT_HOLDER_ID = ROLE_NFT;
            resetDiscordRoleConfigCache();

            const ids = getManagedRoleIds();
            expect(ids.size).toBe(2);
            expect(ids.has(ROLE_VERIFIED)).toBe(true);
            expect(ids.has(ROLE_NFT)).toBe(true);
        });

        it('returns all six roles when fully configured', () => {
            setAllRoles();
            const ids = getManagedRoleIds();
            expect(ids.size).toBe(6);
        });
    });

    describe('getManagedRoleNames', () => {
        it('includes Verified label for verified role', () => {
            process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
            resetDiscordRoleConfigCache();

            const names = getManagedRoleNames();
            expect(names.get(ROLE_VERIFIED)).toBe('Verified');
        });

        it('maps all roles to names', () => {
            setAllRoles();
            const names = getManagedRoleNames();
            expect(names.size).toBe(6);
            expect(names.get(ROLE_VERIFIED)).toBe('Verified');
            expect(names.get(ROLE_NFT)).toBe('NFT Holder');
            expect(names.get(ROLE_LP)).toBe('LP Provider');
            expect(names.get(ROLE_T1)).toContain('Tier 1');
            expect(names.get(ROLE_T2)).toContain('Tier 2');
            expect(names.get(ROLE_T3)).toContain('Tier 3');
        });
    });

    describe('tierRoleForBalance', () => {
        it('returns null when no tier roles configured', () => {
            expect(tierRoleForBalance(1000, 100, 500, 1000)).toBeNull();
        });

        it('returns tier 3 for highest balance', () => {
            setAllRoles();
            expect(tierRoleForBalance(1000, 100, 500, 1000)).toBe(ROLE_T3);
        });

        it('returns tier 2 for mid balance', () => {
            setAllRoles();
            expect(tierRoleForBalance(500, 100, 500, 1000)).toBe(ROLE_T2);
        });

        it('returns tier 1 for low balance', () => {
            setAllRoles();
            expect(tierRoleForBalance(100, 100, 500, 1000)).toBe(ROLE_T1);
        });

        it('returns null for balance below all thresholds', () => {
            setAllRoles();
            expect(tierRoleForBalance(50, 100, 500, 1000)).toBeNull();
        });
    });

    describe('syncRolesBulk', () => {
        it('assigns verified role to all users when configured', () => {
            process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
            resetDiscordRoleConfigCache();

            const users: VerifiedUserInfo[] = [
                { memberId: 'user1', corvidBalance: 0, holdsNft: false, isLpProvider: false },
                { memberId: 'user2', corvidBalance: 0, holdsNft: false, isLpProvider: false },
            ];

            const results = syncRolesBulk(users, 100, 500, 1000);
            expect(results).toHaveLength(2);
            expect(results[0].targetRoles.has(ROLE_VERIFIED)).toBe(true);
            expect(results[1].targetRoles.has(ROLE_VERIFIED)).toBe(true);
        });

        it('assigns verified role regardless of balance or other criteria', () => {
            process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
            resetDiscordRoleConfigCache();

            const users: VerifiedUserInfo[] = [
                { memberId: 'user1', corvidBalance: 0, holdsNft: false, isLpProvider: false },
            ];

            const results = syncRolesBulk(users, 100, 500, 1000);
            expect(results[0].targetRoles.has(ROLE_VERIFIED)).toBe(true);
            // Only verified role should be in targets
            expect(results[0].targetRoles.size).toBe(1);
        });

        it('assigns tier role based on balance', () => {
            setAllRoles();

            const users: VerifiedUserInfo[] = [
                { memberId: 'user1', corvidBalance: 750, holdsNft: false, isLpProvider: false },
            ];

            const results = syncRolesBulk(users, 100, 500, 1000);
            expect(results[0].targetRoles.has(ROLE_VERIFIED)).toBe(true);
            expect(results[0].targetRoles.has(ROLE_T2)).toBe(true);
            // User should NOT have T1 or T3
            expect(results[0].targetRoles.has(ROLE_T1)).toBe(false);
            expect(results[0].targetRoles.has(ROLE_T3)).toBe(false);
        });

        it('assigns NFT holder role when user holds NFT', () => {
            process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
            process.env.ROLE_NFT_HOLDER_ID = ROLE_NFT;
            resetDiscordRoleConfigCache();

            const users: VerifiedUserInfo[] = [
                { memberId: 'user1', corvidBalance: 0, holdsNft: true, isLpProvider: false },
            ];

            const results = syncRolesBulk(users, 100, 500, 1000);
            expect(results[0].targetRoles.has(ROLE_VERIFIED)).toBe(true);
            expect(results[0].targetRoles.has(ROLE_NFT)).toBe(true);
        });

        it('assigns LP provider role when user is LP provider', () => {
            process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
            process.env.ROLE_LP_PROVIDER_ID = ROLE_LP;
            resetDiscordRoleConfigCache();

            const users: VerifiedUserInfo[] = [
                { memberId: 'user1', corvidBalance: 0, holdsNft: false, isLpProvider: true },
            ];

            const results = syncRolesBulk(users, 100, 500, 1000);
            expect(results[0].targetRoles.has(ROLE_VERIFIED)).toBe(true);
            expect(results[0].targetRoles.has(ROLE_LP)).toBe(true);
        });

        it('computes rolesToRemove for managed roles the user should not have', () => {
            setAllRoles();

            const users: VerifiedUserInfo[] = [
                { memberId: 'user1', corvidBalance: 0, holdsNft: false, isLpProvider: false },
            ];

            const results = syncRolesBulk(users, 100, 500, 1000);
            // User only gets verified role; all others are in rolesToRemove
            expect(results[0].targetRoles.size).toBe(1);
            expect(results[0].targetRoles.has(ROLE_VERIFIED)).toBe(true);
            expect(results[0].rolesToRemove.has(ROLE_NFT)).toBe(true);
            expect(results[0].rolesToRemove.has(ROLE_LP)).toBe(true);
            expect(results[0].rolesToRemove.has(ROLE_T1)).toBe(true);
            expect(results[0].rolesToRemove.has(ROLE_T2)).toBe(true);
            expect(results[0].rolesToRemove.has(ROLE_T3)).toBe(true);
        });

        it('handles empty user list', () => {
            setAllRoles();
            const results = syncRolesBulk([], 100, 500, 1000);
            expect(results).toHaveLength(0);
        });

        it('returns empty targets when no roles configured', () => {
            const users: VerifiedUserInfo[] = [
                { memberId: 'user1', corvidBalance: 1000, holdsNft: true, isLpProvider: true },
            ];

            const results = syncRolesBulk(users, 100, 500, 1000);
            expect(results[0].targetRoles.size).toBe(0);
            expect(results[0].rolesToRemove.size).toBe(0);
        });
    });

    describe('removeAllManagedRoles', () => {
        it('returns all configured managed roles for removal', () => {
            setAllRoles();

            const result = removeAllManagedRoles('user1');
            expect(result.memberId).toBe('user1');
            expect(result.rolesToRemove.size).toBe(6);
            expect(result.rolesToRemove.has(ROLE_VERIFIED)).toBe(true);
            expect(result.rolesToRemove.has(ROLE_NFT)).toBe(true);
            expect(result.rolesToRemove.has(ROLE_LP)).toBe(true);
            expect(result.rolesToRemove.has(ROLE_T1)).toBe(true);
            expect(result.rolesToRemove.has(ROLE_T2)).toBe(true);
            expect(result.rolesToRemove.has(ROLE_T3)).toBe(true);
        });

        it('includes Verified in role names', () => {
            process.env.ROLE_VERIFIED_ID = ROLE_VERIFIED;
            resetDiscordRoleConfigCache();

            const result = removeAllManagedRoles('user1');
            expect(result.roleNames).toContain('Verified');
        });

        it('returns empty set when no roles configured', () => {
            const result = removeAllManagedRoles('user1');
            expect(result.rolesToRemove.size).toBe(0);
            expect(result.roleNames).toHaveLength(0);
        });
    });
});
