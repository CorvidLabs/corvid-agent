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

const TEST_OWNER_WALLET = 'TESTOWNERADDRESS1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234';

/** Dynamic owner-address set controlled by `setOwnerAddresses()` in each test. */
let _mockOwnerAddresses = new Set([TEST_OWNER_WALLET.toUpperCase()]);

mock.module('../algochat/config', () => ({
    loadAlgoChatConfig: () => ({
        mnemonic: null,
        network: 'localnet' as const,
        agentNetwork: 'localnet' as const,
        syncInterval: 30000,
        defaultAgentId: null,
        enabled: false,
        pskContact: null,
        ownerAddresses: _mockOwnerAddresses,
    }),
    _resetConfigCache: () => {},
}));

import {
    handleSendMessage,
    handleExtendTimeout,
    handleCheckCredits,
    handleGrantCredits,
    handleCreditConfig,
    handleManageSchedule,
    handleCreateWorkTask,
    handleCheckWorkStatus,
    handleListWorkTasks,
    handleRecallMemory,
    handleListAgents,
    type McpToolContext,
} from '../mcp/tool-handlers';
import { grantCredits } from '../db/credits';
import { saveMemory } from '../db/agent-memories';
const OWNER_WALLET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';

/** Set the agent's wallet address in the DB. */
function setAgentWallet(database: Database, id: string, wallet: string): void {
    database.query(`UPDATE agents SET wallet_address = ? WHERE id = ?`).run(wallet, id);
}

/** Configure the mock owner-address set used by loadAlgoChatConfig. */
function setOwnerAddresses(addresses: string): void {
    _mockOwnerAddresses = new Set(
        addresses ? addresses.split(',').map(a => a.trim().toUpperCase()) : [],
    );
}

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
    db.query('UPDATE agents SET wallet_address = ? WHERE id = ?').run(TEST_OWNER_WALLET, agentId);
});

afterEach(() => {
    db.close();
    _mockOwnerAddresses = new Set([TEST_OWNER_WALLET.toUpperCase()]);
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
    test('rejects non-owner caller', async () => {
        setOwnerAddresses('');
        const ctx = createMockContext();
        const result = await handleGrantCredits(ctx, { wallet_address: 'W1', amount: 50 });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('Unauthorized');
    });

    test('rejects caller with no wallet address', async () => {
        setOwnerAddresses(OWNER_WALLET);
        // Agent has no wallet set
        const ctx = createMockContext();
        const result = await handleGrantCredits(ctx, { wallet_address: 'W1', amount: 50 });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('Unauthorized');
    });

    test('rejects amount <= 0 (owner caller)', async () => {
        setOwnerAddresses(OWNER_WALLET);
        setAgentWallet(db, agentId, OWNER_WALLET);
        const ctx = createMockContext();
        const result = await handleGrantCredits(ctx, { wallet_address: 'W1', amount: 0 });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('between 1');
    });

    test('rejects amount > 1,000,000 (owner caller)', async () => {
        setOwnerAddresses(OWNER_WALLET);
        setAgentWallet(db, agentId, OWNER_WALLET);
        const ctx = createMockContext();
        const result = await handleGrantCredits(ctx, { wallet_address: 'W1', amount: 1_000_001 });
        expect(result.isError).toBe(true);
    });

    test('grants credits successfully (owner caller)', async () => {
        setOwnerAddresses(OWNER_WALLET);
        setAgentWallet(db, agentId, OWNER_WALLET);
        const ctx = createMockContext();
        const result = await handleGrantCredits(ctx, { wallet_address: 'W1', amount: 50, reason: 'test' });
        expect(result.isError).toBeUndefined();
        expect((result.content[0] as { text: string }).text).toContain('50');
    });
});

