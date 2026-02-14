import { createLogger } from '../lib/logger';
import { getManagedRoleIds, getManagedRoleNames } from './role-service';
import type { RoleSnowflake } from './configuration';

const log = createLogger('RoleSyncService');

/**
 * Represents a Discord guild member with their current roles.
 */
export interface GuildMemberRoles {
    /** Discord member ID. */
    memberId: string;
    /** Set of role IDs the member currently has. */
    currentRoles: Set<RoleSnowflake>;
}

/**
 * Result of an orphan cleanup pass — lists which members had which roles
 * removed.
 */
export interface OrphanCleanupResult {
    /** Members who had managed roles removed. */
    removals: Array<{
        memberId: string;
        roleIds: RoleSnowflake[];
        roleNames: string[];
    }>;
    /** Total number of role removals across all members. */
    totalRemovals: number;
}

/**
 * Identify and compute orphan role removals.
 *
 * An "orphan" role is a bot-managed role that a Discord member has but
 * should not — because the member is NOT in the set of verified users.
 *
 * This function compares guild members' current roles against the set of
 * managed role IDs and the set of verified member IDs.  For any member who
 * has a managed role but is NOT in `verifiedMemberIds`, those managed roles
 * are flagged for removal.
 *
 * The verified role ID is included in the managed set, so members who lost
 * all verified wallets will also have the Verified role removed.
 *
 * The caller is responsible for actually removing the roles via the
 * Discord REST API.
 */
export function cleanupOrphanRoles(
    guildMembers: GuildMemberRoles[],
    verifiedMemberIds: Set<string>,
): OrphanCleanupResult {
    const managedRoleIds = getManagedRoleIds();
    const managedRoleNames = getManagedRoleNames();

    if (managedRoleIds.size === 0) {
        log.debug('No managed roles configured — skipping orphan cleanup');
        return { removals: [], totalRemovals: 0 };
    }

    log.info(`Running orphan role cleanup`, {
        guildMemberCount: guildMembers.length,
        verifiedMemberCount: verifiedMemberIds.size,
        managedRoleCount: managedRoleIds.size,
    });

    const removals: OrphanCleanupResult['removals'] = [];
    let totalRemovals = 0;

    for (const member of guildMembers) {
        // Skip verified members — their roles are managed by syncRolesBulk
        if (verifiedMemberIds.has(member.memberId)) continue;

        // Find managed roles this non-verified member has
        const orphanRoleIds: RoleSnowflake[] = [];
        const orphanRoleNameList: string[] = [];

        for (const roleId of managedRoleIds) {
            if (member.currentRoles.has(roleId)) {
                orphanRoleIds.push(roleId);
                const name = managedRoleNames.get(roleId);
                if (name) orphanRoleNameList.push(name);
            }
        }

        if (orphanRoleIds.length > 0) {
            removals.push({
                memberId: member.memberId,
                roleIds: orphanRoleIds,
                roleNames: orphanRoleNameList,
            });
            totalRemovals += orphanRoleIds.length;
        }
    }

    if (totalRemovals > 0) {
        log.info(`Orphan cleanup found ${totalRemovals} role(s) to remove from ${removals.length} member(s)`, {
            removals: removals.map(r => ({
                memberId: r.memberId,
                roles: r.roleNames.join(', '),
            })),
        });
    } else {
        log.debug('Orphan cleanup: no orphan roles found');
    }

    return { removals, totalRemovals };
}
