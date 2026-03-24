import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import type { DiscordBridgeConfig } from '../discord/types';
import { getDiscordConfigRaw } from '../db/discord-config';

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
let originalFetch: typeof globalThis.fetch;
let fetchBodies: unknown[];

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    fetchBodies = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
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
    return new DiscordBridge(db, pm, config);
}

function callInteraction(bridge: DiscordBridge, data: unknown) {
    return (bridge as unknown as { handleInteraction: (i: unknown) => Promise<void> }).handleInteraction(data);
}

function makeInteraction(commandName: string, options: unknown[], userId = '200000000000000001') {
    return {
        id: '300000000000000001',
        token: 'test-interaction-token-admin-abcdef',
        type: 2, // APPLICATION_COMMAND
        channel_id: '100000000000000001',
        data: { name: commandName, options },
        member: { user: { id: userId, username: 'Admin' }, roles: [] },
    };
}

function getResponseText(): string {
    if (fetchBodies.length === 0) return '';
    const body = fetchBodies[0] as { data?: { content?: string; embeds?: Array<{ title?: string; description?: string }> } };
    return body.data?.content ?? body.data?.embeds?.[0]?.description ?? body.data?.embeds?.[0]?.title ?? '';
}

function getResponseEmbed() {
    if (fetchBodies.length === 0) return null;
    const body = fetchBodies[0] as { data?: { embeds?: Array<Record<string, unknown>> } };
    return body.data?.embeds?.[0] ?? null;
}

