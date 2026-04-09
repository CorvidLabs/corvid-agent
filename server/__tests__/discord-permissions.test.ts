/**
 * Unit tests for server/discord/permissions.ts
 *
 * Covers the four exported pure-ish functions:
 *   - resolvePermissionLevel  (edge cases not covered by discord-public-mode.test.ts)
 *   - checkRateLimit          (edge cases not covered by discord-public-mode.test.ts)
 *   - isMonitoredChannel
 *   - muteUser / unmuteUser
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import {
  checkRateLimit,
  isMonitoredChannel,
  muteUser,
  resolvePermissionLevel,
  unmuteUser,
} from '../discord/permissions';
import type { DiscordBridgeConfig } from '../discord/types';
import { PermissionLevel } from '../discord/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<DiscordBridgeConfig> = {}): DiscordBridgeConfig {
  return {
    botToken: 'tok',
    channelId: '100000000000000001',
    allowedUserIds: [],
    ...overrides,
  };
}

// ─── resolvePermissionLevel ───────────────────────────────────────────────────

describe('resolvePermissionLevel', () => {
  test('returns ADMIN for user in allowedUserIds (non-public mode)', () => {
    const config = makeConfig({ publicMode: false, allowedUserIds: ['user-0000000001'] });
    const mutedUsers = new Set<string>();
    expect(resolvePermissionLevel(config, mutedUsers, 'user-0000000001')).toBe(PermissionLevel.ADMIN);
  });

  test('returns BLOCKED for user NOT in allowedUserIds (non-public mode)', () => {
    const config = makeConfig({ publicMode: false, allowedUserIds: ['user-0000000001'] });
    const mutedUsers = new Set<string>();
    expect(resolvePermissionLevel(config, mutedUsers, 'user-9999999999')).toBe(PermissionLevel.BLOCKED);
  });

  test('returns ADMIN when allowedUserIds is empty in non-public mode (no restrictions)', () => {
    const config = makeConfig({ publicMode: false, allowedUserIds: [] });
    const mutedUsers = new Set<string>();
    expect(resolvePermissionLevel(config, mutedUsers, 'anyone-0000001234')).toBe(PermissionLevel.ADMIN);
  });

  test('muted user is always BLOCKED even with matching role', () => {
    const config = makeConfig({
      publicMode: true,
      rolePermissions: { 'admin-role-00000001': PermissionLevel.ADMIN },
      defaultPermissionLevel: PermissionLevel.BASIC,
    });
    const mutedUsers = new Set(['muted-user-00000001']);
    expect(resolvePermissionLevel(config, mutedUsers, 'muted-user-00000001', ['admin-role-00000001'])).toBe(
      PermissionLevel.BLOCKED,
    );
  });

  test('uses defaultPermissionLevel as floor when no roles match', () => {
    const config = makeConfig({
      publicMode: true,
      defaultPermissionLevel: PermissionLevel.STANDARD,
    });
    const mutedUsers = new Set<string>();
    expect(resolvePermissionLevel(config, mutedUsers, 'any-user-00000001')).toBe(PermissionLevel.STANDARD);
  });

  test('channel floor elevates permission above default', () => {
    const config = makeConfig({
      publicMode: true,
      defaultPermissionLevel: PermissionLevel.BASIC,
      channelPermissions: { '100000000000000099': PermissionLevel.STANDARD },
    });
    const mutedUsers = new Set<string>();
    expect(resolvePermissionLevel(config, mutedUsers, 'any-user-00000001', [], '100000000000000099')).toBe(
      PermissionLevel.STANDARD,
    );
  });

  test('channel floor does NOT lower existing higher role permission', () => {
    const config = makeConfig({
      publicMode: true,
      defaultPermissionLevel: PermissionLevel.BASIC,
      rolePermissions: { 'admin-role-00000001': PermissionLevel.ADMIN },
      channelPermissions: { '100000000000000099': PermissionLevel.BASIC },
    });
    const mutedUsers = new Set<string>();
    expect(
      resolvePermissionLevel(config, mutedUsers, 'admin-user-00000001', ['admin-role-00000001'], '100000000000000099'),
    ).toBe(PermissionLevel.ADMIN);
  });

  test('highest role wins when user has multiple roles', () => {
    const config = makeConfig({
      publicMode: true,
      rolePermissions: {
        'basic-role-0000001': PermissionLevel.BASIC,
        'admin-role-0000001': PermissionLevel.ADMIN,
      },
      defaultPermissionLevel: PermissionLevel.BASIC,
    });
    const mutedUsers = new Set<string>();
    expect(
      resolvePermissionLevel(config, mutedUsers, 'user-000000000001', ['basic-role-0000001', 'admin-role-0000001']),
    ).toBe(PermissionLevel.ADMIN);
  });
});

// ─── checkRateLimit ───────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  let timestamps: Map<string, number[]>;

  beforeEach(() => {
    timestamps = new Map();
  });

  test('first message is always allowed', () => {
    const config = makeConfig();
    expect(checkRateLimit(config, timestamps, 'user-000000000001', 60_000, 5)).toBe(true);
  });

  test('message exactly at limit is blocked', () => {
    const config = makeConfig();
    const userId = 'user-000000000001';
    for (let i = 0; i < 3; i++) {
      checkRateLimit(config, timestamps, userId, 60_000, 3);
    }
    expect(checkRateLimit(config, timestamps, userId, 60_000, 3)).toBe(false);
  });

  test('expired timestamps do not count toward limit', () => {
    const config = makeConfig();
    const userId = 'user-000000000001';
    // Seed with old timestamps well outside the window
    timestamps.set(userId, [Date.now() - 120_000, Date.now() - 90_000]);
    // Should still be allowed since old stamps are outside the 60s window
    expect(checkRateLimit(config, timestamps, userId, 60_000, 2)).toBe(true);
  });

  test('rateLimitByLevel override applies to matching permission level', () => {
    const config = makeConfig({
      publicMode: true,
      rateLimitByLevel: { [PermissionLevel.STANDARD]: 2 },
    });
    const userId = 'user-000000000001';
    checkRateLimit(config, timestamps, userId, 60_000, 10, PermissionLevel.STANDARD);
    checkRateLimit(config, timestamps, userId, 60_000, 10, PermissionLevel.STANDARD);
    // Third message should be blocked by the level override (max=2)
    expect(checkRateLimit(config, timestamps, userId, 60_000, 10, PermissionLevel.STANDARD)).toBe(false);
  });

  test('different users have independent rate limit buckets', () => {
    const config = makeConfig();
    const user1 = 'user-000000000001';
    const user2 = 'user-000000000002';
    // Exhaust user1's limit
    checkRateLimit(config, timestamps, user1, 60_000, 1);
    expect(checkRateLimit(config, timestamps, user1, 60_000, 1)).toBe(false);
    // user2 is unaffected
    expect(checkRateLimit(config, timestamps, user2, 60_000, 1)).toBe(true);
  });
});

// ─── isMonitoredChannel ───────────────────────────────────────────────────────

describe('isMonitoredChannel', () => {
  test('returns true for primary channelId', () => {
    const config = makeConfig({ channelId: '100000000000000001' });
    expect(isMonitoredChannel(config, '100000000000000001')).toBe(true);
  });

  test('returns false for unregistered channel', () => {
    const config = makeConfig({ channelId: '100000000000000001' });
    expect(isMonitoredChannel(config, '100000000000000099')).toBe(false);
  });

  test('returns true for channel in additionalChannelIds', () => {
    const config = makeConfig({
      channelId: '100000000000000001',
      additionalChannelIds: ['100000000000000002', '100000000000000003'],
    });
    expect(isMonitoredChannel(config, '100000000000000002')).toBe(true);
    expect(isMonitoredChannel(config, '100000000000000003')).toBe(true);
  });

  test('returns false when additionalChannelIds is empty and channel is not primary', () => {
    const config = makeConfig({
      channelId: '100000000000000001',
      additionalChannelIds: [],
    });
    expect(isMonitoredChannel(config, '100000000000000099')).toBe(false);
  });

  test('returns false when additionalChannelIds is undefined and channel is not primary', () => {
    const config = makeConfig({ channelId: '100000000000000001' });
    expect(isMonitoredChannel(config, '100000000000000099')).toBe(false);
  });
});

// ─── muteUser / unmuteUser ───────────────────────────────────────────────────

describe('muteUser', () => {
  test('adds userId to mutedUsers set', () => {
    const mutedUsers = new Set<string>();
    muteUser(mutedUsers, 'user-000000000001');
    expect(mutedUsers.has('user-000000000001')).toBe(true);
  });

  test('muting same user twice is idempotent', () => {
    const mutedUsers = new Set<string>();
    muteUser(mutedUsers, 'user-000000000001');
    muteUser(mutedUsers, 'user-000000000001');
    expect(mutedUsers.size).toBe(1);
  });

  test('mutes multiple distinct users independently', () => {
    const mutedUsers = new Set<string>();
    muteUser(mutedUsers, 'user-000000000001');
    muteUser(mutedUsers, 'user-000000000002');
    expect(mutedUsers.size).toBe(2);
    expect(mutedUsers.has('user-000000000001')).toBe(true);
    expect(mutedUsers.has('user-000000000002')).toBe(true);
  });
});

describe('unmuteUser', () => {
  test('removes userId from mutedUsers set', () => {
    const mutedUsers = new Set(['user-000000000001']);
    unmuteUser(mutedUsers, 'user-000000000001');
    expect(mutedUsers.has('user-000000000001')).toBe(false);
  });

  test('unmuting a non-muted user is a no-op', () => {
    const mutedUsers = new Set<string>();
    expect(() => unmuteUser(mutedUsers, 'user-000000000099')).not.toThrow();
    expect(mutedUsers.size).toBe(0);
  });

  test('unmuting one user does not affect others', () => {
    const mutedUsers = new Set(['user-000000000001', 'user-000000000002']);
    unmuteUser(mutedUsers, 'user-000000000001');
    expect(mutedUsers.has('user-000000000001')).toBe(false);
    expect(mutedUsers.has('user-000000000002')).toBe(true);
  });

  test('mute then unmute restores clean state', () => {
    const mutedUsers = new Set<string>();
    muteUser(mutedUsers, 'user-000000000001');
    expect(mutedUsers.has('user-000000000001')).toBe(true);
    unmuteUser(mutedUsers, 'user-000000000001');
    expect(mutedUsers.has('user-000000000001')).toBe(false);
  });
});
