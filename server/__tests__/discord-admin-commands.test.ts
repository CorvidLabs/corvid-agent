import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { getDiscordConfigRaw } from '../db/discord-config';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import type { DiscordBridgeConfig } from '../discord/types';
import { makeMockChatInteraction } from './helpers/mock-discord-interaction';
import { mockDiscordRest } from './helpers/mock-discord-rest';

function createMockProcessManager() {
  return {
    getActiveSessionIds: () => [] as string[],
    startProcess: mock(() => {}),
    sendMessage: mock(() => true),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    resumeProcess: mock(() => {}),
    isRunning: mock(() => true),
  } as unknown as import('../process/manager').ProcessManager;
}

let db: Database;
let mockRest: ReturnType<typeof mockDiscordRest>;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  mockRest = mockDiscordRest();
});

afterEach(() => {
  mockRest.cleanup();
  db.close();
});

function createBridge(overrides?: Partial<DiscordBridgeConfig>) {
  const pm = createMockProcessManager();
  const config: DiscordBridgeConfig = {
    botToken: 'test-token',
    channelId: '100000000000000001',
    allowedUserIds: ['200000000000000001'], // admin user
    appId: '800000000000000001',
    ...overrides,
  };
  const bridge = new DiscordBridge(db, pm, config);
  // DiscordBridge constructor calls initializeRestClient() which overwrites the mock,
  // so reinstall the mock after construction.
  mockRest = mockDiscordRest();
  return bridge;
}

function callInteraction(bridge: DiscordBridge, interaction: any) {
  return (bridge as any).handleInteraction(interaction);
}

function getResponseText(interaction: ReturnType<typeof makeMockChatInteraction>): string {
  return (
    interaction.getContent() ||
    (interaction.getEmbed()?.description as string) ||
    (interaction.getEmbed()?.title as string) ||
    ''
  );
}

function getResponseEmbed(interaction: ReturnType<typeof makeMockChatInteraction>) {
  return interaction.getEmbed();
}

