import { createLogger } from '../lib/logger';
import { loadDiscordRoleConfig } from './configuration';
import type { RoleSnowflake } from './configuration';

const log = createLogger('RoleService');

/**
 * Represents the set of role IDs a Discord member should have after a bulk sync.
 */
export interface RoleSyncResult {
    /** Discord user / member ID. */
    memberId: string;
    /** The set of role IDs the member should be assigned. */
    targetRoles: Set<RoleSnowflake>;
    /** The set of role IDs the member should NOT have (managed but not earned). */
    rolesToRemove: Set<RoleSnowflake>;
}

/**
 * Determine the tier role for a user based on their CORVID token balance.
 * Returns the appropriate tier role ID, or null if no tier applies.
 */
export function tierRoleForBalance(
    balance: number,
    tier1Threshold: number,
    tier2Threshold: number,
    tier3Threshold: number,
): RoleSnowflake | null {
    const config = loadDiscordRoleConfig();
    if (balance >= tier3Threshold && config.tier3RoleId) return config.tier3RoleId;
    if (balance >= tier2Threshold && config.tier2RoleId) return config.tier2RoleId;
    if (balance >= tier1Threshold && config.tier1RoleId) return config.tier1RoleId;
    return null;
}

/**
 * Build the complete set of managed role IDs based on the current configuration.
 * Only includes role IDs that are actually configured (non-null).
 */
export function getManagedRoleIds(): Set<RoleSnowflake> {
    const config = loadDiscordRoleConfig();
    const managedRoleIds = new Set<RoleSnowflake>();

    if (config.verifiedRoleId) managedRoleIds.add(config.verifiedRoleId);
    if (config.nftHolderRoleId) managedRoleIds.add(config.nftHolderRoleId);
    if (config.lpProviderRoleId) managedRoleIds.add(config.lpProviderRoleId);
    if (config.tier1RoleId) managedRoleIds.add(config.tier1RoleId);
    if (config.tier2RoleId) managedRoleIds.add(config.tier2RoleId);
    if (config.tier3RoleId) managedRoleIds.add(config.tier3RoleId);

    return managedRoleIds;
}

/**
 * Build the mapping of managed role IDs to human-readable names.
 * Used for logging and diagnostics.
 */
export function getManagedRoleNames(): Map<RoleSnowflake, string> {
    const config = loadDiscordRoleConfig();
    const names = new Map<RoleSnowflake, string>();

    if (config.verifiedRoleId) names.set(config.verifiedRoleId, 'Verified');
    if (config.nftHolderRoleId) names.set(config.nftHolderRoleId, 'NFT Holder');
    if (config.lpProviderRoleId) names.set(config.lpProviderRoleId, 'LP Provider');
    if (config.tier1RoleId) names.set(config.tier1RoleId, 'Tier 1 (Fledgling)');
    if (config.tier2RoleId) names.set(config.tier2RoleId, 'Tier 2 (Crow)');
    if (config.tier3RoleId) names.set(config.tier3RoleId, 'Tier 3 (Raven)');

    return names;
}

export interface VerifiedUserInfo {
    /** Discord member ID. */
    memberId: string;
    /** CORVID token balance (microunits or base units). */
    corvidBalance: number;
    /** Whether the user holds a qualifying NFT. */
    holdsNft: boolean;
    /** Whether the user is an LP provider. */
    isLpProvider: boolean;
}

/**
 * Compute role assignments for a batch of verified users.
 *
 * This is the core "bulk sync" function.  For every verified user it
 * determines which managed roles they should have and which they should
 * not.  The caller is responsible for applying the changes to Discord via
 * the REST API.
 *
 * **Verified role:** Always added for every user in the batch (this method
 * is only called for verified users).
 *
 * **Tier roles:** Determined by `corvidBalance` and the provided thresholds.
 * A user gets exactly one tier role (the highest they qualify for).
 *
 * **NFT Holder / LP Provider:** Added when the corresponding boolean flag
 * is true.
 */
export function syncRolesBulk(
    users: VerifiedUserInfo[],
    tier1Threshold: number,
    tier2Threshold: number,
    tier3Threshold: number,
): RoleSyncResult[] {
    const config = loadDiscordRoleConfig();
    const managedRoleIds = getManagedRoleIds();

    // Build list of configured tiers for logging
    const configuredTiers: string[] = [];
    if (config.verifiedRoleId) configuredTiers.push('Verified');
    if (config.nftHolderRoleId) configuredTiers.push('NFT Holder');
    if (config.lpProviderRoleId) configuredTiers.push('LP Provider');
    if (config.tier1RoleId) configuredTiers.push('Tier 1');
    if (config.tier2RoleId) configuredTiers.push('Tier 2');
    if (config.tier3RoleId) configuredTiers.push('Tier 3');

    log.info(`Syncing roles for ${users.length} verified users`, {
        configuredTiers: configuredTiers.join(', '),
        managedRoleCount: managedRoleIds.size,
    });

    const results: RoleSyncResult[] = [];

    for (const user of users) {
        const targetRoles = new Set<RoleSnowflake>();

        // --- Verified role: always assigned to verified users ---
        if (config.verifiedRoleId) {
            targetRoles.add(config.verifiedRoleId);
        }

        // --- Tier role: based on CORVID balance ---
        const tierRole = tierRoleForBalance(
            user.corvidBalance,
            tier1Threshold,
            tier2Threshold,
            tier3Threshold,
        );
        if (tierRole) {
            targetRoles.add(tierRole);
        }

        // --- NFT Holder role ---
        if (config.nftHolderRoleId && user.holdsNft) {
            targetRoles.add(config.nftHolderRoleId);
        }

        // --- LP Provider role ---
        if (config.lpProviderRoleId && user.isLpProvider) {
            targetRoles.add(config.lpProviderRoleId);
        }

        // Roles to remove = managed roles that the user should NOT have
        const rolesToRemove = new Set<RoleSnowflake>();
        for (const roleId of managedRoleIds) {
            if (!targetRoles.has(roleId)) {
                rolesToRemove.add(roleId);
            }
        }

        results.push({
            memberId: user.memberId,
            targetRoles,
            rolesToRemove,
        });
    }

    log.info(`Role sync computed for ${results.length} members`, {
        totalAssignments: results.reduce((sum, r) => sum + r.targetRoles.size, 0),
        totalRemovals: results.reduce((sum, r) => sum + r.rolesToRemove.size, 0),
    });

    return results;
}

/**
 * Compute the set of all managed roles that should be removed from a user
 * who has unlinked all wallets (no longer verified at all).
 *
 * Returns the full set of configured managed role IDs — the caller should
 * remove all of them from the Discord member.
 */
export function removeAllManagedRoles(memberId: string): {
    memberId: string;
    rolesToRemove: Set<RoleSnowflake>;
    roleNames: string[];
} {
    const managedRoleIds = getManagedRoleIds();
    const managedRoleNames = getManagedRoleNames();

    const roleNames: string[] = [];
    for (const roleId of managedRoleIds) {
        const name = managedRoleNames.get(roleId);
        if (name) roleNames.push(name);
    }

    log.info(`Removing all managed roles for member ${memberId}`, {
        roleCount: managedRoleIds.size,
        roles: roleNames.join(', '),
    });

    return {
        memberId,
        rolesToRemove: managedRoleIds,
        roleNames,
    };
}
