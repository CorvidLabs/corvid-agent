import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock worktree creation — git is not available in CI / test environments.
mock.module('../lib/worktree', () => ({
  createWorktree: async () => ({ success: true, worktreeDir: '/tmp/mock-worktree' }),
  resolveAndCreateWorktree: async () => ({ success: true, workDir: '/tmp/mock-worktree' }),
  generateChatBranchName: (agent: string, id: string) => `chat/${agent}/${id.slice(0, 8)}`,
  getWorktreeBaseDir: (dir: string) => `${dir}/.worktrees`,
  removeWorktree: async () => ({ success: true }),
}));

import { Database } from 'bun:sqlite';
import type { WorkTask } from '../../shared/types/work-tasks';
import { createAgent } from '../db/agents';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import type { DiscordBridgeConfig } from '../discord/types';
import { mockDiscordRest } from './helpers/mock-discord-rest';

// Track subscribe callbacks so we can drain embed-response timers in afterEach.
type SubscribeCallback = (sessionId: string, event: { type: string; [key: string]: unknown }) => void;
const pendingSubscribers: Array<{ sessionId: string; callback: SubscribeCallback }> = [];

function createMockProcessManager() {
  return {
    getActiveSessionIds: () => [] as string[],
    startProcess: mock(() => {}),
    sendMessage: mock(() => true),
    subscribe: mock((sessionId: string, callback: SubscribeCallback) => {
      pendingSubscribers.push({ sessionId, callback });
    }),
    unsubscribe: mock(() => {}),
    subscribeAll: mock(() => {}),
    unsubscribeAll: mock(() => {}),
    resumeProcess: mock(() => {}),
    stopProcess: mock(() => {}),
    isRunning: mock(() => true),
    setKeepAliveTtl: mock(() => {}),
  } as unknown as import('../process/manager').ProcessManager;
}

