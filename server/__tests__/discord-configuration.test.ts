import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    optionalRoleId,
    loadDiscordRoleConfig,
    resetDiscordRoleConfigCache,
} from '../discord/configuration';

// A plausible Discord snowflake (17-20 digits)
const VALID_SNOWFLAKE = '12345678901234567';
const VALID_SNOWFLAKE_20 = '12345678901234567890';

describe('optionalRoleId', () => {
    let savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
        savedEnv = {};
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    function setEnv(key: string, value: string | undefined) {
        savedEnv[key] = process.env[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    it('returns a valid 17-digit snowflake', () => {
        setEnv('TEST_ROLE', VALID_SNOWFLAKE);
        expect(optionalRoleId('TEST_ROLE')).toBe(VALID_SNOWFLAKE);
    });

    it('returns a valid 20-digit snowflake', () => {
        setEnv('TEST_ROLE', VALID_SNOWFLAKE_20);
        expect(optionalRoleId('TEST_ROLE')).toBe(VALID_SNOWFLAKE_20);
    });

    it('returns null when env var is missing', () => {
        setEnv('TEST_ROLE', undefined);
        expect(optionalRoleId('TEST_ROLE')).toBeNull();
    });

    it('returns null when env var is empty', () => {
        setEnv('TEST_ROLE', '');
        expect(optionalRoleId('TEST_ROLE')).toBeNull();
    });

    it('returns null when env var is whitespace', () => {
        setEnv('TEST_ROLE', '   ');
        expect(optionalRoleId('TEST_ROLE')).toBeNull();
    });

    it('rejects non-numeric strings', () => {
        setEnv('TEST_ROLE', 'not-a-snowflake');
        expect(optionalRoleId('TEST_ROLE')).toBeNull();
    });

    it('rejects too-short numeric strings', () => {
        setEnv('TEST_ROLE', '12345');
        expect(optionalRoleId('TEST_ROLE')).toBeNull();
    });

    it('rejects too-long numeric strings', () => {
        setEnv('TEST_ROLE', '123456789012345678901'); // 21 digits
        expect(optionalRoleId('TEST_ROLE')).toBeNull();
    });

    it('trims whitespace around valid snowflakes', () => {
        setEnv('TEST_ROLE', `  ${VALID_SNOWFLAKE}  `);
        expect(optionalRoleId('TEST_ROLE')).toBe(VALID_SNOWFLAKE);
    });
});

describe('loadDiscordRoleConfig', () => {
    const ENV_VARS = [
        'ROLE_VERIFIED_ID',
        'ROLE_NFT_HOLDER_ID',
        'ROLE_LP_PROVIDER_ID',
        'ROLE_TIER1_ID',
        'ROLE_TIER2_ID',
        'ROLE_TIER3_ID',
    ];

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

    it('returns all nulls when no env vars are set', () => {
        const config = loadDiscordRoleConfig();
        expect(config.verifiedRoleId).toBeNull();
        expect(config.nftHolderRoleId).toBeNull();
        expect(config.lpProviderRoleId).toBeNull();
        expect(config.tier1RoleId).toBeNull();
        expect(config.tier2RoleId).toBeNull();
        expect(config.tier3RoleId).toBeNull();
    });

    it('loads verifiedRoleId from ROLE_VERIFIED_ID', () => {
        process.env.ROLE_VERIFIED_ID = VALID_SNOWFLAKE;
        const config = loadDiscordRoleConfig();
        expect(config.verifiedRoleId).toBe(VALID_SNOWFLAKE);
    });

    it('loads nftHolderRoleId from ROLE_NFT_HOLDER_ID', () => {
        process.env.ROLE_NFT_HOLDER_ID = '99999999999999999';
        const config = loadDiscordRoleConfig();
        expect(config.nftHolderRoleId).toBe('99999999999999999');
    });

    it('loads lpProviderRoleId from ROLE_LP_PROVIDER_ID', () => {
        process.env.ROLE_LP_PROVIDER_ID = '88888888888888888';
        const config = loadDiscordRoleConfig();
        expect(config.lpProviderRoleId).toBe('88888888888888888');
    });

    it('loads all tier role IDs', () => {
        process.env.ROLE_TIER1_ID = '11111111111111111';
        process.env.ROLE_TIER2_ID = '22222222222222222';
        process.env.ROLE_TIER3_ID = '33333333333333333';
        const config = loadDiscordRoleConfig();
        expect(config.tier1RoleId).toBe('11111111111111111');
        expect(config.tier2RoleId).toBe('22222222222222222');
        expect(config.tier3RoleId).toBe('33333333333333333');
    });

    it('caches the config on subsequent calls', () => {
        process.env.ROLE_VERIFIED_ID = VALID_SNOWFLAKE;
        const config1 = loadDiscordRoleConfig();

        // Change the env var after caching
        process.env.ROLE_VERIFIED_ID = '99999999999999999';
        const config2 = loadDiscordRoleConfig();

        // Should return cached value
        expect(config2.verifiedRoleId).toBe(VALID_SNOWFLAKE);
        expect(config1).toBe(config2);
    });

    it('returns fresh config after cache reset', () => {
        process.env.ROLE_VERIFIED_ID = VALID_SNOWFLAKE;
        const config1 = loadDiscordRoleConfig();
        expect(config1.verifiedRoleId).toBe(VALID_SNOWFLAKE);

        resetDiscordRoleConfigCache();
        process.env.ROLE_VERIFIED_ID = '99999999999999999';
        const config2 = loadDiscordRoleConfig();
        expect(config2.verifiedRoleId).toBe('99999999999999999');
    });
});
