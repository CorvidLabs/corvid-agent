/**
 * Discord runtime configuration — DB-backed settings that can be
 * changed without restarting the server.
 *
 * Static settings (bot token, app ID, guild ID) remain environment-only.
 * Dynamic settings (channels, users, roles, permissions) live here.
 */
import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { writeTransaction } from './pool';

const log = createLogger('DiscordConfig');

// ─── Types ────────────────────────────────────────────────────────────────

export interface DiscordDynamicConfig {
  /** Additional channel IDs to monitor (comma-separated in DB) */
  additionalChannelIds: string[];
  /** Allowed user IDs for legacy mode */
  allowedUserIds: string[];
  /** Bridge mode: 'chat' or 'work_intake' */
  mode: 'chat' | 'work_intake';
  /** Default agent ID */
  defaultAgentId: string | null;
  /** Public mode enabled */
  publicMode: boolean;
  /** Role → permission level mapping (JSON) */
  rolePermissions: Record<string, number>;
  /** Default permission level for public mode */
  defaultPermissionLevel: number;
  /** Rate limit overrides by permission level (JSON) */
  rateLimitByLevel: Record<number, number>;
  /** Per-channel permission floors (JSON) */
  channelPermissions: Record<string, number>;
  /** Channel IDs where STANDARD users get full /message tools (comma-separated) */
  messageFullToolChannelIds: string[];
  /** Bot status text */
  statusText: string;
  /** Activity type (0=Playing, 1=Streaming, 2=Listening, 3=Watching, 5=Competing) */
  activityType: number;
  /** Discord user IDs who have interacted at least once (comma-separated in DB) */
  interactedUsers: string[];
}

// ─── Config helpers ───────────────────────────────────────────────────────

const DEFAULTS: DiscordDynamicConfig = {
  additionalChannelIds: [],
  allowedUserIds: [],
  mode: 'chat',
  defaultAgentId: null,
  publicMode: false,
  rolePermissions: {},
  defaultPermissionLevel: 1,
  rateLimitByLevel: {},
  channelPermissions: {},
  messageFullToolChannelIds: [],
  statusText: 'corvid-agent',
  activityType: 3,
  interactedUsers: [],
};

function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseJsonOrDefault<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getDiscordConfig(db: Database): DiscordDynamicConfig {
  let rows: { key: string; value: string }[];
  try {
    rows = db.query('SELECT key, value FROM discord_config').all() as { key: string; value: string }[];
  } catch {
    // Table may not exist yet if migrations haven't run
    return { ...DEFAULTS };
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    additionalChannelIds: parseCommaSeparated(map.get('additional_channel_ids')),
    allowedUserIds: parseCommaSeparated(map.get('allowed_user_ids')),
    mode: (map.get('mode') as 'chat' | 'work_intake') || DEFAULTS.mode,
    defaultAgentId: map.get('default_agent_id') || null,
    publicMode: map.get('public_mode') === 'true',
    rolePermissions: parseJsonOrDefault(map.get('role_permissions'), DEFAULTS.rolePermissions),
    defaultPermissionLevel: parseInt(
      map.get('default_permission_level') ?? String(DEFAULTS.defaultPermissionLevel),
      10,
    ),
    rateLimitByLevel: parseJsonOrDefault(map.get('rate_limit_by_level'), DEFAULTS.rateLimitByLevel),
    channelPermissions: parseJsonOrDefault(map.get('channel_permissions'), DEFAULTS.channelPermissions),
    messageFullToolChannelIds: parseCommaSeparated(map.get('message_full_tool_channel_ids')),
    statusText: map.get('status_text') ?? DEFAULTS.statusText,
    activityType: parseInt(map.get('activity_type') ?? String(DEFAULTS.activityType), 10),
    interactedUsers: parseCommaSeparated(map.get('interacted_users')),
  };
}

export function getDiscordConfigRaw(db: Database): Record<string, string> {
  let rows: { key: string; value: string }[];
  try {
    rows = db.query('SELECT key, value FROM discord_config').all() as { key: string; value: string }[];
  } catch {
    return {};
  }
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function updateDiscordConfig(db: Database, key: string, value: string): void {
  db.prepare(`INSERT OR REPLACE INTO discord_config (key, value, updated_at) VALUES (?, ?, datetime('now'))`).run(
    key,
    value,
  );
  log.info('Discord config updated', { key, valueLength: value.length });
}

export function updateDiscordConfigBatch(db: Database, updates: Record<string, string>): number {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO discord_config (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
  );
  let count = 0;
  writeTransaction(db, (_db) => {
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(key, value);
      count++;
    }
  });
  log.info('Discord config batch updated', { count });
  return count;
}

export function deleteDiscordConfigKey(db: Database, key: string): boolean {
  const result = db.prepare('DELETE FROM discord_config WHERE key = ?').run(key);
  return result.changes > 0;
}

/** Valid config keys that can be set via the API */
export const VALID_DISCORD_CONFIG_KEYS = new Set([
  'additional_channel_ids',
  'allowed_user_ids',
  'mode',
  'default_agent_id',
  'public_mode',
  'role_permissions',
  'default_permission_level',
  'rate_limit_by_level',
  'channel_permissions',
  'message_full_tool_channel_ids',
  'status_text',
  'activity_type',
]);

/**
 * Initialize discord_config from environment variables.
 * Only sets values that don't already exist in the DB (preserves runtime changes).
 */
export function initDiscordConfigFromEnv(db: Database): void {
  const envMappings: [string, string][] = [
    ['DISCORD_ADDITIONAL_CHANNEL_IDS', 'additional_channel_ids'],
    ['DISCORD_ALLOWED_USER_IDS', 'allowed_user_ids'],
    ['DISCORD_BRIDGE_MODE', 'mode'],
    ['DISCORD_DEFAULT_AGENT_ID', 'default_agent_id'],
    ['DISCORD_PUBLIC_MODE', 'public_mode'],
    ['DISCORD_ROLE_PERMISSIONS', 'role_permissions'],
    ['DISCORD_DEFAULT_PERMISSION_LEVEL', 'default_permission_level'],
    ['DISCORD_RATE_LIMIT_BY_LEVEL', 'rate_limit_by_level'],
    ['DISCORD_MESSAGE_FULL_TOOL_CHANNEL_IDS', 'message_full_tool_channel_ids'],
    ['DISCORD_STATUS', 'status_text'],
    ['DISCORD_ACTIVITY_TYPE', 'activity_type'],
  ];

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO discord_config (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
  );

  let seeded = 0;
  writeTransaction(db, (_db) => {
    for (const [envKey, dbKey] of envMappings) {
      const value = process.env[envKey];
      if (value !== undefined && value !== '') {
        const result = stmt.run(dbKey, value);
        if (result.changes > 0) seeded++;
      }
    }
  });

  if (seeded > 0) {
    log.info('Discord config seeded from environment', { count: seeded });
  }
}
