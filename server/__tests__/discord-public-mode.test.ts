import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import type { DiscordBridgeConfig } from '../discord/types';
import { PermissionLevel } from '../discord/types';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';

function createMockProcessManager() {
    return {
        getActiveSessionIds: () => [] as string[],
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        resumeProcess: mock(() => {}),
    } as unknown as import('../process/manager').ProcessManager;
}

function setBotUserId(bridge: DiscordBridge, botUserId: string): void {
    (bridge as unknown as { botUserId: string }).botUserId = botUserId;
}

function callHandleMessage(bridge: DiscordBridge, msg: unknown): Promise<void> {
    return (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage(msg);
}

let db: Database;
let originalFetch: typeof fetch;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    db.close();
    globalThis.fetch = originalFetch;
});

describe('DiscordBridge public mode', () => {
    test('public mode allows any user with default BASIC level', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        // Any user can @mention the bot
        await callHandleMessage(bridge, {
            id: '200000000000000001',
            channel_id: '100000000000000001',
            author: { id: 'random-user-12345678', username: 'RandomUser' },
            content: '<@999000000000000001> hello',
            timestamp: new Date().toISOString(),
            mentions: [{ id: '999000000000000001', username: 'Bot' }],
            member: { roles: [] },
        });

        expect(pm.startProcess).toHaveBeenCalled();
    });

    test('blocked permission level prevents interaction', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            rolePermissions: { 'blocked-role-00001': PermissionLevel.BLOCKED },
            defaultPermissionLevel: PermissionLevel.BLOCKED, // default is blocked
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const fetchBodies: unknown[] = [];
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        await callHandleMessage(bridge, {
            id: '200000000000000002',
            channel_id: '100000000000000001',
            author: { id: 'user-blocked-123456', username: 'BlockedUser' },
            content: '<@999000000000000001> hello',
            timestamp: new Date().toISOString(),
            mentions: [{ id: '999000000000000001', username: 'Bot' }],
            member: { roles: [] },
        });

        expect(pm.startProcess).not.toHaveBeenCalled();
        const msg = fetchBodies.find((b: unknown) => (b as { content?: string }).content) as { content: string } | undefined;
        expect(msg?.content).toContain('permission');
    });

    test('role-based permissions resolve highest matching role', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            rolePermissions: {
                'basic-role-00000001': PermissionLevel.BASIC,
                'admin-role-00000001': PermissionLevel.ADMIN,
            },
            defaultPermissionLevel: PermissionLevel.BASIC,
        };
        const bridge = new DiscordBridge(db, pm, config);

        const resolvePermLevel = (bridge as unknown as {
            resolvePermissionLevel: (userId: string, roles?: string[]) => number;
        }).resolvePermissionLevel.bind(bridge);

        // User with admin role gets ADMIN level
        expect(resolvePermLevel('user-1', ['basic-role-00000001', 'admin-role-00000001'])).toBe(PermissionLevel.ADMIN);

        // User with only basic role gets BASIC
        expect(resolvePermLevel('user-2', ['basic-role-00000001'])).toBe(PermissionLevel.BASIC);

        // User with no matching roles gets default
        expect(resolvePermLevel('user-3', ['unknown-role-00001'])).toBe(PermissionLevel.BASIC);
    });

    test('muted users are blocked regardless of roles', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            rolePermissions: { 'admin-role-00000001': PermissionLevel.ADMIN },
        };
        const bridge = new DiscordBridge(db, pm, config);

        bridge.muteUser('user-muted-1234567');

        const resolvePermLevel = (bridge as unknown as {
            resolvePermissionLevel: (userId: string, roles?: string[]) => number;
        }).resolvePermissionLevel.bind(bridge);

        // Even with admin role, muted user is BLOCKED
        expect(resolvePermLevel('user-muted-1234567', ['admin-role-00000001'])).toBe(PermissionLevel.BLOCKED);

        // Unmute restores access
        bridge.unmuteUser('user-muted-1234567');
        expect(resolvePermLevel('user-muted-1234567', ['admin-role-00000001'])).toBe(PermissionLevel.ADMIN);
    });

    test('legacy mode (no publicMode) uses allowedUserIds', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: ['allowed-user-123456'],
        };
        const bridge = new DiscordBridge(db, pm, config);

        const resolvePermLevel = (bridge as unknown as {
            resolvePermissionLevel: (userId: string, roles?: string[]) => number;
        }).resolvePermissionLevel.bind(bridge);

        // Allowed user gets ADMIN level
        expect(resolvePermLevel('allowed-user-123456')).toBe(PermissionLevel.ADMIN);
        // Non-allowed user gets BLOCKED
        expect(resolvePermLevel('unknown-user-654321')).toBe(PermissionLevel.BLOCKED);
    });
});

