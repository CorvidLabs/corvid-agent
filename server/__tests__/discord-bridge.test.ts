import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import { GatewayOp } from '../discord/types';
import type { DiscordBridgeConfig } from '../discord/types';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import type { WorkTask } from '../../shared/types/work-tasks';

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
    } as unknown as import('../process/manager').ProcessManager;
}

function createMockWorkTaskService() {
    const completionCallbacks = new Map<string, (task: WorkTask) => void>();
    return {
        create: mock(async (input: { description: string; agentId: string }) => ({
            id: 'task-123',
            agentId: input.agentId,
            projectId: 'proj-1',
            sessionId: null,
            source: 'discord' as const,
            sourceId: null,
            requesterInfo: {},
            description: input.description,
            branchName: null,
            status: 'pending' as const,
            prUrl: null,
            summary: null,
            error: null,
            originalBranch: null,
            worktreeDir: null,
            iterationCount: 0,
            maxRetries: 0,
            retryCount: 0,
            retryBackoff: 'fixed' as const,
            lastRetryAt: null,
            priority: 2 as const,
            preemptedBy: null,
            createdAt: new Date().toISOString(),
            completedAt: null,
        })),
        onComplete: mock((taskId: string, callback: (task: WorkTask) => void) => {
            completionCallbacks.set(taskId, callback);
        }),
        _triggerComplete: (taskId: string, task: WorkTask) => {
            const cb = completionCallbacks.get(taskId);
            if (cb) cb(task);
        },
    } as unknown as import('../work/service').WorkTaskService & {
        _triggerComplete: (taskId: string, task: WorkTask) => void;
    };
}

/** Set the bot's user ID on the bridge (simulates READY event). */
function setBotUserId(bridge: DiscordBridge, botUserId: string): void {
    (bridge as unknown as { botUserId: string }).botUserId = botUserId;
}

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