describe('/admin commands', () => {
    test('rejects non-admin users', async () => {
        const bridge = createBridge();

        await callInteraction(bridge, makeInteraction('admin', [
            { name: 'show', type: 1 },
        ], '999000000000000001')); // non-admin user

        expect(getResponseText()).toContain('permission');
    });

    // ── Channels ──────────────────────────────────────────────────────

    describe('channels', () => {
        test('add channel persists to DB', async () => {
            const bridge = createBridge();

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'channels', type: 2, options: [
                        { name: 'add', type: 1, options: [{ name: 'channel', type: 7, value: '400000000000000001' }] },
                    ],
                },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('Channel Added');

            const raw = getDiscordConfigRaw(db);
            expect(raw['additional_channel_ids']).toBe('400000000000000001');
        });

        test('add duplicate channel shows already monitored', async () => {
            const bridge = createBridge({ additionalChannelIds: ['400000000000000001'] });

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'channels', type: 2, options: [
                        { name: 'add', type: 1, options: [{ name: 'channel', type: 7, value: '400000000000000001' }] },
                    ],
                },
            ]));

            expect(getResponseText()).toContain('already monitored');
        });

        test('add primary channel rejects', async () => {
            const bridge = createBridge();

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'channels', type: 2, options: [
                        { name: 'add', type: 1, options: [{ name: 'channel', type: 7, value: '100000000000000001' }] },
                    ],
                },
            ]));

            expect(getResponseText()).toContain('primary channel');
        });

        test('remove channel persists to DB', async () => {
            const bridge = createBridge({ additionalChannelIds: ['400000000000000001', '400000000000000002'] });
            // Seed the DB so we can verify the update
            db.prepare('INSERT OR REPLACE INTO discord_config (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))').run(
                'additional_channel_ids', '400000000000000001,400000000000000002',
            );

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'channels', type: 2, options: [
                        { name: 'remove', type: 1, options: [{ name: 'channel', type: 7, value: '400000000000000001' }] },
                    ],
                },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('Channel Removed');

            const raw = getDiscordConfigRaw(db);
            expect(raw['additional_channel_ids']).toBe('400000000000000002');
        });

        test('remove non-existent channel shows not in list', async () => {
            const bridge = createBridge();

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'channels', type: 2, options: [
                        { name: 'remove', type: 1, options: [{ name: 'channel', type: 7, value: '400000000000000099' }] },
                    ],
                },
            ]));

            expect(getResponseText()).toContain('not in the monitored list');
        });

        test('list shows all channels', async () => {
            const bridge = createBridge({ additionalChannelIds: ['400000000000000001'] });

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'channels', type: 2, options: [
                        { name: 'list', type: 1 },
                    ],
                },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('Monitored Channels');
            expect(String(embed?.description)).toContain('primary');
        });
    });

    // ── Users ─────────────────────────────────────────────────────────

    describe('users', () => {
        test('add user persists to DB', async () => {
            const bridge = createBridge();

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'users', type: 2, options: [
                        { name: 'add', type: 1, options: [{ name: 'user', type: 6, value: '500000000000000001' }] },
                    ],
                },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('User Added');

            const raw = getDiscordConfigRaw(db);
            expect(raw['allowed_user_ids']).toContain('500000000000000001');
        });

        test('add duplicate user shows already on list', async () => {
            const bridge = createBridge({ allowedUserIds: ['200000000000000001', '500000000000000001'] });

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'users', type: 2, options: [
                        { name: 'add', type: 1, options: [{ name: 'user', type: 6, value: '500000000000000001' }] },
                    ],
                },
            ]));

            expect(getResponseText()).toContain('already on the allow list');
        });

        test('remove user persists to DB', async () => {
            const bridge = createBridge({ allowedUserIds: ['200000000000000001', '500000000000000001'] });
            db.prepare('INSERT OR REPLACE INTO discord_config (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))').run(
                'allowed_user_ids', '200000000000000001,500000000000000001',
            );

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'users', type: 2, options: [
                        { name: 'remove', type: 1, options: [{ name: 'user', type: 6, value: '500000000000000001' }] },
                    ],
                },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('User Removed');

            const raw = getDiscordConfigRaw(db);
            expect(raw['allowed_user_ids']).toBe('200000000000000001');
        });

        test('list users shows allow list and mode', async () => {
            const bridge = createBridge({ allowedUserIds: ['200000000000000001'] });

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'users', type: 2, options: [
                        { name: 'list', type: 1 },
                    ],
                },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('Allowed Users');
        });
    });

    // ── Roles ─────────────────────────────────────────────────────────

    describe('roles', () => {
        test('set role permission persists to DB', async () => {
            const bridge = createBridge();

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'roles', type: 2, options: [
                        {
                            name: 'set', type: 1, options: [
                                { name: 'role', type: 8, value: '600000000000000001' },
                                { name: 'level', type: 4, value: 2 },
                            ],
                        },
                    ],
                },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('Role Permission Set');
            expect(String(embed?.description)).toContain('Standard');

            const raw = getDiscordConfigRaw(db);
            const rolePerms = JSON.parse(raw['role_permissions']);
            expect(rolePerms['600000000000000001']).toBe(2);
        });

        test('remove role permission', async () => {
            const bridge = createBridge({ rolePermissions: { '600000000000000001': 3 } });
            db.prepare('INSERT OR REPLACE INTO discord_config (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))').run(
                'role_permissions', JSON.stringify({ '600000000000000001': 3 }),
            );

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'roles', type: 2, options: [
                        {
                            name: 'remove', type: 1, options: [
                                { name: 'role', type: 8, value: '600000000000000001' },
                            ],
                        },
                    ],
                },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('Role Permission Removed');

            const raw = getDiscordConfigRaw(db);
            const rolePerms = JSON.parse(raw['role_permissions']);
            expect(rolePerms['600000000000000001']).toBeUndefined();
        });

        test('remove non-existent role shows no override', async () => {
            const bridge = createBridge();

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'roles', type: 2, options: [
                        {
                            name: 'remove', type: 1, options: [
                                { name: 'role', type: 8, value: '600000000000000099' },
                            ],
                        },
                    ],
                },
            ]));

            expect(getResponseText()).toContain('no permission override');
        });

        test('list roles shows mappings and defaults', async () => {
            const bridge = createBridge({ rolePermissions: { '600000000000000001': 2, '600000000000000002': 3 } });

            await callInteraction(bridge, makeInteraction('admin', [
                {
                    name: 'roles', type: 2, options: [
                        { name: 'list', type: 1 },
                    ],
                },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('Role Permissions');
            const fields = embed?.fields as Array<{ name: string; value: string }>;
            expect(fields.find(f => f.name === 'Default Level')).toBeDefined();
        });
    });

    // ── Mode ──────────────────────────────────────────────────────────

    describe('mode', () => {
        test('set mode to work_intake', async () => {
            const bridge = createBridge();

            await callInteraction(bridge, makeInteraction('admin', [
                { name: 'mode', type: 1, options: [{ name: 'value', type: 3, value: 'work_intake' }] },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('Bridge Mode Updated');
            expect(String(embed?.description)).toContain('Work Intake');

            const raw = getDiscordConfigRaw(db);
            expect(raw['mode']).toBe('work_intake');
        });
    });

    // ── Public ────────────────────────────────────────────────────────

    describe('public', () => {
        test('enable public mode', async () => {
            const bridge = createBridge();

            await callInteraction(bridge, makeInteraction('admin', [
                { name: 'public', type: 1, options: [{ name: 'enabled', type: 5, value: true }] },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('Public Mode Updated');
            expect(String(embed?.description)).toContain('enabled');

            const raw = getDiscordConfigRaw(db);
            expect(raw['public_mode']).toBe('true');
        });

        test('disable public mode', async () => {
            // In public mode, use defaultPermissionLevel=3 so the test user gets ADMIN
            const bridge = createBridge({ publicMode: true, defaultPermissionLevel: 3 });

            await callInteraction(bridge, makeInteraction('admin', [
                { name: 'public', type: 1, options: [{ name: 'enabled', type: 5, value: false }] },
            ]));

            const embed = getResponseEmbed();
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

            await callInteraction(bridge, makeInteraction('admin', [
                { name: 'show', type: 1 },
            ]));

            const embed = getResponseEmbed();
            expect(embed?.title).toBe('Bot Configuration');
            const fields = embed?.fields as Array<{ name: string; value: string }>;
            expect(fields.find(f => f.name === 'Mode')).toBeDefined();
            expect(fields.find(f => f.name === 'Public Mode')).toBeDefined();
            expect(fields.find(f => f.name.startsWith('Channels'))).toBeDefined();
            expect(fields.find(f => f.name === 'Allowed Users')).toBeDefined();
            expect(fields.find(f => f.name === 'Role Permissions')).toBeDefined();
        });
    });

    // ── Help includes admin section ───────────────────────────────────

    test('/help includes admin configuration section', async () => {
        const bridge = createBridge();

        await callInteraction(bridge, makeInteraction('admin', [], '200000000000000001'));

        // Reset and check /help
        fetchBodies.length = 0;
        await callInteraction(bridge, {
            id: '300000000000000002',
            token: 'test-interaction-token-help-abcdef',
            type: 2,
            channel_id: '100000000000000001',
            data: { name: 'help' },
            member: { user: { id: '200000000000000001', username: 'Admin' }, roles: [] },
        });

        const embed = getResponseEmbed();
        const fields = embed?.fields as Array<{ name: string }>;
        expect(fields.find(f => f.name === 'Admin Configuration')).toBeDefined();
    });
});

describe('mute persistence', () => {
    test('muteUser persists to DB', () => {
        const bridge = createBridge();
        bridge.muteUser('999000000000000001');

        const rows = db.query('SELECT user_id FROM discord_muted_users WHERE user_id = ?').all('999000000000000001') as { user_id: string }[];
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
