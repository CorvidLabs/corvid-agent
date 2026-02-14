/**
 * Tests for MCP tool handler logic: dedup, depth guards, input validation, rate limits.
 *
 * These tests focus on the pure logic and guard conditions in tool-handlers.ts.
 * External dependencies (AgentMessenger, GitHub, etc.) are mocked.
 */

import { test, expect, beforeEach, afterEach, describe, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import {
    handleSendMessage,
    handleExtendTimeout,
    handleCheckCredits,
    handleGrantCredits,
    handleCreditConfig,
    handleManageSchedule,
    handleCreateWorkTask,
    handleRecallMemory,
    handleListAgents,
    type McpToolContext,
} from '../mcp/tool-handlers';
import { grantCredits } from '../db/credits';
import { saveMemory } from '../db/agent-memories';

let db: Database;
let agentId: string;

// ─── Mock helpers ────────────────────────────────────────────────────────────

function createMockContext(overrides?: Partial<McpToolContext>): McpToolContext {
    return {
        agentId,
        db,
        agentMessenger: {
            invokeAndWait: mock(() => Promise.resolve({ response: 'mock response', threadId: 'thread-1' })),
            sendOnChainToSelf: mock(() => Promise.resolve('mock-txid')),
            sendNotificationToAddress: mock(() => Promise.resolve()),
        } as unknown as McpToolContext['agentMessenger'],
        agentDirectory: {
            listAvailable: mock(() => Promise.resolve([
                { agentId, agentName: 'Self', walletAddress: null },
                { agentId: 'other-agent', agentName: 'OtherBot', walletAddress: 'OTHERADDR' },
            ])),
        } as unknown as McpToolContext['agentDirectory'],
        agentWalletService: {} as McpToolContext['agentWalletService'],
        ...overrides,
    };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    const agent = createAgent(db, { name: 'TestAgent', model: 'sonnet' });
    agentId = agent.id;
});

afterEach(() => {
    db.close();
});

// ─── Send Message Guards ─────────────────────────────────────────────────────

describe('handleSendMessage', () => {
    test('rejects when depth exceeds MAX_INVOKE_DEPTH (3)', async () => {
        const ctx = createMockContext({ depth: 4 });
        const result = await handleSendMessage(ctx, {
            to_agent: 'OtherBot',
            message: 'hello',
        });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('invocation depth');
    });

    test('allows at exactly MAX_INVOKE_DEPTH (3)', async () => {
        const ctx = createMockContext({ depth: 3 });
        const result = await handleSendMessage(ctx, {
            to_agent: 'OtherBot',
            message: 'hello from depth 3',
        });
        // Should succeed (depth 3 is allowed, > 3 is rejected)
        expect(result.isError).toBeUndefined();
    });

    test('rejects sending to self', async () => {
        const ctx = createMockContext();
        const result = await handleSendMessage(ctx, {
            to_agent: agentId,
            message: 'talking to myself',
        });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('yourself');
    });

    test('rejects unknown agent', async () => {
        const ctx = createMockContext();
        const result = await handleSendMessage(ctx, {
            to_agent: 'NonExistentBot',
            message: 'hello?',
        });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('not found');
    });

    test('resolves agent by name case-insensitively', async () => {
        const ctx = createMockContext();
        const result = await handleSendMessage(ctx, {
            to_agent: 'otherbot', // lowercase, should match 'OtherBot'
            message: 'unique-msg-case-test-' + Date.now(),
        });
        expect(result.isError).toBeUndefined();
        expect((result.content[0] as { text: string }).text).toContain('mock response');
    });

    test('suppresses duplicate sends within dedup window', async () => {
        const ctx = createMockContext();
        const msg = 'unique-dedup-test-' + Date.now();

        const first = await handleSendMessage(ctx, { to_agent: 'OtherBot', message: msg });
        expect(first.isError).toBeUndefined();

        // Second send with same content should be suppressed
        const second = await handleSendMessage(ctx, { to_agent: 'OtherBot', message: msg });
        expect((second.content[0] as { text: string }).text).toContain('duplicate suppressed');
    });

    test('allows same message to different agents', async () => {
        const ctx = createMockContext({
            agentDirectory: {
                listAvailable: mock(() => Promise.resolve([
                    { agentId, agentName: 'Self', walletAddress: null },
                    { agentId: 'bot-a', agentName: 'BotA', walletAddress: null },
                    { agentId: 'bot-b', agentName: 'BotB', walletAddress: null },
                ])),
            } as unknown as McpToolContext['agentDirectory'],
        });

        const msg = 'unique-multi-agent-' + Date.now();
        const r1 = await handleSendMessage(ctx, { to_agent: 'BotA', message: msg });
        const r2 = await handleSendMessage(ctx, { to_agent: 'BotB', message: msg });
        expect(r1.isError).toBeUndefined();
        expect(r2.isError).toBeUndefined();
    });

    test('default depth is 1 when not specified', async () => {
        const ctx = createMockContext(); // no depth set
        const result = await handleSendMessage(ctx, {
            to_agent: 'OtherBot',
            message: 'default-depth-' + Date.now(),
        });
        // Should succeed — default depth 1 < MAX 3
        expect(result.isError).toBeUndefined();
    });
});