describe('DiscordBridge', () => {
    test('constructor creates bridge', () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);
        expect(bridge).toBeDefined();
    });

    test('gateway opcodes are correct', () => {
        expect(GatewayOp.DISPATCH).toBe(0);
        expect(GatewayOp.HEARTBEAT).toBe(1);
        expect(GatewayOp.IDENTIFY).toBe(2);
        expect(GatewayOp.HELLO).toBe(10);
        expect(GatewayOp.HEARTBEAT_ACK).toBe(11);
    });

    test('ignores bot messages', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
            id: '1',
            channel_id: '100000000000000001',
            author: { id: 'bot-1', username: 'TestBot', bot: true },
            content: 'hello from bot',
            timestamp: new Date().toISOString(),
        });

        expect(pm.startProcess).not.toHaveBeenCalled();
    });

    test('ignores messages from other channels', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000002',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
            id: '1',
            channel_id: '100000000000000003',
            author: { id: 'user-1', username: 'TestUser' },
            content: 'hello',
            timestamp: new Date().toISOString(),
        });

        expect(pm.startProcess).not.toHaveBeenCalled();
    });

    test('ignores regular channel messages (passive mode)', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const fetchCalls: string[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (url: string | URL | Request) => {
            fetchCalls.push(String(url));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            // Regular message without @mention — should be silently ignored
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000001',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'Hello everyone',
                timestamp: new Date().toISOString(),
                mentions: [], // no mentions
            });

            expect(pm.startProcess).not.toHaveBeenCalled();
            expect(fetchCalls.length).toBe(0);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('@mention triggers one-off reply', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000001',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@999000000000000001> what time is it?',
                timestamp: new Date().toISOString(),
                mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
            });

            // Should start a process for one-off reply
            expect(pm.startProcess).toHaveBeenCalled();
            // Should subscribe for response
            expect(pm.subscribe).toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('sendMessage splits long messages', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        const fetchCalls: number[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            fetchCalls.push(1);
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            // Short message — single API call
            await bridge.sendMessage('100000000000000001', 'Hello');
            expect(fetchCalls.length).toBe(1);

            // Long message (>2000 chars) — split into multiple calls
            fetchCalls.length = 0;
            const longText = 'x'.repeat(3000);
            await bridge.sendMessage('100000000000000001', longText);
            expect(fetchCalls.length).toBe(2);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('stop clears running state', () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        // Mock connect to prevent actual WebSocket
        (bridge as unknown as { connect: () => void }).connect = mock(() => {});

        bridge.start();
        expect((bridge as unknown as { running: boolean }).running).toBe(true);

        bridge.stop();
        expect((bridge as unknown as { running: boolean }).running).toBe(false);
    });

    test('thread messages route to session', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        // Simulate a tracked thread session
        const threadSessions = (bridge as unknown as { threadSessions: Map<string, unknown> }).threadSessions;
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        // Create a real session to query
        const { createSession } = await import('../db/sessions');
        const session = createSession(db, {
            projectId: (await import('../db/projects')).listProjects(db)[0].id,
            agentId: (await import('../db/agents')).listAgents(db)[0].id,
            name: 'Discord thread:300000000000000001',
            initialPrompt: 'test',
            source: 'discord',
        });

        threadSessions.set('300000000000000001', {
            sessionId: session.id,
            agentName: 'TestAgent',
            agentModel: 'test-model',
            ownerUserId: 'user-1',
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000002',
                channel_id: '300000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'continue the conversation',
                timestamp: new Date().toISOString(),
            });

            // Should send message to existing session
            expect(pm.sendMessage).toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

describe('DiscordBridge thread subscription dedup', () => {
    test('unsubscribes previous callback before re-subscribing for same thread', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        // Set up a tracked thread session
        const threadSessions = (bridge as unknown as { threadSessions: Map<string, unknown> }).threadSessions;
        const { createSession } = await import('../db/sessions');
        const session = createSession(db, {
            projectId: (await import('../db/projects')).listProjects(db)[0].id,
            agentId: (await import('../db/agents')).listAgents(db)[0].id,
            name: 'Discord thread:400000000000000001',
            initialPrompt: 'test',
            source: 'discord',
        });

        threadSessions.set('400000000000000001', {
            sessionId: session.id,
            agentName: 'TestAgent',
            agentModel: 'test-model',
            ownerUserId: 'user-1',
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            // First message — subscribes
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000010',
                channel_id: '400000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'hello',
                timestamp: new Date().toISOString(),
            });

            expect(pm.subscribe).toHaveBeenCalledTimes(1);
            expect(pm.unsubscribe).not.toHaveBeenCalled();

            // Second message — should unsubscribe old callback then re-subscribe
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000011',
                channel_id: '400000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'hello again',
                timestamp: new Date().toISOString(),
            });

            // unsubscribe called once (for the first callback)
            expect(pm.unsubscribe).toHaveBeenCalledTimes(1);
            // subscribe called twice total (once per message)
            expect(pm.subscribe).toHaveBeenCalledTimes(2);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('threadCallbacks map tracks the latest subscription per thread', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        const threadCallbacks = (bridge as unknown as { threadCallbacks: Map<string, { sessionId: string; callback: unknown }> }).threadCallbacks;
        const threadSessions = (bridge as unknown as { threadSessions: Map<string, unknown> }).threadSessions;

        const { createSession } = await import('../db/sessions');
        const session = createSession(db, {
            projectId: (await import('../db/projects')).listProjects(db)[0].id,
            agentId: (await import('../db/agents')).listAgents(db)[0].id,
            name: 'Discord thread:500000000000000001',
            initialPrompt: 'test',
            source: 'discord',
        });

        threadSessions.set('500000000000000001', {
            sessionId: session.id,
            agentName: 'TestAgent',
            agentModel: 'test-model',
            ownerUserId: 'user-1',
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            // Before any message, no threadCallbacks entry
            expect(threadCallbacks.has('500000000000000001')).toBe(false);

            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000020',
                channel_id: '500000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'first',
                timestamp: new Date().toISOString(),
            });

            // After first message, threadCallbacks should have an entry
            expect(threadCallbacks.has('500000000000000001')).toBe(true);
            const firstCallback = threadCallbacks.get('500000000000000001')!.callback;

            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000021',
                channel_id: '500000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'second',
                timestamp: new Date().toISOString(),
            });

            // After second message, callback should be replaced
            expect(threadCallbacks.has('500000000000000001')).toBe(true);
            const secondCallback = threadCallbacks.get('500000000000000001')!.callback;
            expect(secondCallback).not.toBe(firstCallback);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

describe('DiscordBridge work_intake mode', () => {
    test('work_intake mode creates work task from @mention', async () => {
        const pm = createMockProcessManager();
        const wts = createMockWorkTaskService();

        createAgent(db, { name: 'TestAgent' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        const bridge = new DiscordBridge(db, pm, config, wts as unknown as import('../work/service').WorkTaskService);
        setBotUserId(bridge, '999000000000000001');

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000001',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@999000000000000001> Fix the login bug',
                timestamp: new Date().toISOString(),
                mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
            });

            // WorkTaskService.create should have been called
            expect(wts.create).toHaveBeenCalledTimes(1);
            const createCall = (wts.create as ReturnType<typeof mock>).mock.calls[0] as unknown[];
            const input = createCall[0] as { description: string; source: string; sourceId: string };
            expect(input.description).toBe('Fix the login bug');
            expect(input.source).toBe('discord');
            expect(input.sourceId).toBe('200000000000000001');

            // Should have sent an embed acknowledgment (may also include first-interaction tip)
            expect(fetchBodies.length).toBeGreaterThanOrEqual(1);
            const embedBody = fetchBodies.find((b: unknown) => {
                const embeds = (b as { embeds?: Array<{ title?: string }> }).embeds;
                return embeds?.some(e => e.title === 'Task Queued');
            }) as { embeds: Array<{ title: string }> } | undefined;
            expect(embedBody).toBeDefined();
            expect(embedBody!.embeds[0].title).toBe('Task Queued');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('work_intake mode ignores non-mention messages', async () => {
        const pm = createMockProcessManager();
        const wts = createMockWorkTaskService();

        createAgent(db, { name: 'TestAgent' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        const bridge = new DiscordBridge(db, pm, config, wts as unknown as import('../work/service').WorkTaskService);
        setBotUserId(bridge, '999000000000000001');

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000002',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'Fix the login bug',
                timestamp: new Date().toISOString(),
                mentions: [],
            });

            // Should NOT have created a task — no @mention
            expect(wts.create).not.toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('work_intake mode sends completion embed on task finish', async () => {
        const pm = createMockProcessManager();
        const wts = createMockWorkTaskService();

        createAgent(db, { name: 'TestAgent' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        const bridge = new DiscordBridge(db, pm, config, wts as unknown as import('../work/service').WorkTaskService);
        setBotUserId(bridge, '999000000000000001');

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            // Create task via @mention
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000004',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@999000000000000001> Build the feature',
                timestamp: new Date().toISOString(),
                mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
            });

            // onComplete should have been registered
            expect(wts.onComplete).toHaveBeenCalledTimes(1);

            // Simulate task completion
            fetchBodies.length = 0;
            (wts as unknown as { _triggerComplete: (id: string, task: WorkTask) => void })._triggerComplete('task-123', {
                id: 'task-123',
                agentId: 'agent-1',
                projectId: 'proj-1',
                sessionId: 'sess-1',
                source: 'discord',
                sourceId: 'msg-4',
                requesterInfo: {},
                description: 'Build the feature',
                branchName: 'agent/test/build-feature',
                status: 'completed',
                prUrl: 'https://github.com/test/repo/pull/1',
                summary: 'Built the feature successfully',
                error: null,
                originalBranch: 'main',
                worktreeDir: null,
                iterationCount: 1,
                maxRetries: 0,
                retryCount: 0,
                retryBackoff: 'fixed' as const,
                lastRetryAt: null,
            priority: 2 as const,
            preemptedBy: null,
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            });

            // Wait for async send
            await new Promise(resolve => setTimeout(resolve, 50));

            const completionEmbed = fetchBodies.find((b: unknown) => {
                const body = b as { embeds?: Array<{ title: string }> };
                return body.embeds?.[0]?.title === 'Task Completed';
            }) as { embeds: Array<{ title: string; fields?: Array<{ name: string; value: string }> }> } | undefined;
            expect(completionEmbed).toBeDefined();

            // Should include PR URL in fields
            const prField = completionEmbed!.embeds[0].fields?.find(f => f.name === 'Pull Request');
            expect(prField).toBeDefined();
            expect(prField!.value).toBe('https://github.com/test/repo/pull/1');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('work_intake mode sends error embed on task failure', async () => {
        const pm = createMockProcessManager();
        const wts = createMockWorkTaskService();

        createAgent(db, { name: 'TestAgent' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        const bridge = new DiscordBridge(db, pm, config, wts as unknown as import('../work/service').WorkTaskService);
        setBotUserId(bridge, '999000000000000001');

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000005',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@999000000000000001> Break something',
                timestamp: new Date().toISOString(),
                mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
            });

            fetchBodies.length = 0;
            (wts as unknown as { _triggerComplete: (id: string, task: WorkTask) => void })._triggerComplete('task-123', {
                id: 'task-123',
                agentId: 'agent-1',
                projectId: 'proj-1',
                sessionId: 'sess-1',
                source: 'discord',
                sourceId: 'msg-5',
                requesterInfo: {},
                description: 'Break something',
                branchName: null,
                status: 'failed',
                prUrl: null,
                summary: null,
                error: 'TypeScript compilation failed',
                originalBranch: 'main',
                worktreeDir: null,
                iterationCount: 3,
                maxRetries: 0,
                retryCount: 0,
                retryBackoff: 'fixed' as const,
                lastRetryAt: null,
            priority: 2 as const,
            preemptedBy: null,
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            const failEmbed = fetchBodies.find((b: unknown) => {
                const body = b as { embeds?: Array<{ title: string }> };
                return body.embeds?.[0]?.title === 'Task Failed';
            }) as { embeds: Array<{ title: string; fields?: Array<{ name: string; value: string }> }> } | undefined;
            expect(failEmbed).toBeDefined();

            const errorField = failEmbed!.embeds[0].fields?.find(f => f.name === 'Error');
            expect(errorField).toBeDefined();
            expect(errorField!.value).toContain('TypeScript compilation failed');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('work_intake mode errors without WorkTaskService', async () => {
        const pm = createMockProcessManager();

        createAgent(db, { name: 'TestAgent' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        // No workTaskService passed
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000006',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@999000000000000001> Do something',
                timestamp: new Date().toISOString(),
                mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
            });

            const textBody = fetchBodies.find((b: unknown) => (b as { content?: string }).content) as { content: string } | undefined;
            expect(textBody).toBeDefined();
            expect(textBody!.content).toContain('WorkTaskService');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

describe('DiscordBridge onboarding', () => {
    test('/help responds with embed containing command fields', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            appId: '800000000000000001',
        };
        const bridge = new DiscordBridge(db, pm, config);

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleInteraction: (i: unknown) => Promise<void> }).handleInteraction({
                id: '300000000000000001',
                token: 'test-interaction-token-abcdef123456',
                type: 2, // APPLICATION_COMMAND
                channel_id: '100000000000000001',
                data: { name: 'help' },
                member: { user: { id: 'user-1' }, roles: [] },
            });

            expect(fetchBodies.length).toBe(1);
            const body = fetchBodies[0] as { data: { embeds: Array<{ title: string; fields: Array<{ name: string }> }> } };
            expect(body.data.embeds).toBeDefined();
            expect(body.data.embeds[0].title).toBe('CorvidAgent Commands');
            const fieldNames = body.data.embeds[0].fields.map((f: { name: string }) => f.name);
            expect(fieldNames).toContain('Conversations');
            expect(fieldNames).toContain('Information');
            expect(fieldNames).toContain('Advanced');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('/quickstart responds with welcome embed listing agents', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'AlphaAgent' });
        createAgent(db, { name: 'BetaAgent' });
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            appId: '800000000000000001',
        };
        const bridge = new DiscordBridge(db, pm, config);

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleInteraction: (i: unknown) => Promise<void> }).handleInteraction({
                id: '300000000000000002',
                token: 'test-interaction-token-quickstart789',
                type: 2,
                channel_id: '100000000000000001',
                data: { name: 'quickstart' },
                member: { user: { id: 'user-1' }, roles: [] },
            });

            expect(fetchBodies.length).toBe(1);
            const body = fetchBodies[0] as { data: { embeds: Array<{ title: string; description: string; fields: Array<{ value: string }> }> } };
            expect(body.data.embeds[0].title).toBe('Welcome to CorvidAgent!');
            expect(body.data.embeds[0].description).toContain('/session');
            // Should list agents in the field
            expect(body.data.embeds[0].fields[0].value).toContain('AlphaAgent');
            expect(body.data.embeds[0].fields[0].value).toContain('BetaAgent');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('first-interaction tip is sent once on @mention', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            const msg = {
                id: '200000000000000010',
                channel_id: '100000000000000001',
                author: { id: 'new-user-1', username: 'NewUser' },
                content: '<@999000000000000001> Hello!',
                timestamp: new Date().toISOString(),
                mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
            };

            // First interaction — should send welcome tip
            await (bridge as unknown as { handleMessage: (m: unknown) => Promise<void> }).handleMessage(msg);
            const welcomeEmbed = fetchBodies.find((b: unknown) => {
                const embeds = (b as { embeds?: Array<{ footer?: { text: string } }> }).embeds;
                return embeds?.some(e => e.footer?.text === 'This tip only appears once');
            });
            expect(welcomeEmbed).toBeDefined();

            // Second interaction — no welcome tip
            fetchBodies.length = 0;
            await (bridge as unknown as { handleMessage: (m: unknown) => Promise<void> }).handleMessage({
                ...msg,
                id: '200000000000000011',
            });
            const secondWelcome = fetchBodies.find((b: unknown) => {
                const embeds = (b as { embeds?: Array<{ footer?: { text: string } }> }).embeds;
                return embeds?.some(e => e.footer?.text === 'This tip only appears once');
            });
            expect(secondWelcome).toBeUndefined();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
