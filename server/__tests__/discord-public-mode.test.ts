import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';

// Mock worktree creation — git is not available in CI / test environments.
mock.module('../lib/worktree', () => ({
    createWorktree: async () => ({ success: true, worktreeDir: '/tmp/mock-worktree' }),
    generateChatBranchName: (agent: string, id: string) => `chat/${agent}/${id.slice(0, 8)}`,
    getWorktreeBaseDir: (dir: string) => `${dir}/.worktrees`,
    removeWorktree: async () => ({ success: true }),
}));

import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import type { DiscordBridgeConfig } from '../discord/types';
import { PermissionLevel } from '../discord/types';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { createSession } from '../db/sessions';
import { resolvePermissionLevel, checkRateLimit, PUBLIC_MODE_RATE_LIMIT_DEFAULTS } from '../discord/permissions';

function createMockProcessManager() {
    return {
        getActiveSessionIds: () => [] as string[],
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        subscribeAll: mock(() => {}),
        unsubscribeAll: mock(() => {}),
        resumeProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        isRunning: mock(() => true),
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
    test('public mode BASIC user @mention gets redirected to /message (no full session)', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            // defaultPermissionLevel defaults to BASIC when not specified
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const fetchBodies: unknown[] = [];
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        // BASIC user @mentions the bot — should get redirect, not a full session
        await callHandleMessage(bridge, {
            id: '200000000000000001',
            channel_id: '100000000000000001',
            author: { id: 'random-user-12345678', username: 'RandomUser' },
            content: '<@999000000000000001> hello',
            timestamp: new Date().toISOString(),
            mentions: [{ id: '999000000000000001', username: 'Bot' }],
            member: { roles: [] },
        });

        // No full session — BASIC users use /message instead
        expect(pm.startProcess).not.toHaveBeenCalled();
        // Redirect message sent
        const msg = fetchBodies.find((b: unknown) => (b as { content?: string }).content) as { content: string } | undefined;
        expect(msg?.content).toContain('/message');
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
        const mutedUsers = new Set<string>();

        // User with admin role gets ADMIN level
        expect(resolvePermissionLevel(config, mutedUsers, 'user-1', ['basic-role-00000001', 'admin-role-00000001'])).toBe(PermissionLevel.ADMIN);

        // User with only basic role gets BASIC
        expect(resolvePermissionLevel(config, mutedUsers, 'user-2', ['basic-role-00000001'])).toBe(PermissionLevel.BASIC);

        // User with no matching roles gets default
        expect(resolvePermissionLevel(config, mutedUsers, 'user-3', ['unknown-role-00001'])).toBe(PermissionLevel.BASIC);
    });

    test('muted users are blocked regardless of roles', async () => {
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            rolePermissions: { 'admin-role-00000001': PermissionLevel.ADMIN },
        };
        const mutedUsers = new Set<string>();

        mutedUsers.add('user-muted-1234567');

        // Even with admin role, muted user is BLOCKED
        expect(resolvePermissionLevel(config, mutedUsers, 'user-muted-1234567', ['admin-role-00000001'])).toBe(PermissionLevel.BLOCKED);

        // Unmute restores access
        mutedUsers.delete('user-muted-1234567');
        expect(resolvePermissionLevel(config, mutedUsers, 'user-muted-1234567', ['admin-role-00000001'])).toBe(PermissionLevel.ADMIN);
    });

    test('legacy mode (no publicMode) uses allowedUserIds', async () => {
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: ['allowed-user-123456'],
        };
        const mutedUsers = new Set<string>();

        // Allowed user gets ADMIN level
        expect(resolvePermissionLevel(config, mutedUsers, 'allowed-user-123456')).toBe(PermissionLevel.ADMIN);
        // Non-allowed user gets BLOCKED
        expect(resolvePermissionLevel(config, mutedUsers, 'unknown-user-654321')).toBe(PermissionLevel.BLOCKED);
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
        const timestamps = new Map<string, number[]>();

        // Basic user: limit of 3
        expect(checkRateLimit(config, timestamps, 'basic-user-12345678', 60_000, 10, PermissionLevel.BASIC)).toBe(true);
        expect(checkRateLimit(config, timestamps, 'basic-user-12345678', 60_000, 10, PermissionLevel.BASIC)).toBe(true);
        expect(checkRateLimit(config, timestamps, 'basic-user-12345678', 60_000, 10, PermissionLevel.BASIC)).toBe(true);
        expect(checkRateLimit(config, timestamps, 'basic-user-12345678', 60_000, 10, PermissionLevel.BASIC)).toBe(false); // 4th blocked

        // Admin user: limit of 50
        for (let i = 0; i < 50; i++) {
            expect(checkRateLimit(config, timestamps, 'admin-user-12345678', 60_000, 10, PermissionLevel.ADMIN)).toBe(true);
        }
        expect(checkRateLimit(config, timestamps, 'admin-user-12345678', 60_000, 10, PermissionLevel.ADMIN)).toBe(false); // 51st blocked
    });

    test('default rate limit when no level-based config', async () => {
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const timestamps = new Map<string, number[]>();

        // Default is 10 messages per window
        for (let i = 0; i < 10; i++) {
            expect(checkRateLimit(config, timestamps, 'default-user-1234567', 60_000, 10)).toBe(true);
        }
        expect(checkRateLimit(config, timestamps, 'default-user-1234567', 60_000, 10)).toBe(false);
    });
});

