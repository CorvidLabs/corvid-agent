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
import { resolvePermissionLevel, checkRateLimit } from '../discord/permissions';

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
    test('BASIC user @mention in public mode receives /message guidance', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const fetchBodies: unknown[] = [];
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        // BASIC user @mentions the bot
        await callHandleMessage(bridge, {
            id: '200000000000000001',
            channel_id: '100000000000000001',
            author: { id: 'basic-user-12345678', username: 'BasicUser' },
            content: '<@999000000000000001> hello',
            timestamp: new Date().toISOString(),
            mentions: [{ id: '999000000000000001', username: 'Bot' }],
            member: { roles: [] },
        });

        // Should NOT start a full session for BASIC @mention in public mode
        expect(pm.startProcess).not.toHaveBeenCalled();
        // Should send guidance message pointing to /message
        const guidanceMsg = fetchBodies.find((b: unknown) =>
            typeof (b as { content?: string }).content === 'string' &&
            (b as { content: string }).content.includes('/message')
        ) as { content: string } | undefined;
        expect(guidanceMsg).toBeTruthy();
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

    test('STANDARD user @mention in public mode starts a full session', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            rolePermissions: { 'standard-role-001': PermissionLevel.STANDARD },
            defaultPermissionLevel: PermissionLevel.BLOCKED,
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        await callHandleMessage(bridge, {
            id: '200000000000000030',
            channel_id: '100000000000000001',
            author: { id: 'standard-user-1234', username: 'StdUser' },
            content: '<@999000000000000001> hello',
            timestamp: new Date().toISOString(),
            mentions: [{ id: '999000000000000001', username: 'Bot' }],
            member: { roles: ['standard-role-001'] },
        });

        expect(pm.startProcess).toHaveBeenCalled();
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

describe('DiscordBridge thread access gating', () => {
    test('BASIC user in a thread gets a conversation-only session (no tools)', async () => {
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

        // Simulate an existing thread session (created by a STANDARD user)
        const threadId = '100000000000000050';
        (bridge as unknown as {
            threadSessions: Map<string, { sessionId: string; agentName: string; agentModel: string; ownerUserId: string }>
        }).threadSessions.set(threadId, {
            sessionId: 'thread-session-abc123',
            agentName: 'TestAgent',
            agentModel: 'claude-sonnet-4-6',
            ownerUserId: 'standard-user-owner',
        });

        // BASIC user (no special roles, default BASIC in public mode) sends in the thread
        await callHandleMessage(bridge, {
            id: '200000000000000050',
            channel_id: threadId,
            author: { id: 'basic-user-9999', username: 'BasicInThread' },
            content: 'hello from basic user',
            timestamp: new Date().toISOString(),
            member: { roles: [] },
        });

        // A new conversation-only session should be started (not sendMessage to the existing one)
        expect(pm.startProcess).toHaveBeenCalled();
        const startCall = (pm.startProcess as ReturnType<typeof mock>).mock.calls[0];
        // Third argument should include conversationOnly: true
        expect(startCall[2]).toEqual(expect.objectContaining({ conversationOnly: true }));
        // The existing thread session should NOT receive the message
        expect(pm.sendMessage).not.toHaveBeenCalledWith('thread-session-abc123', expect.anything());
    });

    test('STANDARD user in a thread does NOT get conversation-only restriction', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            rolePermissions: { 'std-role-000001': PermissionLevel.STANDARD },
            defaultPermissionLevel: PermissionLevel.BLOCKED,
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const threadId = '100000000000000051';
        (bridge as unknown as {
            threadSessions: Map<string, { sessionId: string; agentName: string; agentModel: string; ownerUserId: string }>
        }).threadSessions.set(threadId, {
            sessionId: 'thread-session-def456',
            agentName: 'TestAgent',
            agentModel: 'claude-sonnet-4-6',
            ownerUserId: 'standard-user-owner',
        });

        // STANDARD user sends in the thread
        await callHandleMessage(bridge, {
            id: '200000000000000051',
            channel_id: threadId,
            author: { id: 'standard-user-9876', username: 'StdInThread' },
            content: 'hello from standard user',
            timestamp: new Date().toISOString(),
            member: { roles: ['std-role-000001'] },
        });

        // If startProcess was called, it must NOT have conversationOnly: true
        // (thread session expired and was resumed without conversation-only restriction)
        const startCalls = (pm.startProcess as ReturnType<typeof mock>).mock.calls;
        if (startCalls.length > 0) {
            const options = startCalls[0][2] as { conversationOnly?: boolean } | undefined;
            expect(options?.conversationOnly).not.toBe(true);
        } else {
            // sendMessage was used instead — no restriction applies
            expect(pm.sendMessage).toHaveBeenCalled();
        }
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

    test('BASIC users in public mode default to 5 messages per window', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        // Public mode with a thread so BASIC users can interact (not redirected)
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            publicMode: true,
            // No rateLimitByLevel — should default BASIC to 5
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const threadId = '100000000000000060';
        (bridge as unknown as {
            threadSessions: Map<string, { sessionId: string; agentName: string; agentModel: string; ownerUserId: string }>
        }).threadSessions.set(threadId, {
            sessionId: 'session-rate-test-001',
            agentName: 'TestAgent',
            agentModel: 'claude-sonnet-4-6',
            ownerUserId: 'owner-user',
        });

        const fetchBodies: unknown[] = [];
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({ id: 'fake-msg-id' }), { status: 200 });
        }) as unknown as typeof fetch;

        // Send 5 messages — all should be processed
        for (let i = 0; i < 5; i++) {
            await callHandleMessage(bridge, {
                id: `rate-msg-${i}-00000000000000`,
                channel_id: threadId,
                author: { id: 'basic-rate-user-001', username: 'BasicRateUser' },
                content: `message ${i}`,
                timestamp: new Date().toISOString(),
                member: { roles: [] },
            });
        }

        // 6th message should be rate-limited
        await callHandleMessage(bridge, {
            id: 'rate-msg-5-000000000000000',
            channel_id: threadId,
            author: { id: 'basic-rate-user-001', username: 'BasicRateUser' },
            content: 'message 5',
            timestamp: new Date().toISOString(),
            member: { roles: [] },
        });

        const rateLimitMsg = fetchBodies.find((b: unknown) =>
            typeof (b as { content?: string }).content === 'string' &&
            (b as { content: string }).content.toLowerCase().includes('slow down')
        );
        expect(rateLimitMsg).toBeTruthy();
    });
});

describe('DiscordBridge permission constants', () => {
    test('permission levels are ordered correctly', () => {
        expect(PermissionLevel.BLOCKED).toBeLessThan(PermissionLevel.BASIC);
        expect(PermissionLevel.BASIC).toBeLessThan(PermissionLevel.STANDARD);
        expect(PermissionLevel.STANDARD).toBeLessThan(PermissionLevel.ADMIN);
    });
});