// ─── Extend Timeout ──────────────────────────────────────────────────────────

describe('handleExtendTimeout', () => {
    test('returns error when extendTimeout not available', async () => {
        const ctx = createMockContext({ extendTimeout: undefined });
        const result = await handleExtendTimeout(ctx, { minutes: 30 });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('not available');
    });

    test('clamps to minimum of 1 minute', async () => {
        let receivedMs = 0;
        const ctx = createMockContext({
            extendTimeout: (ms: number) => { receivedMs = ms; return true; },
        });
        await handleExtendTimeout(ctx, { minutes: -10 });
        expect(receivedMs).toBe(60_000); // 1 minute
    });

    test('clamps to maximum of 120 minutes', async () => {
        let receivedMs = 0;
        const ctx = createMockContext({
            extendTimeout: (ms: number) => { receivedMs = ms; return true; },
        });
        await handleExtendTimeout(ctx, { minutes: 999 });
        expect(receivedMs).toBe(120 * 60_000);
    });

    test('returns success on valid extension', async () => {
        const ctx = createMockContext({
            extendTimeout: () => true,
        });
        const result = await handleExtendTimeout(ctx, { minutes: 30 });
        expect(result.isError).toBeUndefined();
        expect((result.content[0] as { text: string }).text).toContain('30 minutes');
    });

    test('returns error when extendTimeout returns false', async () => {
        const ctx = createMockContext({
            extendTimeout: () => false,
        });
        const result = await handleExtendTimeout(ctx, { minutes: 30 });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('Failed');
    });
});

// ─── Credits ─────────────────────────────────────────────────────────────────

describe('handleCheckCredits', () => {
    test('returns error when no wallet address', async () => {
        const ctx = createMockContext();
        const result = await handleCheckCredits(ctx, {});
        expect(result.isError).toBe(true);
    });

    test('returns balance info for valid wallet', async () => {
        const wallet = 'TESTWALLETCHECK123';
        grantCredits(db, wallet, 100);
        const ctx = createMockContext();
        const result = await handleCheckCredits(ctx, { wallet_address: wallet });
        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('100');
        expect(text).toContain('Available');
    });
});

describe('handleGrantCredits', () => {
    test('rejects amount <= 0', async () => {
        const ctx = createMockContext();
        const result = await handleGrantCredits(ctx, { wallet_address: 'W1', amount: 0 });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('between 1');
    });

    test('rejects amount > 1,000,000', async () => {
        const ctx = createMockContext();
        const result = await handleGrantCredits(ctx, { wallet_address: 'W1', amount: 1_000_001 });
        expect(result.isError).toBe(true);
    });

    test('grants credits successfully', async () => {
        const ctx = createMockContext();
        const result = await handleGrantCredits(ctx, { wallet_address: 'W1', amount: 50, reason: 'test' });
        expect(result.isError).toBeUndefined();
        expect((result.content[0] as { text: string }).text).toContain('50');
    });
});

describe('handleCreditConfig', () => {
    test('returns config when no key/value', async () => {
        const ctx = createMockContext();
        const result = await handleCreditConfig(ctx, {});
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('creditsPerAlgo');
        expect(text).toContain('1000');
    });

    test('updates config with key and value', async () => {
        const ctx = createMockContext();
        const result = await handleCreditConfig(ctx, { key: 'credits_per_algo', value: '5000' });
        expect((result.content[0] as { text: string }).text).toContain('updated');
    });
});

// ─── Manage Schedule ─────────────────────────────────────────────────────────

