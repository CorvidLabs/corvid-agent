import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleInteraction, type InteractionContext } from '../discord/commands';
import { InteractionType } from '../discord/types';
import type { DiscordBridgeConfig, DiscordInteractionData } from '../discord/types';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';

let db: Database;
let capturedResponse: { type: number; data: Record<string, unknown> } | null = null;
const originalFetch = globalThis.fetch;

function createTestConfig(): DiscordBridgeConfig {
    return {
        botToken: 'test-token',
        channelId: '100000000000000001',
        allowedUserIds: ['200000000000000001'],
        publicMode: true,
        defaultPermissionLevel: 2,
        mode: 'chat',
    };
}

function createTestContext(config?: Partial<DiscordBridgeConfig>): InteractionContext {
    return {
        db,
        config: { ...createTestConfig(), ...config },
        processManager: {
            startProcess: mock(() => {}),
            stopProcess: mock(() => {}),
            subscribe: mock(() => {}),
            unsubscribe: mock(() => {}),
        } as unknown as InteractionContext['processManager'],
        workTaskService: null,
        delivery: { track: mock(() => {}) } as unknown as InteractionContext['delivery'],
        mutedUsers: new Set<string>(),
        threadSessions: new Map(),
        threadCallbacks: new Map(),
        threadLastActivity: new Map(),
        createStandaloneThread: mock(async () => '300000000000000001'),
        subscribeForResponseWithEmbed: mock(() => {}),
        sendTaskResult: mock(async () => {}),
        muteUser: mock(() => {}),
        unmuteUser: mock(() => {}),
    };
}

function makeInteraction(commandName: string, options: Array<{ name: string; value: string | number }> = []): DiscordInteractionData {
    return {
        id: '400000000000000001',
        type: InteractionType.APPLICATION_COMMAND,
        token: 'test-interaction-token',
        channel_id: '100000000000000001',
        member: {
            user: { id: '200000000000000001', username: 'testuser' },
            roles: [],
        },
        data: {
            name: commandName,
            options: options.map(o => ({ ...o, type: typeof o.value === 'number' ? 4 : 3 })),
        },
    } as unknown as DiscordInteractionData;
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    capturedResponse = null;

    // Mock fetch to capture interaction responses
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) {
            try {
                capturedResponse = JSON.parse(String(init.body));
            } catch { /* non-json body */ }
        }
        return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    db.close();
    globalThis.fetch = originalFetch;
});

describe('Discord /tasks command', () => {
    test('shows empty state when no tasks', async () => {
        const ctx = createTestContext();
        await handleInteraction(ctx, makeInteraction('tasks'));

        expect(capturedResponse).not.toBeNull();
        const content = capturedResponse!.data?.content as string;
        expect(content).toContain('No active or pending work tasks');
    });

    test('shows active tasks as embed', async () => {
        const ctx = createTestContext();
        const project = createProject(db, { name: 'test-project', workingDir: '/tmp/test' });
        const agent = createAgent(db, { name: 'TestAgent', systemPrompt: 'test', model: 'test-model' });

        db.query(`
            INSERT INTO work_tasks (id, agent_id, project_id, description, status, source, requester_info, created_at)
            VALUES (?, ?, ?, ?, 'running', 'web', '{}', datetime('now'))
        `).run('task-1', agent.id, project.id, 'Fix the bug in authentication');

        await handleInteraction(ctx, makeInteraction('tasks'));

        expect(capturedResponse).not.toBeNull();
        const embeds = capturedResponse!.data?.embeds as Array<{ title: string; fields: Array<{ name: string; value: string }> }>;
        expect(embeds).toBeDefined();
        expect(embeds[0].title).toBe('Work Tasks');
        const activeField = embeds[0].fields.find((f: { name: string }) => f.name === 'Active');
        expect(activeField).toBeDefined();
    });
});

describe('Discord /schedule command', () => {
    test('shows empty state when no schedules', async () => {
        const ctx = createTestContext();
        await handleInteraction(ctx, makeInteraction('schedule'));

        expect(capturedResponse).not.toBeNull();
        const content = capturedResponse!.data?.content as string;
        expect(content).toContain('No active schedules');
    });

    test('shows active schedules', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'TestAgent', systemPrompt: 'test', model: 'test-model' });

        db.query(`
            INSERT INTO agent_schedules (id, agent_id, name, description, cron_expression, actions, approval_policy, status, execution_count, next_run_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'auto', 'active', 3, ?, datetime('now'), datetime('now'))
        `).run(
            'sched-1', agent.id, 'Nightly Review', 'Reviews code nightly',
            '0 2 * * *', '[]',
            new Date(Date.now() + 3600000).toISOString(),
        );

        await handleInteraction(ctx, makeInteraction('schedule'));

        expect(capturedResponse).not.toBeNull();
        const embeds = capturedResponse!.data?.embeds as Array<{ title: string; description: string }>;
        expect(embeds).toBeDefined();
        expect(embeds[0].title).toBe('Schedules');
        expect(embeds[0].description).toContain('Nightly Review');
    });
});

