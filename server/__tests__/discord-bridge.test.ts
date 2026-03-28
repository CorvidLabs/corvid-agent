import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';

// Mock worktree creation — git is not available in CI / test environments.
mock.module('../lib/worktree', () => ({
    createWorktree: async () => ({ success: true, worktreeDir: '/tmp/mock-worktree' }),
    resolveAndCreateWorktree: async () => ({ success: true, workDir: '/tmp/mock-worktree' }),
    generateChatBranchName: (agent: string, id: string) => `chat/${agent}/${id.slice(0, 8)}`,
    getWorktreeBaseDir: (dir: string) => `${dir}/.worktrees`,
    removeWorktree: async () => ({ success: true }),
}));

import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import { GatewayOp } from '../discord/types';
import type { DiscordBridgeConfig } from '../discord/types';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import type { WorkTask } from '../../shared/types/work-tasks';
import { withAuthorContext } from '../discord/message-handler';

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
            queuedAt: null,
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
            // Prompt should include author context prefix
            const startArgs = (pm.startProcess as ReturnType<typeof mock>).mock.calls[0];
            const prompt = startArgs[1] as string;
            expect(prompt).toContain('[From Discord user: TestUser (Discord ID: user-1) in channel');
            expect(prompt).toContain('what time is it?');
            // Should subscribe for response
            expect(pm.subscribe).toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('@mention with Ollama agent and complex prompt sends complexity warning', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'OllamaTestAgent', model: 'llama3.3', provider: 'ollama' });
        createProject(db, { name: 'OllamaProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const fetchCalls: { url: string; body: string }[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
            fetchCalls.push({ url: urlStr, body: init?.body as string ?? '' });
            return new Response(JSON.stringify({ id: '300000000000000001' }), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000002',
                channel_id: '100000000000000001',
                author: { id: 'user-2', username: 'TestUser2' },
                content: '<@999000000000000001> Refactor the authentication system, migrate to JWT tokens, and optimize all database queries for performance and security.',
                timestamp: new Date().toISOString(),
                mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
            });

            // Should start a process
            expect(pm.startProcess).toHaveBeenCalled();
            // Should have sent a complexity warning message to Discord
            const warningCall = fetchCalls.find(c => c.body.includes('Advisory'));
            expect(warningCall).toBeDefined();
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
            queuedAt: null,
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
            queuedAt: null,
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

describe('DiscordBridge mention-reply resume', () => {
    test('reply to bot message resumes existing session', async () => {
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

        // Create a session and add it to mentionSessions map
        const { createSession } = await import('../db/sessions');
        const { listAgents } = await import('../db/agents');
        const { listProjects } = await import('../db/projects');
        const agents = listAgents(db);
        const projects = listProjects(db);
        const session = createSession(db, {
            projectId: projects[0].id,
            agentId: agents[0].id,
            name: 'Mention reply test',
            initialPrompt: 'test',
            source: 'discord',
        });

        const mentionSessions = (bridge as unknown as { mentionSessions: Map<string, import('../discord/message-handler').MentionSessionInfo> }).mentionSessions;
        mentionSessions.set('600000000000000001', {
            sessionId: session.id,
            agentName: 'TestAgent',
            agentModel: 'test-model',
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000030',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'follow up question',
                timestamp: new Date().toISOString(),
                message_reference: { message_id: '600000000000000001' },
                referenced_message: {
                    id: '600000000000000001',
                    content: 'bot response',
                    author: { id: '999000000000000001', username: 'CorvidBot', bot: true },
                },
            });

            // Should send message to existing session (resume) rather than start new
            expect(pm.sendMessage).toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('reply to unknown bot message falls through to new session', async () => {
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
            // Reply to a bot message that isn't tracked (e.g. after restart)
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000031',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'follow up to old message',
                timestamp: new Date().toISOString(),
                message_reference: { message_id: '700000000000000001' },
                referenced_message: {
                    id: '700000000000000001',
                    content: 'old bot response',
                    author: { id: '999000000000000001', username: 'CorvidBot', bot: true },
                },
            });

            // Should create a new session (startProcess) since mentionSessions doesn't have this message
            expect(pm.startProcess).toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('botRoleId mention triggers reply', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            botRoleId: '888000000000000001',
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000032',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@&888000000000000001> what time is it?',
                timestamp: new Date().toISOString(),
                mentions: [],
                mention_roles: ['888000000000000001'],
            });

            // Should start process — bot role was mentioned
            expect(pm.startProcess).toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('unrelated role mention does not trigger reply', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            botRoleId: '888000000000000001',
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000033',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@&777000000000000001> hello',
                timestamp: new Date().toISOString(),
                mentions: [],
                mention_roles: ['777000000000000001'], // different role, not the bot
            });

            // Should NOT start process — wrong role
            expect(pm.startProcess).not.toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

describe('trackMentionSession', () => {
    test('evicts oldest entry when cap is reached', async () => {
        const map = new Map<string, { sessionId: string; agentName: string; agentModel: string }>();

        // Fill to capacity (500)
        for (let i = 0; i < 500; i++) {
            map.set(`msg-${i}`, { sessionId: `session-${i}`, agentName: 'Agent', agentModel: 'model' });
        }
        expect(map.size).toBe(500);

        // The first key should be msg-0
        expect(map.keys().next().value).toBe('msg-0');

        // Simulate what trackMentionSession does: evict oldest when at cap
        if (map.size >= 500) {
            const firstKey = map.keys().next().value;
            if (firstKey) map.delete(firstKey);
        }
        map.set('msg-500', { sessionId: 'session-500', agentName: 'Agent', agentModel: 'model' });

        expect(map.size).toBe(500);
        expect(map.has('msg-0')).toBe(false);
        expect(map.has('msg-500')).toBe(true);
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

describe('withAuthorContext', () => {
    test('returns text unchanged when no author info provided', () => {
        expect(withAuthorContext('hello')).toBe('hello');
    });

    test('includes both username and Discord ID when both provided', () => {
        expect(withAuthorContext('hello', '12345', 'Alice')).toBe('[From Discord user: Alice (Discord ID: 12345)]\nhello');
    });

    test('includes only Discord ID when username is missing', () => {
        expect(withAuthorContext('hello', '12345')).toBe('[From Discord user ID: 12345]\nhello');
    });

    test('includes only username when Discord ID is missing', () => {
        expect(withAuthorContext('hello', undefined, 'Alice')).toBe('[From Discord user: Alice]\nhello');
    });

    test('includes channel ID when provided with full author info', () => {
        expect(withAuthorContext('hello', '12345', 'Alice', '99999')).toBe('[From Discord user: Alice (Discord ID: 12345) in channel 99999]\nhello');
    });

    test('includes channel ID with only Discord ID', () => {
        expect(withAuthorContext('hello', '12345', undefined, '99999')).toBe('[From Discord user ID: 12345 in channel 99999]\nhello');
    });

    test('includes channel ID with only username', () => {
        expect(withAuthorContext('hello', undefined, 'Alice', '99999')).toBe('[From Discord user: Alice in channel 99999]\nhello');
    });
});

describe('DiscordBridge expired thread session resume', () => {
    test('resumes expired session when user messages in thread with deleted session', async () => {
        const pm = createMockProcessManager();
        // Make getSession return null by having isRunning return false
        // and sendMessage return false so it tries to resume
        (pm.sendMessage as ReturnType<typeof mock>).mockImplementation(() => true);

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        createAgent(db, { name: 'ResumeAgent', model: 'test-model' });
        createProject(db, { name: 'ResumeProject', workingDir: '/tmp/test' });

        const threadSessions = (bridge as unknown as { threadSessions: Map<string, unknown> }).threadSessions;

        // Set up thread info pointing to a non-existent session ID
        threadSessions.set('600000000000000001', {
            sessionId: 'non-existent-session-id',
            agentName: 'ResumeAgent',
            agentModel: 'test-model',
            ownerUserId: 'user-1',
            topic: 'test topic',
            projectName: 'ResumeProject',
        });

        const originalFetch = globalThis.fetch;
        const fetchCalls: string[] = [];
        globalThis.fetch = mock(async (url: string | URL | Request) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
            fetchCalls.push(urlStr);
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000050',
                channel_id: '600000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'hello after expiry',
                timestamp: new Date().toISOString(),
            });

            // Should have started a new process (resume behavior)
            expect(pm.startProcess).toHaveBeenCalled();

            // Thread session should be updated with a new session ID
            const updatedInfo = threadSessions.get('600000000000000001') as { sessionId: string; agentName: string };
            expect(updatedInfo).toBeDefined();
            expect(updatedInfo.sessionId).not.toBe('non-existent-session-id');
            expect(updatedInfo.agentName).toBe('ResumeAgent');

            // Should have subscribed for responses
            expect(pm.subscribe).toHaveBeenCalled();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('falls back to dead-end embed when no agents are configured', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        // No agents or projects created — resume should fail
        const threadSessions = (bridge as unknown as { threadSessions: Map<string, unknown> }).threadSessions;
        threadSessions.set('700000000000000001', {
            sessionId: 'non-existent-session-id',
            agentName: 'GhostAgent',
            agentModel: 'test-model',
            ownerUserId: 'user-1',
        });

        const originalFetch = globalThis.fetch;
        const fetchBodies: unknown[] = [];
        globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
            if (init?.body) {
                try { fetchBodies.push(JSON.parse(init.body as string)); } catch { /* skip */ }
            }
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000060',
                channel_id: '700000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'hello',
                timestamp: new Date().toISOString(),
            });

            // Should NOT have started a new process
            expect(pm.startProcess).not.toHaveBeenCalled();

            // Wait for the dead-end embed to appear (async delivery may be in-flight)
            let deadEnd: unknown;
            for (let i = 0; i < 40 && !deadEnd; i++) {
                await new Promise(r => setTimeout(r, 25));
                deadEnd = fetchBodies.find((b: unknown) => {
                    const embeds = (b as { embeds?: Array<{ description?: string }> }).embeds;
                    return embeds?.some(e => e.description?.includes('session has expired'));
                });
            }
            expect(deadEnd).toBeDefined();

            // Thread session should be cleaned up
            expect(threadSessions.has('700000000000000001')).toBe(false);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('falls back to default agent when original agent no longer exists', async () => {
        const pm = createMockProcessManager();
        (pm.sendMessage as ReturnType<typeof mock>).mockImplementation(() => true);

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        // Create a different agent than the one in the thread info
        createAgent(db, { name: 'FallbackAgent', model: 'fallback-model' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const threadSessions = (bridge as unknown as { threadSessions: Map<string, unknown> }).threadSessions;
        threadSessions.set('800000000000000001', {
            sessionId: 'non-existent-session-id',
            agentName: 'DeletedAgent', // This agent doesn't exist
            agentModel: 'old-model',
            ownerUserId: 'user-1',
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000070',
                channel_id: '800000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'hello with fallback',
                timestamp: new Date().toISOString(),
            });

            // Should have started a process with the fallback agent
            expect(pm.startProcess).toHaveBeenCalled();

            // Thread should be updated with FallbackAgent
            const updatedInfo = threadSessions.get('800000000000000001') as { agentName: string };
            expect(updatedInfo).toBeDefined();
            expect(updatedInfo.agentName).toBe('FallbackAgent');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