describe('DiscordBridge permission constants', () => {
    test('permission levels are ordered correctly', () => {
        expect(PermissionLevel.BLOCKED).toBeLessThan(PermissionLevel.BASIC);
        expect(PermissionLevel.BASIC).toBeLessThan(PermissionLevel.STANDARD);
        expect(PermissionLevel.STANDARD).toBeLessThan(PermissionLevel.ADMIN);
    });
});

describe('public mode rate limit defaults', () => {
    test('BASIC users are limited to 5 per window when publicMode is true', () => {
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
        };
        const timestamps = new Map<string, number[]>();

        // BASIC user: capped at 5 (PUBLIC_MODE_RATE_LIMIT_DEFAULTS[BASIC])
        for (let i = 0; i < PUBLIC_MODE_RATE_LIMIT_DEFAULTS[PermissionLevel.BASIC]; i++) {
            expect(checkRateLimit(config, timestamps, 'basic-user-pub-1234', 60_000, 10, PermissionLevel.BASIC)).toBe(true);
        }
        expect(checkRateLimit(config, timestamps, 'basic-user-pub-1234', 60_000, 10, PermissionLevel.BASIC)).toBe(false);
    });

    test('STANDARD users are limited to 20 per window when publicMode is true', () => {
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
        };
        const timestamps = new Map<string, number[]>();

        for (let i = 0; i < PUBLIC_MODE_RATE_LIMIT_DEFAULTS[PermissionLevel.STANDARD]; i++) {
            expect(checkRateLimit(config, timestamps, 'std-user-pub-12345', 60_000, 10, PermissionLevel.STANDARD)).toBe(true);
        }
        expect(checkRateLimit(config, timestamps, 'std-user-pub-12345', 60_000, 10, PermissionLevel.STANDARD)).toBe(false);
    });

    test('explicit rateLimitByLevel overrides public mode defaults', () => {
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            rateLimitByLevel: { [PermissionLevel.BASIC]: 2 }, // override: only 2
        };
        const timestamps = new Map<string, number[]>();

        expect(checkRateLimit(config, timestamps, 'user-override-12345', 60_000, 10, PermissionLevel.BASIC)).toBe(true);
        expect(checkRateLimit(config, timestamps, 'user-override-12345', 60_000, 10, PermissionLevel.BASIC)).toBe(true);
        expect(checkRateLimit(config, timestamps, 'user-override-12345', 60_000, 10, PermissionLevel.BASIC)).toBe(false); // 3rd blocked by override
    });

    test('non-public mode ignores public mode defaults', () => {
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: false,
        };
        const timestamps = new Map<string, number[]>();

        // Non-public mode uses the 10-message default, not 5
        for (let i = 0; i < 10; i++) {
            expect(checkRateLimit(config, timestamps, 'non-pub-user-12345', 60_000, 10, PermissionLevel.BASIC)).toBe(true);
        }
        expect(checkRateLimit(config, timestamps, 'non-pub-user-12345', 60_000, 10, PermissionLevel.BASIC)).toBe(false);
    });
});

describe('BASIC user @mention redirect', () => {
    test('BASIC user @mention in public mode gets /message redirect', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            defaultPermissionLevel: PermissionLevel.BASIC,
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const fetchBodies: unknown[] = [];
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        await callHandleMessage(bridge, {
            id: '200000000000000020',
            channel_id: '100000000000000001',
            author: { id: 'basic-user-pub-5678', username: 'BasicUser' },
            content: '<@999000000000000001> can you help me?',
            timestamp: new Date().toISOString(),
            mentions: [{ id: '999000000000000001', username: 'Bot' }],
            member: { roles: [] },
        });

        // Should NOT start a full session
        expect(pm.startProcess).not.toHaveBeenCalled();
        // Should send helpful redirect message
        const msg = fetchBodies.find((b: unknown) => (b as { content?: string }).content) as { content: string } | undefined;
        expect(msg?.content).toContain('/message');
    });

    test('STANDARD user @mention in public mode creates full session', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            defaultPermissionLevel: PermissionLevel.STANDARD,
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        await callHandleMessage(bridge, {
            id: '200000000000000021',
            channel_id: '100000000000000001',
            author: { id: 'std-user-pub-567890', username: 'StdUser' },
            content: '<@999000000000000001> help',
            timestamp: new Date().toISOString(),
            mentions: [{ id: '999000000000000001', username: 'Bot' }],
            member: { roles: [] },
        });

        // STANDARD user gets a full session
        expect(pm.startProcess).toHaveBeenCalled();
    });
});