describe('DiscordBridge multi-channel', () => {
    test('responds to messages in additional channels', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            additionalChannelIds: ['100000000000000002', '100000000000000003'],
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        // Message in additional channel with @mention
        await callHandleMessage(bridge, {
            id: '200000000000000010',
            channel_id: '100000000000000002',
            author: { id: 'user-1', username: 'TestUser' },
            content: '<@999000000000000001> hello from channel 2',
            timestamp: new Date().toISOString(),
            mentions: [{ id: '999000000000000001', username: 'Bot' }],
        });

        expect(pm.startProcess).toHaveBeenCalled();
    });

    test('ignores messages from non-monitored channels', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            additionalChannelIds: ['100000000000000002'],
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        await callHandleMessage(bridge, {
            id: '200000000000000011',
            channel_id: '100000000000000099',
            author: { id: 'user-1', username: 'TestUser' },
            content: 'hello from unknown channel',
            timestamp: new Date().toISOString(),
        });

        expect(pm.startProcess).not.toHaveBeenCalled();
    });
});

describe('DiscordBridge tiered rate limiting', () => {
    test('higher permission levels get higher rate limits', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            rateLimitByLevel: {
                [PermissionLevel.BASIC]: 3,
                [PermissionLevel.STANDARD]: 10,
                [PermissionLevel.ADMIN]: 50,
            },
        };
        const bridge = new DiscordBridge(db, pm, config);

        const checkRateLimit = (bridge as unknown as {
            checkRateLimit: (userId: string, permLevel?: number) => boolean;
        }).checkRateLimit.bind(bridge);

        // Basic user: limit of 3
        expect(checkRateLimit('basic-user-12345678', PermissionLevel.BASIC)).toBe(true);
        expect(checkRateLimit('basic-user-12345678', PermissionLevel.BASIC)).toBe(true);
        expect(checkRateLimit('basic-user-12345678', PermissionLevel.BASIC)).toBe(true);
        expect(checkRateLimit('basic-user-12345678', PermissionLevel.BASIC)).toBe(false); // 4th blocked

        // Admin user: limit of 50
        for (let i = 0; i < 50; i++) {
            expect(checkRateLimit('admin-user-12345678', PermissionLevel.ADMIN)).toBe(true);
        }
        expect(checkRateLimit('admin-user-12345678', PermissionLevel.ADMIN)).toBe(false); // 51st blocked
    });

    test('default rate limit when no level-based config', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        const checkRateLimit = (bridge as unknown as {
            checkRateLimit: (userId: string, permLevel?: number) => boolean;
        }).checkRateLimit.bind(bridge);

        // Default is 10 messages per window
        for (let i = 0; i < 10; i++) {
            expect(checkRateLimit('default-user-1234567')).toBe(true);
        }
        expect(checkRateLimit('default-user-1234567')).toBe(false);
    });
});

describe('DiscordBridge permission constants', () => {
    test('permission levels are ordered correctly', () => {
        expect(PermissionLevel.BLOCKED).toBeLessThan(PermissionLevel.BASIC);
        expect(PermissionLevel.BASIC).toBeLessThan(PermissionLevel.STANDARD);
        expect(PermissionLevel.STANDARD).toBeLessThan(PermissionLevel.ADMIN);
    });
});