describe('handleManageSchedule', () => {
    test('list returns empty for new agent', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, { action: 'list' });
        expect((result.content[0] as { text: string }).text).toContain('No schedules');
    });

    test('create requires name and actions', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, {
            action: 'create',
            cron_expression: '@daily',
        });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('name');
    });

    test('create requires cron or interval', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, {
            action: 'create',
            name: 'Test',
            schedule_actions: [{ type: 'star_repo', repos: ['test/repo'] }],
        });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('cron_expression or interval_minutes');
    });

    test('create validates frequency (rejects too-frequent cron)', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, {
            action: 'create',
            name: 'TooFrequent',
            schedule_actions: [{ type: 'star_repo' }],
            cron_expression: '* * * * *', // every minute
        });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('fires every');
    });

    test('create validates frequency (rejects short interval)', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, {
            action: 'create',
            name: 'TooFrequent',
            schedule_actions: [{ type: 'star_repo' }],
            interval_minutes: 1, // 1 minute = 60000ms < 300000ms
        });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('too short');
    });

    test('create succeeds with valid params', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, {
            action: 'create',
            name: 'Daily Stars',
            schedule_actions: [{ type: 'star_repo', repos: ['test/repo'] }],
            cron_expression: '@daily',
        });
        expect(result.isError).toBeUndefined();
        expect((result.content[0] as { text: string }).text).toContain('Schedule created');
    });

    test('pause requires schedule_id', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, { action: 'pause' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('schedule_id');
    });

    test('resume requires schedule_id', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, { action: 'resume' });
        expect(result.isError).toBe(true);
    });

    test('pause and resume flow', async () => {
        const ctx = createMockContext();
        // Create first
        const createResult = await handleManageSchedule(ctx, {
            action: 'create',
            name: 'PauseResume',
            schedule_actions: [{ type: 'star_repo' }],
            cron_expression: '@daily',
        });
        const text = (createResult.content[0] as { text: string }).text;
        const idMatch = text.match(/ID:\s*([a-f0-9-]+)/);
        expect(idMatch).not.toBeNull();
        const scheduleId = idMatch![1];

        // Pause
        const pauseResult = await handleManageSchedule(ctx, { action: 'pause', schedule_id: scheduleId });
        expect((pauseResult.content[0] as { text: string }).text).toContain('paused');

        // Resume
        const resumeResult = await handleManageSchedule(ctx, { action: 'resume', schedule_id: scheduleId });
        expect((resumeResult.content[0] as { text: string }).text).toContain('resumed');
    });

    test('history returns empty when no executions', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, { action: 'history' });
        expect((result.content[0] as { text: string }).text).toContain('No executions');
    });

    test('unknown action returns error', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, { action: 'delete' as any });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('Unknown action');
    });
});

// ─── Create Work Task ────────────────────────────────────────────────────────

describe('handleCreateWorkTask', () => {
    test('returns error when service not available', async () => {
        const ctx = createMockContext({ workTaskService: undefined });
        const result = await handleCreateWorkTask(ctx, { description: 'fix bug' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('not available');
    });

    test('rate limits after 5 tasks per day', async () => {
        // work_tasks table created by migrations; needs project_id FK
        const project = createProject(db, { name: 'RateLimitProject', workingDir: '/tmp' });
        for (let i = 0; i < 5; i++) {
            db.query(
                `INSERT INTO work_tasks (id, agent_id, project_id, description) VALUES (?, ?, ?, ?)`
            ).run(crypto.randomUUID(), agentId, project.id, `task-${i}`);
        }

        const ctx = createMockContext({
            workTaskService: {
                create: mock(() => Promise.resolve({ id: 'wt-new', status: 'pending' })),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleCreateWorkTask(ctx, { description: 'one more' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('Rate limit');
    });
});

// ─── Recall Memory ───────────────────────────────────────────────────────────

describe('handleRecallMemory', () => {
    test('recall by key returns content', async () => {
        saveMemory(db, { agentId, key: 'test-key', content: 'test-value' });
        const ctx = createMockContext();
        const result = await handleRecallMemory(ctx, { key: 'test-key' });
        expect((result.content[0] as { text: string }).text).toContain('test-value');
    });

    test('recall nonexistent key returns not found', async () => {
        const ctx = createMockContext();
        const result = await handleRecallMemory(ctx, { key: 'nonexistent' });
        expect((result.content[0] as { text: string }).text).toContain('No memory found');
    });

    test('search by query returns matches', async () => {
        saveMemory(db, { agentId, key: 'project-notes', content: 'Use TypeScript strictly' });
        const ctx = createMockContext();
        const result = await handleRecallMemory(ctx, { query: 'TypeScript' });
        expect((result.content[0] as { text: string }).text).toContain('TypeScript');
    });

    test('no args lists recent memories', async () => {
        saveMemory(db, { agentId, key: 'mem-a', content: 'data-a' });
        const ctx = createMockContext();
        const result = await handleRecallMemory(ctx, {});
        expect((result.content[0] as { text: string }).text).toContain('mem-a');
    });

    test('no args with empty memories', async () => {
        const ctx = createMockContext();
        const result = await handleRecallMemory(ctx, {});
        expect((result.content[0] as { text: string }).text).toContain('No memories');
    });
});

// ─── List Agents ─────────────────────────────────────────────────────────────

describe('handleListAgents', () => {
    test('excludes self from list', async () => {
        const ctx = createMockContext();
        const result = await handleListAgents(ctx);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('OtherBot');
        expect(text).not.toContain('Self');
    });

    test('returns empty message when only self exists', async () => {
        const ctx = createMockContext({
            agentDirectory: {
                listAvailable: mock(() => Promise.resolve([
                    { agentId, agentName: 'Self', walletAddress: null },
                ])),
            } as unknown as McpToolContext['agentDirectory'],
        });
        const result = await handleListAgents(ctx);
        expect((result.content[0] as { text: string }).text).toContain('No other agents');
    });

    test('shows wallet address when available', async () => {
        const ctx = createMockContext();
        const result = await handleListAgents(ctx);
        expect((result.content[0] as { text: string }).text).toContain('OTHERADDR');
    });
});