describe('/admin commands', () => {
  test('rejects non-admin users', async () => {
    const bridge = createBridge();

    const interaction = makeMockChatInteraction('admin', { subcommand: 'show' }, '999000000000000001');
    await callInteraction(bridge, interaction);

    expect(getResponseText(interaction)).toContain('permission');
  });

  // ── Channels ──────────────────────────────────────────────────────

  describe('channels', () => {
    test('add channel persists to DB', async () => {
      const bridge = createBridge();

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'channels',
        subcommand: 'add',
        channels: { channel: { id: '400000000000000001' } },
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('Channel Added');

      const raw = getDiscordConfigRaw(db);
      expect(raw.additional_channel_ids).toBe('400000000000000001');
    });

    test('add duplicate channel shows already monitored', async () => {
      const bridge = createBridge({ additionalChannelIds: ['400000000000000001'] });

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'channels',
        subcommand: 'add',
        channels: { channel: { id: '400000000000000001' } },
      });
      await callInteraction(bridge, interaction);

      expect(getResponseText(interaction)).toContain('already monitored');
    });

    test('add primary channel rejects', async () => {
      const bridge = createBridge();

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'channels',
        subcommand: 'add',
        channels: { channel: { id: '100000000000000001' } },
      });
      await callInteraction(bridge, interaction);

      expect(getResponseText(interaction)).toContain('primary channel');
    });

    test('remove channel persists to DB', async () => {
      const bridge = createBridge({ additionalChannelIds: ['400000000000000001', '400000000000000002'] });
      // Seed the DB so we can verify the update
      db.prepare("INSERT OR REPLACE INTO discord_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(
        'additional_channel_ids',
        '400000000000000001,400000000000000002',
      );

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'channels',
        subcommand: 'remove',
        channels: { channel: { id: '400000000000000001' } },
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('Channel Removed');

      const raw = getDiscordConfigRaw(db);
      expect(raw.additional_channel_ids).toBe('400000000000000002');
    });

    test('remove non-existent channel shows not in list', async () => {
      const bridge = createBridge();

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'channels',
        subcommand: 'remove',
        channels: { channel: { id: '400000000000000099' } },
      });
      await callInteraction(bridge, interaction);

      expect(getResponseText(interaction)).toContain('not in the monitored list');
    });

    test('list shows all channels', async () => {
      const bridge = createBridge({ additionalChannelIds: ['400000000000000001'] });

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'channels',
        subcommand: 'list',
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('Monitored Channels');
      expect(String(embed?.description)).toContain('primary');
    });
  });

  // ── Users ─────────────────────────────────────────────────────────

  describe('users', () => {
    test('add user persists to DB', async () => {
      const bridge = createBridge();

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'users',
        subcommand: 'add',
        users: { user: { id: '500000000000000001' } },
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('User Added');

      const raw = getDiscordConfigRaw(db);
      expect(raw.allowed_user_ids).toContain('500000000000000001');
    });

    test('add duplicate user shows already on list', async () => {
      const bridge = createBridge({ allowedUserIds: ['200000000000000001', '500000000000000001'] });

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'users',
        subcommand: 'add',
        users: { user: { id: '500000000000000001' } },
      });
      await callInteraction(bridge, interaction);

      expect(getResponseText(interaction)).toContain('already on the allow list');
    });

    test('remove user persists to DB', async () => {
      const bridge = createBridge({ allowedUserIds: ['200000000000000001', '500000000000000001'] });
      db.prepare("INSERT OR REPLACE INTO discord_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(
        'allowed_user_ids',
        '200000000000000001,500000000000000001',
      );

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'users',
        subcommand: 'remove',
        users: { user: { id: '500000000000000001' } },
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('User Removed');

      const raw = getDiscordConfigRaw(db);
      expect(raw.allowed_user_ids).toBe('200000000000000001');
    });

    test('list users shows allow list and mode', async () => {
      const bridge = createBridge({ allowedUserIds: ['200000000000000001'] });

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'users',
        subcommand: 'list',
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('Allowed Users');
    });
  });

  // ── Roles ─────────────────────────────────────────────────────────

  describe('roles', () => {
    test('set role permission persists to DB', async () => {
      const bridge = createBridge();

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'roles',
        subcommand: 'set',
        roles: { role: { id: '600000000000000001' } },
        integers: { level: 2 },
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('Role Permission Set');
      expect(String(embed?.description)).toContain('Standard');

      const raw = getDiscordConfigRaw(db);
      const rolePerms = JSON.parse(raw.role_permissions);
      expect(rolePerms['600000000000000001']).toBe(2);
    });

    test('remove role permission', async () => {
      const bridge = createBridge({ rolePermissions: { '600000000000000001': 3 } });
      db.prepare("INSERT OR REPLACE INTO discord_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(
        'role_permissions',
        JSON.stringify({ '600000000000000001': 3 }),
      );

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'roles',
        subcommand: 'remove',
        roles: { role: { id: '600000000000000001' } },
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('Role Permission Removed');

      const raw = getDiscordConfigRaw(db);
      const rolePerms = JSON.parse(raw.role_permissions);
      expect(rolePerms['600000000000000001']).toBeUndefined();
    });

    test('remove non-existent role shows no override', async () => {
      const bridge = createBridge();

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'roles',
        subcommand: 'remove',
        roles: { role: { id: '600000000000000099' } },
      });
      await callInteraction(bridge, interaction);

      expect(getResponseText(interaction)).toContain('no permission override');
    });

    test('list roles shows mappings and defaults', async () => {
      const bridge = createBridge({ rolePermissions: { '600000000000000001': 2, '600000000000000002': 3 } });

      const interaction = makeMockChatInteraction('admin', {
        subcommandGroup: 'roles',
        subcommand: 'list',
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('Role Permissions');
      const fields = embed?.fields as Array<{ name: string; value: string }>;
      expect(fields.find((f) => f.name === 'Default Level')).toBeDefined();
    });
  });

  // ── Mode ──────────────────────────────────────────────────────────

  describe('mode', () => {
    test('set mode to work_intake', async () => {
      const bridge = createBridge();

      const interaction = makeMockChatInteraction('admin', {
        subcommand: 'mode',
        strings: { value: 'work_intake' },
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('Bridge Mode Updated');
      expect(String(embed?.description)).toContain('Work Intake');

      const raw = getDiscordConfigRaw(db);
      expect(raw.mode).toBe('work_intake');
    });
  });

  // ── Public ────────────────────────────────────────────────────────

  describe('public', () => {
    test('enable public mode', async () => {
      const bridge = createBridge();

      const interaction = makeMockChatInteraction('admin', {
        subcommand: 'public',
        booleans: { enabled: true },
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('Public Mode Updated');
      expect(String(embed?.description)).toContain('enabled');

      const raw = getDiscordConfigRaw(db);
      expect(raw.public_mode).toBe('true');
    });

    test('disable public mode', async () => {
      // In public mode, use defaultPermissionLevel=3 so the test user gets ADMIN
      const bridge = createBridge({ publicMode: true, defaultPermissionLevel: 3 });

      const interaction = makeMockChatInteraction('admin', {
        subcommand: 'public',
        booleans: { enabled: false },
      });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(String(embed?.description)).toContain('disabled');
    });
  });

  // ── Show ──────────────────────────────────────────────────────────

  describe('show', () => {
    test('shows full config summary', async () => {
      const bridge = createBridge({
        allowedUserIds: ['200000000000000001'],
        additionalChannelIds: ['400000000000000001'],
        rolePermissions: { '600000000000000001': 2 },
      });

      const interaction = makeMockChatInteraction('admin', { subcommand: 'show' });
      await callInteraction(bridge, interaction);

      const embed = getResponseEmbed(interaction);
      expect(embed?.title).toBe('Bot Configuration');
      const fields = embed?.fields as Array<{ name: string; value: string }>;
      expect(fields.find((f) => f.name === 'Mode')).toBeDefined();
      expect(fields.find((f) => f.name === 'Public Mode')).toBeDefined();
      expect(fields.find((f) => f.name.startsWith('Channels'))).toBeDefined();
      expect(fields.find((f) => f.name === 'Allowed Users')).toBeDefined();
      expect(fields.find((f) => f.name === 'Role Permissions')).toBeDefined();
    });
  });

  // ── Help includes admin section ───────────────────────────────────

  test('/help includes admin configuration section', async () => {
    const bridge = createBridge();

    const adminInteraction = makeMockChatInteraction('admin', {}, '200000000000000001');
    await callInteraction(bridge, adminInteraction);

    // Check /help
    const helpInteraction = makeMockChatInteraction('help', {}, '200000000000000001');
    await callInteraction(bridge, helpInteraction);

    const embed = getResponseEmbed(helpInteraction);
    const fields = embed?.fields as Array<{ name: string }>;
    expect(fields.find((f) => f.name === 'Admin Configuration')).toBeDefined();
  });
});

describe('mute persistence', () => {
  test('muteUser persists to DB', () => {
    const bridge = createBridge();
    bridge.muteUser('999000000000000001');

    const rows = db.query('SELECT user_id FROM discord_muted_users WHERE user_id = ?').all('999000000000000001') as {
      user_id: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe('999000000000000001');
  });

  test('unmuteUser removes from DB', () => {
    const bridge = createBridge();
    bridge.muteUser('999000000000000001');
    bridge.unmuteUser('999000000000000001');

    const rows = db.query('SELECT user_id FROM discord_muted_users').all();
    expect(rows).toHaveLength(0);
  });

  test('muted users restored on start', () => {
    // Seed a muted user directly in DB
    db.run('INSERT INTO discord_muted_users (user_id) VALUES (?)', ['999000000000000001']);

    // Create a bridge with a fuller mock that supports start()
    const pm = {
      ...createMockProcessManager(),
      subscribeAll: mock(() => {}),
      unsubscribeAll: mock(() => {}),
    } as unknown as import('../process/manager').ProcessManager;
    const config: DiscordBridgeConfig = {
      botToken: 'test-token',
      channelId: '100000000000000001',
      allowedUserIds: ['200000000000000001'],
      appId: '800000000000000001',
    };
    const bridge = new DiscordBridge(db, pm, config);
    bridge.start();

    // Verify the bridge loaded the muted user by trying to mute again (idempotent)
    // and checking the DB still has exactly one row
    bridge.muteUser('999000000000000001');
    const rows = db.query('SELECT user_id FROM discord_muted_users').all();
    expect(rows).toHaveLength(1);

    bridge.stop();
  });
});