describe('handleCreditConfig', () => {
    test('returns config when no key/value (no owner check needed)', async () => {
        setOwnerAddresses('');
        const ctx = createMockContext();
        const result = await handleCreditConfig(ctx, {});
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('creditsPerAlgo');
        expect(text).toContain('1000');
    });

    test('rejects non-owner write', async () => {
        setOwnerAddresses('');
        const ctx = createMockContext();
        const result = await handleCreditConfig(ctx, { key: 'credits_per_algo', value: '5000' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('Unauthorized');
    });

    test('updates config with key and value (owner caller)', async () => {
        setOwnerAddresses(OWNER_WALLET);
        setAgentWallet(db, agentId, OWNER_WALLET);
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

    test('update requires schedule_id', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, { action: 'update', name: 'New Name' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('schedule_id');
    });

    test('update requires at least one field to change', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, { action: 'update', schedule_id: 'fake-id' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('No fields to update');
    });

    test('update returns error for nonexistent schedule', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, { action: 'update', schedule_id: 'nonexistent', name: 'X' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('not found');
    });

    test('update modifies name and description', async () => {
        const ctx = createMockContext();
        // Create first
        const createResult = await handleManageSchedule(ctx, {
            action: 'create',
            name: 'Original',
            description: 'Old desc',
            schedule_actions: [{ type: 'star_repo' }],
            cron_expression: '@daily',
        });
        const idMatch = (createResult.content[0] as { text: string }).text.match(/ID:\s*([a-f0-9-]+)/);
        const scheduleId = idMatch![1];

        // Update
        const result = await handleManageSchedule(ctx, {
            action: 'update',
            schedule_id: scheduleId,
            name: 'Renamed',
            description: 'New desc',
        });
        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('updated');
        expect(text).toContain('name');
        expect(text).toContain('description');
    });

    test('update validates frequency when timing changes', async () => {
        const ctx = createMockContext();
        const createResult = await handleManageSchedule(ctx, {
            action: 'create',
            name: 'FreqTest',
            schedule_actions: [{ type: 'star_repo' }],
            cron_expression: '@daily',
        });
        const idMatch = (createResult.content[0] as { text: string }).text.match(/ID:\s*([a-f0-9-]+)/);
        const scheduleId = idMatch![1];

        const result = await handleManageSchedule(ctx, {
            action: 'update',
            schedule_id: scheduleId,
            interval_minutes: 1,
        });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('too short');
    });

    test('update modifies schedule_actions', async () => {
        const ctx = createMockContext();
        const createResult = await handleManageSchedule(ctx, {
            action: 'create',
            name: 'ActionTest',
            schedule_actions: [{ type: 'star_repo', repos: ['old/repo'] }],
            cron_expression: '@daily',
        });
        const idMatch = (createResult.content[0] as { text: string }).text.match(/ID:\s*([a-f0-9-]+)/);
        const scheduleId = idMatch![1];

        const result = await handleManageSchedule(ctx, {
            action: 'update',
            schedule_id: scheduleId,
            schedule_actions: [{ type: 'review_prs', repos: ['new/repo'] }],
        });
        expect(result.isError).toBeUndefined();
        expect((result.content[0] as { text: string }).text).toContain('schedule_actions');
    });

    test('history returns empty when no executions', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, { action: 'history' });
        expect((result.content[0] as { text: string }).text).toContain('No executions');
    });

    test('unknown action returns error', async () => {
        const ctx = createMockContext();
        const result = await handleManageSchedule(ctx, { action: 'delete' as unknown as 'list' });
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

    test('rate limits after max tasks per day', async () => {
        // WORK_TASK_MAX_PER_DAY defaults to 100; fill up to the limit
        const maxPerDay = parseInt(process.env.WORK_TASK_MAX_PER_DAY ?? '100', 10);
        const project = createProject(db, { name: 'RateLimitProject', workingDir: '/tmp' });
        for (let i = 0; i < maxPerDay; i++) {
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

// ─── Check Work Status ───────────────────────────────────────────────────────

describe('handleCheckWorkStatus', () => {
    test('returns error when service not available', async () => {
        const ctx = createMockContext({ workTaskService: undefined });
        const result = await handleCheckWorkStatus(ctx, { task_id: 'wt-123' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('not available');
    });

    test('returns error for nonexistent task', async () => {
        const ctx = createMockContext({
            workTaskService: {
                getTask: mock(() => null),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleCheckWorkStatus(ctx, { task_id: 'wt-nonexistent' });
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('not found');
    });

    test('returns task details for existing task', async () => {
        const mockTask = {
            id: 'wt-abc',
            status: 'running',
            projectId: 'proj-1',
            branchName: 'fix/bug-42',
            iterationCount: 2,
            createdAt: '2026-03-14T10:00:00Z',
            prUrl: null,
            error: null,
            completedAt: null,
        };
        const ctx = createMockContext({
            workTaskService: {
                getTask: mock(() => mockTask),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleCheckWorkStatus(ctx, { task_id: 'wt-abc' });
        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('wt-abc');
        expect(text).toContain('running');
        expect(text).toContain('fix/bug-42');
        expect(text).toContain('Iteration: 2');
    });

    test('includes PR url and error when present', async () => {
        const mockTask = {
            id: 'wt-def',
            status: 'failed',
            projectId: 'proj-1',
            branchName: 'fix/crash',
            iterationCount: 1,
            createdAt: '2026-03-14T10:00:00Z',
            prUrl: 'https://github.com/org/repo/pull/99',
            error: 'Branch creation failed',
            completedAt: '2026-03-14T11:00:00Z',
        };
        const ctx = createMockContext({
            workTaskService: {
                getTask: mock(() => mockTask),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleCheckWorkStatus(ctx, { task_id: 'wt-def' });
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('PR: https://github.com/org/repo/pull/99');
        expect(text).toContain('Error: Branch creation failed');
        expect(text).toContain('Completed:');
    });
});

// ─── List Work Tasks ─────────────────────────────────────────────────────────

describe('handleListWorkTasks', () => {
    test('returns error when service not available', async () => {
        const ctx = createMockContext({ workTaskService: undefined });
        const result = await handleListWorkTasks(ctx, {});
        expect(result.isError).toBe(true);
        expect((result.content[0] as { text: string }).text).toContain('not available');
    });

    test('returns empty message when no tasks exist', async () => {
        const ctx = createMockContext({
            workTaskService: {
                listTasks: mock(() => []),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleListWorkTasks(ctx, {});
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('No work tasks found');
    });

    test('returns empty message with status filter', async () => {
        const ctx = createMockContext({
            workTaskService: {
                listTasks: mock(() => []),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleListWorkTasks(ctx, { status: 'running' });
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('No work tasks with status "running"');
    });

    test('lists tasks with details', async () => {
        const mockTasks = [
            { id: 'wt-1', status: 'completed', description: 'Fix login bug', prUrl: 'https://github.com/org/repo/pull/1', error: null },
            { id: 'wt-2', status: 'running', description: 'Add search feature', prUrl: null, error: null },
        ];
        const ctx = createMockContext({
            workTaskService: {
                listTasks: mock(() => mockTasks),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleListWorkTasks(ctx, {});
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Work tasks (2)');
        expect(text).toContain('wt-1');
        expect(text).toContain('completed');
        expect(text).toContain('Fix login bug');
        expect(text).toContain('PR: https://github.com/org/repo/pull/1');
        expect(text).toContain('wt-2');
        expect(text).toContain('Add search feature');
    });

    test('filters by status', async () => {
        const mockTasks = [
            { id: 'wt-1', status: 'completed', description: 'Done task', prUrl: null, error: null },
            { id: 'wt-2', status: 'running', description: 'Active task', prUrl: null, error: null },
        ];
        const ctx = createMockContext({
            workTaskService: {
                listTasks: mock(() => mockTasks),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleListWorkTasks(ctx, { status: 'running' });
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Work tasks (1)');
        expect(text).toContain('wt-2');
        expect(text).not.toContain('wt-1');
    });

    test('respects limit parameter', async () => {
        const mockTasks = Array.from({ length: 10 }, (_, i) => ({
            id: `wt-${i}`, status: 'pending', description: `Task ${i}`, prUrl: null, error: null,
        }));
        const ctx = createMockContext({
            workTaskService: {
                listTasks: mock(() => mockTasks),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleListWorkTasks(ctx, { limit: 3 });
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Work tasks (3)');
        expect(text).toContain('wt-0');
        expect(text).toContain('wt-2');
        expect(text).not.toContain('wt-3');
    });

    test('caps limit at 50', async () => {
        const mockTasks = Array.from({ length: 60 }, (_, i) => ({
            id: `wt-${i}`, status: 'pending', description: `Task ${i}`, prUrl: null, error: null,
        }));
        const ctx = createMockContext({
            workTaskService: {
                listTasks: mock(() => mockTasks),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleListWorkTasks(ctx, { limit: 100 });
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Work tasks (50)');
    });

    test('includes error snippet in task listing', async () => {
        const mockTasks = [
            { id: 'wt-fail', status: 'failed', description: 'Broken task', prUrl: null, error: 'Something went very wrong with the branch checkout' },
        ];
        const ctx = createMockContext({
            workTaskService: {
                listTasks: mock(() => mockTasks),
            } as unknown as McpToolContext['workTaskService'],
        });
        const result = await handleListWorkTasks(ctx, {});
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Error: Something went very wrong');
    });
});

// ─── model_tier validation (handleCreateWorkTask) ────────────────────────────

describe('handleCreateWorkTask model_tier validation', () => {
    function createWorkCtx(): McpToolContext {
        return createMockContext({
            workTaskService: {
                create: mock(() => Promise.resolve({
                    id: 'wt-new',
                    status: 'pending',
                    projectId: 'proj-1',
                    branchName: null,
                })),
            } as unknown as McpToolContext['workTaskService'],
        });
    }

    test('rejects invalid model_tier value', async () => {
        const ctx = createWorkCtx();
        const result = await handleCreateWorkTask(ctx, {
            description: 'fix bug',
            model_tier: 'turbo',
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Invalid model_tier');
        expect(text).toContain('turbo');
    });

    test('accepts "heavy" as valid model_tier', async () => {
        const ctx = createWorkCtx();
        const result = await handleCreateWorkTask(ctx, {
            description: 'refactor auth',
            model_tier: 'heavy',
        });
        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Model tier: heavy');
    });

    test('accepts "standard" as valid model_tier', async () => {
        const ctx = createWorkCtx();
        const result = await handleCreateWorkTask(ctx, {
            description: 'update docs',
            model_tier: 'standard',
        });
        expect(result.isError).toBeUndefined();
    });

    test('accepts "light" as valid model_tier', async () => {
        const ctx = createWorkCtx();
        const result = await handleCreateWorkTask(ctx, {
            description: 'lint fix',
            model_tier: 'light',
        });
        expect(result.isError).toBeUndefined();
    });

    test('accepts raw tier names (opus, sonnet, haiku)', async () => {
        const ctx = createWorkCtx();
        for (const tier of ['opus', 'sonnet', 'haiku']) {
            const result = await handleCreateWorkTask(ctx, {
                description: `test ${tier}`,
                model_tier: tier,
            });
            expect(result.isError).toBeUndefined();
        }
    });

    test('omitting model_tier defaults to auto', async () => {
        const ctx = createWorkCtx();
        const result = await handleCreateWorkTask(ctx, {
            description: 'auto tier task',
        });
        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Model tier: auto');
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
