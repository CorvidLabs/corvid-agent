/**
 * Permission resolution and access control for the Discord bridge.
 *
 * Handles role-based permission levels, rate limiting, and channel monitoring.
 */

import { PermissionLevel } from './types';
import type { DiscordBridgeConfig } from './types';

/** Default max messages per window for BASIC-tier users in public mode. */
const PUBLIC_BASIC_RATE_LIMIT = 5;
import { createLogger } from '../lib/logger';

const log = createLogger('DiscordPermissions');

/**
 * Resolve a user's permission level based on their roles and bridge config.
 * Returns the highest permission level from all matching roles.
 */
export function resolvePermissionLevel(
    config: DiscordBridgeConfig,
    mutedUsers: Set<string>,
    userId: string,
    memberRoles?: string[],
): number {
    // Muted users are always blocked
    if (mutedUsers.has(userId)) return PermissionLevel.BLOCKED;

    // Legacy mode: use allowedUserIds
    if (!config.publicMode) {
        if (config.allowedUserIds.length > 0) {
            return config.allowedUserIds.includes(userId)
                ? PermissionLevel.ADMIN
                : PermissionLevel.BLOCKED;
        }
        return PermissionLevel.ADMIN; // No restrictions configured
    }

    // Public mode with role-based access
    if (!config.rolePermissions || !memberRoles?.length) {
        return config.defaultPermissionLevel ?? PermissionLevel.BASIC;
    }

    let maxLevel = config.defaultPermissionLevel ?? PermissionLevel.BASIC;
    for (const roleId of memberRoles) {
        const level = config.rolePermissions[roleId];
        if (level !== undefined && level > maxLevel) {
            maxLevel = level;
        }
    }
    return maxLevel;
}

/**
 * Check if a user is within their rate limit.
 * Returns true if the message is allowed, false if rate-limited.
 */
export function checkRateLimit(
    config: DiscordBridgeConfig,
    userMessageTimestamps: Map<string, number[]>,
    userId: string,
    rateLimitWindowMs: number,
    rateLimitMaxMessages: number,
    permLevel?: number,
): boolean {
    const now = Date.now();
    const timestamps = userMessageTimestamps.get(userId) ?? [];
    const recent = timestamps.filter(t => now - t < rateLimitWindowMs);

    // Tiered rate limiting: higher permission levels get higher limits.
    // In public mode, BASIC users default to a tighter limit (5/window) unless
    // explicitly overridden via rateLimitByLevel config.
    let maxMessages = rateLimitMaxMessages;
    if (permLevel !== undefined) {
        if (config.rateLimitByLevel?.[permLevel] !== undefined) {
            maxMessages = config.rateLimitByLevel[permLevel]!;
        } else if (config.publicMode && permLevel === PermissionLevel.BASIC) {
            maxMessages = PUBLIC_BASIC_RATE_LIMIT;
        }
    }

    if (recent.length >= maxMessages) return false;
    recent.push(now);
    userMessageTimestamps.set(userId, recent);
    return true;
}

/**
 * Check if a channel is one we're monitoring.
 */
export function isMonitoredChannel(config: DiscordBridgeConfig, channelId: string): boolean {
    if (channelId === config.channelId) return true;
    return config.additionalChannelIds?.includes(channelId) ?? false;
}

/**
 * Mute a user from bot interactions. Admin action.
 */
export function muteUser(mutedUsers: Set<string>, userId: string): void {
    mutedUsers.add(userId);
    log.info('User muted from Discord bot', { userId });
}

/**
 * Unmute a user. Admin action.
 */
export function unmuteUser(mutedUsers: Set<string>, userId: string): void {
    mutedUsers.delete(userId);
    log.info('User unmuted from Discord bot', { userId });
}