function createMockWorkTaskService() {
  const completionCallbacks = new Map<string, (task: WorkTask) => void>();
  const statusChangeCallbacks = new Map<string, (task: WorkTask) => void>();
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
    onStatusChange: mock((taskId: string, callback: (task: WorkTask) => void) => {
      statusChangeCallbacks.set(taskId, callback);
    }),
    _triggerComplete: (taskId: string, task: WorkTask) => {
      const cb = completionCallbacks.get(taskId);
      if (cb) cb(task);
    },
    _triggerStatusChange: (taskId: string, task: WorkTask) => {
      const cb = statusChangeCallbacks.get(taskId);
      if (cb) cb(task);
    },
  } as unknown as import('../work/service').WorkTaskService & {
    _triggerComplete: (taskId: string, task: WorkTask) => void;
    _triggerStatusChange: (taskId: string, task: WorkTask) => void;
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
  for (const { sessionId, callback } of pendingSubscribers) {
    try {
      callback(sessionId, { type: 'result', result: '' });
    } catch {}
  }
  pendingSubscribers.length = 0;
  db.close();
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

    const { fetchBodies, cleanup } = mockDiscordRest();

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
        return embeds?.some((e) => e.title === 'Task Queued');
      }) as { embeds: Array<{ title: string }> } | undefined;
      expect(embedBody).toBeDefined();
      expect(embedBody!.embeds[0].title).toBe('Task Queued');
    } finally {
      cleanup();
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

    const { cleanup } = mockDiscordRest();

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
      cleanup();
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

    const { fetchBodies, cleanup } = mockDiscordRest();

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
      await new Promise((resolve) => setTimeout(resolve, 50));

      const completionEmbed = fetchBodies.find((b: unknown) => {
        const body = b as { embeds?: Array<{ title: string }> };
        return body.embeds?.[0]?.title === 'Task Completed';
      }) as { embeds: Array<{ title: string; fields?: Array<{ name: string; value: string }> }> } | undefined;
      expect(completionEmbed).toBeDefined();

      // Should include PR URL in fields
      const prField = completionEmbed!.embeds[0].fields?.find((f) => f.name === 'Pull Request');
      expect(prField).toBeDefined();
      expect(prField!.value).toBe('https://github.com/test/repo/pull/1');
    } finally {
      cleanup();
    }
  });

  test('work_intake mode sends status change embeds', async () => {
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

    const { fetchBodies, cleanup } = mockDiscordRest();

    try {
      // Create task via @mention
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000010',
        channel_id: '100000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: '<@999000000000000001> Status change test',
        timestamp: new Date().toISOString(),
        mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
      });

      // onStatusChange should have been registered
      expect(wts.onStatusChange).toHaveBeenCalledTimes(1);

      // Simulate a 'branching' status change
      fetchBodies.length = 0;
      const triggerStatusChange = (wts as unknown as { _triggerStatusChange: (id: string, task: WorkTask) => void })
        ._triggerStatusChange;
      triggerStatusChange('task-123', {
        id: 'task-123',
        agentId: 'agent-1',
        projectId: 'proj-1',
        sessionId: 'sess-1',
        source: 'discord',
        sourceId: null,
        requesterInfo: {},
        description: 'Status change test',
        branchName: null,
        status: 'branching',
        prUrl: null,
        summary: null,
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
        completedAt: null,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const branchingEmbed = fetchBodies.find((b: unknown) => {
        const body = b as { embeds?: Array<{ title: string }> };
        return body.embeds?.[0]?.title === 'Task Update';
      }) as { embeds: Array<{ title: string; description?: string; footer?: { text: string } }> } | undefined;
      expect(branchingEmbed).toBeDefined();
      expect(branchingEmbed!.embeds[0].description).toContain('Setting up workspace');
      expect(branchingEmbed!.embeds[0].footer?.text).toBe('Status: branching');

      // Simulate a 'running' status change with iteration > 1
      fetchBodies.length = 0;
      triggerStatusChange('task-123', {
        id: 'task-123',
        agentId: 'agent-1',
        projectId: 'proj-1',
        sessionId: 'sess-1',
        source: 'discord',
        sourceId: null,
        requesterInfo: {},
        description: 'Status change test',
        branchName: 'agent/test/branch',
        status: 'running',
        prUrl: null,
        summary: null,
        error: null,
        originalBranch: 'main',
        worktreeDir: null,
        iterationCount: 2,
        maxRetries: 0,
        retryCount: 0,
        retryBackoff: 'fixed' as const,
        lastRetryAt: null,
        priority: 2 as const,
        preemptedBy: null,
        queuedAt: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const runningEmbed = fetchBodies.find((b: unknown) => {
        const body = b as { embeds?: Array<{ title: string }> };
        return body.embeds?.[0]?.title === 'Task Update';
      }) as { embeds: Array<{ title: string; description?: string }> } | undefined;
      expect(runningEmbed).toBeDefined();
      expect(runningEmbed!.embeds[0].description).toContain('iteration 2');

      // Simulate a 'validating' status change
      fetchBodies.length = 0;
      triggerStatusChange('task-123', {
        id: 'task-123',
        agentId: 'agent-1',
        projectId: 'proj-1',
        sessionId: 'sess-1',
        source: 'discord',
        sourceId: null,
        requesterInfo: {},
        description: 'Status change test',
        branchName: 'agent/test/branch',
        status: 'validating',
        prUrl: null,
        summary: null,
        error: null,
        originalBranch: 'main',
        worktreeDir: null,
        iterationCount: 2,
        maxRetries: 0,
        retryCount: 0,
        retryBackoff: 'fixed' as const,
        lastRetryAt: null,
        priority: 2 as const,
        preemptedBy: null,
        queuedAt: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const validatingEmbed = fetchBodies.find((b: unknown) => {
        const body = b as { embeds?: Array<{ title: string }> };
        return body.embeds?.[0]?.title === 'Task Update';
      }) as { embeds: Array<{ title: string; description?: string; footer?: { text: string } }> } | undefined;
      expect(validatingEmbed).toBeDefined();
      expect(validatingEmbed!.embeds[0].description).toContain('Validating');
      expect(validatingEmbed!.embeds[0].footer?.text).toBe('Status: validating');

      // Simulate a status with no matching message (e.g. 'completed') — should NOT send embed
      fetchBodies.length = 0;
      triggerStatusChange('task-123', {
        id: 'task-123',
        agentId: 'agent-1',
        projectId: 'proj-1',
        sessionId: 'sess-1',
        source: 'discord',
        sourceId: null,
        requesterInfo: {},
        description: 'Status change test',
        branchName: 'agent/test/branch',
        status: 'completed',
        prUrl: null,
        summary: null,
        error: null,
        originalBranch: 'main',
        worktreeDir: null,
        iterationCount: 2,
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

      await new Promise((resolve) => setTimeout(resolve, 50));

      const noEmbed = fetchBodies.find((b: unknown) => {
        const body = b as { embeds?: Array<{ title: string }> };
        return body.embeds?.[0]?.title === 'Task Update';
      });
      expect(noEmbed).toBeUndefined();
    } finally {
      cleanup();
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

    const { fetchBodies, cleanup } = mockDiscordRest();

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

      await new Promise((resolve) => setTimeout(resolve, 50));

      const failEmbed = fetchBodies.find((b: unknown) => {
        const body = b as { embeds?: Array<{ title: string }> };
        return body.embeds?.[0]?.title === 'Task Failed';
      }) as { embeds: Array<{ title: string; fields?: Array<{ name: string; value: string }> }> } | undefined;
      expect(failEmbed).toBeDefined();

      const errorField = failEmbed!.embeds[0].fields?.find((f) => f.name === 'Error');
      expect(errorField).toBeDefined();
      expect(errorField!.value).toContain('TypeScript compilation failed');
    } finally {
      cleanup();
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

    const { fetchBodies, cleanup } = mockDiscordRest();

    try {
      await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
        id: '200000000000000006',
        channel_id: '100000000000000001',
        author: { id: 'user-1', username: 'TestUser' },
        content: '<@999000000000000001> Do something',
        timestamp: new Date().toISOString(),
        mentions: [{ id: '999000000000000001', username: 'CorvidBot' }],
      });

      const textBody = fetchBodies.find((b: unknown) => (b as { content?: string }).content) as
        | { content: string }
        | undefined;
      expect(textBody).toBeDefined();
      expect(textBody!.content).toContain('WorkTaskService');
    } finally {
      cleanup();
    }
  });
});