describe('BASIC user thread access gating', () => {
    test('BASIC user cannot send messages in a thread created by another user', async () => {
        const pm = createMockProcessManager();
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            defaultPermissionLevel: PermissionLevel.BASIC,
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        // Create session in DB (owned by another user)
        const session = createSession(db, {
            projectId: project.id,
            agentId: agent.id,
            name: 'Discord thread:thread-id-pub-123456',
            initialPrompt: 'hello',
            source: 'discord',
        });

        // Inject a thread session owned by another user
        const threadSessions = (bridge as unknown as { threadSessions: Map<string, import('../discord/thread-manager').ThreadSessionInfo> }).threadSessions;
        threadSessions.set('thread-id-pub-123456', {
            sessionId: session.id,
            agentName: 'TestAgent',
            agentModel: 'claude-sonnet-4-6',
            ownerUserId: 'other-user-pub-7890',
        });

        const fetchBodies: unknown[] = [];
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        // BASIC user (not owner) tries to message in the thread
        await callHandleMessage(bridge, {
            id: '200000000000000030',
            channel_id: 'thread-id-pub-123456',
            author: { id: 'basic-user-pub-2345', username: 'BasicUser' },
            content: 'hello in thread',
            timestamp: new Date().toISOString(),
            member: { roles: [] },
        });

        expect(pm.sendMessage).not.toHaveBeenCalled();
        const msg = fetchBodies.find((b: unknown) => (b as { content?: string }).content) as { content: string } | undefined;
        expect(msg?.content).toContain('/message');
    });

    test('BASIC user can message in their own thread', async () => {
        const pm = createMockProcessManager();
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            defaultPermissionLevel: PermissionLevel.BASIC,
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        // Create the session in DB so getSession() finds it
        const session = createSession(db, {
            projectId: project.id,
            agentId: agent.id,
            name: 'Discord thread:thread-id-own-123456',
            initialPrompt: 'hello',
            source: 'discord',
        });

        // Thread owned by the SAME user
        const threadSessions = (bridge as unknown as { threadSessions: Map<string, import('../discord/thread-manager').ThreadSessionInfo> }).threadSessions;
        threadSessions.set('thread-id-own-123456', {
            sessionId: session.id,
            agentName: 'TestAgent',
            agentModel: 'claude-sonnet-4-6',
            ownerUserId: 'basic-user-owner-789',
        });

        await callHandleMessage(bridge, {
            id: '200000000000000031',
            channel_id: 'thread-id-own-123456',
            author: { id: 'basic-user-owner-789', username: 'BasicOwner' },
            content: 'hello in my own thread',
            timestamp: new Date().toISOString(),
            member: { roles: [] },
        });

        // Owner should be able to message — sendMessage is called
        expect(pm.sendMessage).toHaveBeenCalled();
    });

    test('STANDARD user can access any thread regardless of owner', async () => {
        const pm = createMockProcessManager();
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            defaultPermissionLevel: PermissionLevel.STANDARD,
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        // Create the session in DB so getSession() finds it
        const session = createSession(db, {
            projectId: project.id,
            agentId: agent.id,
            name: 'Discord thread:thread-id-std-123456',
            initialPrompt: 'hello',
            source: 'discord',
        });

        const threadSessions = (bridge as unknown as { threadSessions: Map<string, import('../discord/thread-manager').ThreadSessionInfo> }).threadSessions;
        threadSessions.set('thread-id-std-123456', {
            sessionId: session.id,
            agentName: 'TestAgent',
            agentModel: 'claude-sonnet-4-6',
            ownerUserId: 'some-other-user-1234',
        });

        await callHandleMessage(bridge, {
            id: '200000000000000032',
            channel_id: 'thread-id-std-123456',
            author: { id: 'standard-user-12345', username: 'StdUser' },
            content: 'hello in someone else thread',
            timestamp: new Date().toISOString(),
            member: { roles: [] },
        });

        // STANDARD user can access any thread
        expect(pm.sendMessage).toHaveBeenCalled();
    });
});
