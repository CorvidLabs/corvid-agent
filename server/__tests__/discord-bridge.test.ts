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
            channelId: 'test-channel',
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
            channelId: 'test-channel',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        // Simulate bot message — should not call routeToAgent
        const routeSpy = mock(() => Promise.resolve());
        (bridge as unknown as { routeToAgent: (...args: unknown[]) => Promise<void> }).routeToAgent = routeSpy;

        await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
            id: '1',
            channel_id: 'test-channel',
            author: { id: 'bot-1', username: 'TestBot', bot: true },
            content: 'hello from bot',
            timestamp: new Date().toISOString(),
        });

        expect(routeSpy).not.toHaveBeenCalled();
    });

    test('ignores messages from other channels', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'my-channel',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        const routeSpy = mock(() => Promise.resolve());
        (bridge as unknown as { routeToAgent: (...args: unknown[]) => Promise<void> }).routeToAgent = routeSpy;

        await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
            id: '1',
            channel_id: 'other-channel',
            author: { id: 'user-1', username: 'TestUser' },
            content: 'hello',
            timestamp: new Date().toISOString(),
        });

        expect(routeSpy).not.toHaveBeenCalled();
    });

    test('sendMessage splits long messages', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'test-channel',
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
            await bridge.sendMessage('test-channel', 'Hello');
            expect(fetchCalls.length).toBe(1);

            // Long message (>2000 chars) — split into multiple calls
            fetchCalls.length = 0;
            const longText = 'x'.repeat(3000);
            await bridge.sendMessage('test-channel', longText);
            expect(fetchCalls.length).toBe(2);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('stop clears running state', () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'test-channel',
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
});

describe('DiscordBridge work_intake mode', () => {
    test('work_intake mode creates work task from message', async () => {
        const pm = createMockProcessManager();
        const wts = createMockWorkTaskService();

        // Seed agent so handleWorkIntake can resolve one
        createAgent(db, { name: 'TestAgent' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'test-channel',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        const bridge = new DiscordBridge(db, pm, config, wts as unknown as import('../work/service').WorkTaskService);

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: 'msg-1',
                channel_id: 'test-channel',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'Fix the login bug',
                timestamp: new Date().toISOString(),
            });

            // WorkTaskService.create should have been called
            expect(wts.create).toHaveBeenCalledTimes(1);
            const createCall = (wts.create as ReturnType<typeof mock>).mock.calls[0] as unknown[];
            const input = createCall[0] as { description: string; source: string; sourceId: string };
            expect(input.description).toBe('Fix the login bug');
            expect(input.source).toBe('discord');
            expect(input.sourceId).toBe('msg-1');

            // Should have sent an embed acknowledgment
            expect(fetchBodies.length).toBeGreaterThanOrEqual(1);
            const embedBody = fetchBodies.find((b: unknown) => (b as { embeds?: unknown[] }).embeds) as { embeds: Array<{ title: string }> } | undefined;
            expect(embedBody).toBeDefined();
            expect(embedBody!.embeds[0].title).toBe('Task Queued');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('work_intake mode strips bot mentions from description', async () => {
        const pm = createMockProcessManager();
        const wts = createMockWorkTaskService();

        createAgent(db, { name: 'TestAgent' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'test-channel',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        const bridge = new DiscordBridge(db, pm, config, wts as unknown as import('../work/service').WorkTaskService);

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: 'msg-2',
                channel_id: 'test-channel',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@!12345678> Fix the login bug',
                timestamp: new Date().toISOString(),
            });

            const createCall = (wts.create as ReturnType<typeof mock>).mock.calls[0] as unknown[];
            const input = createCall[0] as { description: string };
            expect(input.description).toBe('Fix the login bug');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('work_intake mode rejects empty description after mention strip', async () => {
        const pm = createMockProcessManager();
        const wts = createMockWorkTaskService();

        createAgent(db, { name: 'TestAgent' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'test-channel',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        const bridge = new DiscordBridge(db, pm, config, wts as unknown as import('../work/service').WorkTaskService);

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: 'msg-3',
                channel_id: 'test-channel',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@!12345678>',
                timestamp: new Date().toISOString(),
            });

            // Should NOT have created a task
            expect(wts.create).not.toHaveBeenCalled();

            // Should have sent a "provide a description" message
            const textBody = fetchBodies.find((b: unknown) => (b as { content?: string }).content) as { content: string } | undefined;
            expect(textBody).toBeDefined();
            expect(textBody!.content).toContain('task description');
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
            channelId: 'test-channel',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        const bridge = new DiscordBridge(db, pm, config, wts as unknown as import('../work/service').WorkTaskService);

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            // Create task
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: 'msg-4',
                channel_id: 'test-channel',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'Build the feature',
                timestamp: new Date().toISOString(),
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
            channelId: 'test-channel',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        const bridge = new DiscordBridge(db, pm, config, wts as unknown as import('../work/service').WorkTaskService);

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: 'msg-5',
                channel_id: 'test-channel',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'Break something',
                timestamp: new Date().toISOString(),
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
            channelId: 'test-channel',
            allowedUserIds: [],
            mode: 'work_intake',
        };
        // No workTaskService passed
        const bridge = new DiscordBridge(db, pm, config);

        const fetchBodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) fetchBodies.push(JSON.parse(String(init.body)));
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: 'msg-6',
                channel_id: 'test-channel',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'Do something',
                timestamp: new Date().toISOString(),
            });

            const textBody = fetchBodies.find((b: unknown) => (b as { content?: string }).content) as { content: string } | undefined;
            expect(textBody).toBeDefined();
            expect(textBody!.content).toContain('WorkTaskService');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('chat mode still works with work_intake configured', async () => {
        const pm = createMockProcessManager();
        const wts = createMockWorkTaskService();

        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'test-channel',
            allowedUserIds: [],
            mode: 'chat',  // explicitly chat mode
        };
        const bridge = new DiscordBridge(db, pm, config, wts as unknown as import('../work/service').WorkTaskService);

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: 'msg-7',
                channel_id: 'test-channel',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'hello there',
                timestamp: new Date().toISOString(),
            });

            // In chat mode, WorkTaskService.create should NOT be called
            expect(wts.create).not.toHaveBeenCalled();
            // Process manager should start a session
            expect(pm.startProcess).toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
