import { createLogger } from '../lib/logger';

const log = createLogger('DiscordConfig');

/**
 * Discord role snowflake ID (a string of digits).
 * Discord uses 64-bit integer IDs serialized as strings.
 */
export type RoleSnowflake = string;

/**
 * Discord role configuration loaded from environment variables.
 *
 * All role IDs are optional — features are disabled when the corresponding
 * env var is absent or empty.  This follows the same pattern as the
 * AlgoChat PSK contact: null means "not configured".
 */
export interface DiscordRoleConfig {
    /** Base "Verified" role assigned to every user with a verified wallet. */
    verifiedRoleId: RoleSnowflake | null;
    /** Role for users who hold a qualifying NFT collection. */
    nftHolderRoleId: RoleSnowflake | null;
    /** Role for users who provide liquidity in a qualifying pool. */
    lpProviderRoleId: RoleSnowflake | null;
    /** Tier-1 (Fledgling) role — lowest CORVID balance tier. */
    tier1RoleId: RoleSnowflake | null;
    /** Tier-2 (Crow) role — mid CORVID balance tier. */
    tier2RoleId: RoleSnowflake | null;
    /** Tier-3 (Raven) role — highest CORVID balance tier. */
    tier3RoleId: RoleSnowflake | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SNOWFLAKE_RE = /^\d{17,20}$/;

/**
 * Read an optional Discord role snowflake from `process.env[envVar]`.
 *
 * Returns `null` when the variable is missing, empty, or not a valid
 * snowflake (17–20 digit string).
 */
export function optionalRoleId(envVar: string): RoleSnowflake | null {
    const raw = process.env[envVar];
    if (!raw || raw.trim().length === 0) return null;

    const trimmed = raw.trim();
    if (!SNOWFLAKE_RE.test(trimmed)) {
        log.warn(`Invalid Discord snowflake in ${envVar}: "${trimmed}" — expected 17-20 digits`);
        return null;
    }
    return trimmed;
}

// ---------------------------------------------------------------------------
// Cached singleton
// ---------------------------------------------------------------------------

let _cachedConfig: DiscordRoleConfig | null = null;

/**
 * Load Discord role configuration from environment variables.
 *
 * Uses a cached singleton so the env is only parsed once per process.
 */
export function loadDiscordRoleConfig(): DiscordRoleConfig {
    if (_cachedConfig) return _cachedConfig;

    _cachedConfig = {
        verifiedRoleId: optionalRoleId('ROLE_VERIFIED_ID'),
        nftHolderRoleId: optionalRoleId('ROLE_NFT_HOLDER_ID'),
        lpProviderRoleId: optionalRoleId('ROLE_LP_PROVIDER_ID'),
        tier1RoleId: optionalRoleId('ROLE_TIER1_ID'),
        tier2RoleId: optionalRoleId('ROLE_TIER2_ID'),
        tier3RoleId: optionalRoleId('ROLE_TIER3_ID'),
    };

    const configured: string[] = [];
    if (_cachedConfig.verifiedRoleId) configured.push('Verified');
    if (_cachedConfig.nftHolderRoleId) configured.push('NFT Holder');
    if (_cachedConfig.lpProviderRoleId) configured.push('LP Provider');
    if (_cachedConfig.tier1RoleId) configured.push('Tier 1');
    if (_cachedConfig.tier2RoleId) configured.push('Tier 2');
    if (_cachedConfig.tier3RoleId) configured.push('Tier 3');

    if (configured.length > 0) {
        log.info(`Discord roles configured: ${configured.join(', ')}`);
    } else {
        log.debug('No Discord role IDs configured — role management disabled');
    }

    return _cachedConfig;
}

/**
 * Reset the cached configuration (useful in tests).
 */
export function resetDiscordRoleConfigCache(): void {
    _cachedConfig = null;
}