describe('Discord /config command', () => {
    test('shows config for admin users', async () => {
        const ctx = createTestContext({ defaultPermissionLevel: 3 });
        await handleInteraction(ctx, makeInteraction('config'));

        expect(capturedResponse).not.toBeNull();
        const embeds = capturedResponse!.data?.embeds as Array<{ title: string; fields: Array<{ name: string; value: string }> }>;
        expect(embeds).toBeDefined();
        expect(embeds[0].title).toBe('Bot Configuration');

        const modeField = embeds[0].fields.find((f: { name: string }) => f.name === 'Mode');
        expect(modeField?.value).toBe('chat');
    });

    test('denies non-admin users', async () => {
        const ctx = createTestContext({ defaultPermissionLevel: 2 });
        await handleInteraction(ctx, makeInteraction('config'));

        expect(capturedResponse).not.toBeNull();
        const content = capturedResponse!.data?.content as string;
        expect(content).toContain('Only admins');
    });
});

describe('Discord /session model suffix stripping', () => {
    test('finds agent when name includes model suffix like "(claude-opus-4-6)"', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'TestAgent', systemPrompt: 'test', model: 'claude-opus-4-6' });
        createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

        await handleInteraction(ctx, makeInteraction('session', [
            { name: 'agent', value: 'TestAgent (claude-opus-4-6)' },
            { name: 'topic', value: 'Test topic' },
        ]));

        expect(capturedResponse).not.toBeNull();
        const content = capturedResponse!.data?.content as string;
        // Should succeed and mention the agent, not show "Agent not found"
        expect(content).toContain('TestAgent');
        expect(content).not.toContain('Agent not found');
    });

    test('finds agent when name includes arbitrary model suffix', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'MyAssistant', systemPrompt: 'test', model: 'some-model' });
        createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

        await handleInteraction(ctx, makeInteraction('session', [
            { name: 'agent', value: 'MyAssistant (some-model)' },
            { name: 'topic', value: 'Debug issue' },
        ]));

        expect(capturedResponse).not.toBeNull();
        const content = capturedResponse!.data?.content as string;
        expect(content).toContain('MyAssistant');
        expect(content).not.toContain('Agent not found');
    });

    test('still rejects truly unknown agent names with suffix', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'RealAgent', systemPrompt: 'test', model: 'test-model' });

        await handleInteraction(ctx, makeInteraction('session', [
            { name: 'agent', value: 'FakeAgent (claude-opus-4-6)' },
            { name: 'topic', value: 'Test topic' },
        ]));

        expect(capturedResponse).not.toBeNull();
        const content = capturedResponse!.data?.content as string;
        expect(content).toContain('Agent not found');
        expect(content).toContain('FakeAgent');
    });
});

describe('Discord /work model suffix stripping', () => {
    test('finds agent when name includes model suffix', async () => {
        const ctx = createTestContext();
        const agent = createAgent(db, { name: 'WorkerBot', systemPrompt: 'test', model: 'claude-opus-4-6' });
        createProject(db, { name: 'test-project', workingDir: '/tmp/test' });

        // Provide a workTaskService mock so the /work command proceeds
        ctx.workTaskService = {
            create: mock(async (params: Record<string, unknown>) => ({
                id: 'task-123',
                agentId: agent.id,
                description: params.description,
                status: 'running',
                branchName: null,
            })),
        } as unknown as InteractionContext['workTaskService'];

        await handleInteraction(ctx, makeInteraction('work', [
            { name: 'description', value: 'Fix the tests' },
            { name: 'agent', value: 'WorkerBot (claude-opus-4-6)' },
        ]));

        expect(capturedResponse).not.toBeNull();
        const content = capturedResponse!.data?.content as string;
        // Should succeed — mentions the agent name, not "Agent not found"
        expect(content).toContain('WorkerBot');
        expect(content).not.toContain('Agent not found');
    });

    test('still rejects unknown agent names with suffix in /work', async () => {
        const ctx = createTestContext();
        createAgent(db, { name: 'RealWorker', systemPrompt: 'test', model: 'test-model' });

        ctx.workTaskService = {
            create: mock(async () => ({})),
        } as unknown as InteractionContext['workTaskService'];

        await handleInteraction(ctx, makeInteraction('work', [
            { name: 'description', value: 'Do something' },
            { name: 'agent', value: 'GhostAgent (claude-opus-4-6)' },
        ]));

        expect(capturedResponse).not.toBeNull();
        const content = capturedResponse!.data?.content as string;
        expect(content).toContain('Agent not found');
        expect(content).toContain('GhostAgent');
    });
});
