/**
 * Tests for ack-comment dedup logic in MentionPollingService.processMention.
 *
 * Separated from polling-service.test.ts to isolate mock.module usage for
 * ../github/operations (Bun mock.module is process-wide and leaks).
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// ── Module mocks (must come before importing the module under test) ─────────

const mockAddIssueComment = mock(() => Promise.resolve());
mock.module('../github/operations', () => ({
  addIssueComment: mockAddIssueComment,
}));

// Stub prompt-injection scanner — always allow
mock.module('../lib/prompt-injection', () => ({
  scanGitHubContent: () => ({ blocked: false, confidence: 'NONE', matches: [] }),
}));

import { createAgent } from '../db/agents';
import { createMentionPollingConfig } from '../db/mention-polling';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import type { DetectedMention } from '../polling/github-searcher';
import { MentionPollingService } from '../polling/service';

// ─── Test Setup ─────────────────────────────────────────────────────────────

let db: Database;
let agentId: string;
let projectId: string;

const mockProcessManager = {
  startProcess: mock(() => {}),
  stopProcess: mock(() => {}),
  getProcess: mock(() => null),
  listProcesses: mock(() => []),
  subscribe: mock(() => {}),
  approvalManager: { operationalMode: 'autonomous' },
} as unknown as import('../process/manager').ProcessManager;

function makeMention(overrides?: Partial<DetectedMention>): DetectedMention {
  return {
    id: 'comment-100',
    type: 'issue_comment',
    body: '@corvid-bot please fix this',
    sender: 'external-user',
    number: 42,
    title: 'Bug report',
    htmlUrl: 'https://github.com/CorvidLabs/corvid-agent/issues/42#issuecomment-100',
    createdAt: new Date().toISOString(),
    isPullRequest: false,
    ...overrides,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  const agent = createAgent(db, { name: 'AckTestAgent', model: 'sonnet' });
  agentId = agent.id;
  const project = createProject(db, { name: 'AckProject', workingDir: '/tmp/ack-test' });
  projectId = project.id;

  process.env.GITHUB_OWNER = 'CorvidLabs';
  process.env.GITHUB_REPO = 'corvid-agent';

  mockAddIssueComment.mockReset();
  mockAddIssueComment.mockImplementation(() => Promise.resolve());
  (mockProcessManager.startProcess as ReturnType<typeof mock>).mockReset();
  (mockProcessManager.subscribe as ReturnType<typeof mock>).mockReset();
});

afterEach(() => {
  db.close();
  delete process.env.GITHUB_OWNER;
  delete process.env.GITHUB_REPO;
});

// ─── Ack comment dedup through processMention ───────────────────────────────

describe('ack comment dedup via processMention', () => {
  test('posts ack comment for external mentions', async () => {
    const service = new MentionPollingService(db, mockProcessManager);
    const config = createMentionPollingConfig(db, {
      agentId,
      repo: 'CorvidLabs/corvid-agent',
      mentionUsername: 'corvid-bot',
      projectId,
    });

    const mention = makeMention({ sender: 'external-user' });
    const processMention = (service as unknown as {
      processMention: (c: typeof config, m: DetectedMention) => Promise<boolean>;
    }).processMention.bind(service);

    const result = await processMention(config, mention);
    expect(result).toBe(true);
    expect(mockAddIssueComment).toHaveBeenCalledTimes(1);
    const calls = mockAddIssueComment.mock.calls as unknown as unknown[][];
    expect(calls[0]?.[0]).toBe('CorvidLabs/corvid-agent');
    expect(calls[0]?.[1]).toBe(42);
  });

  test('skips ack comment when sender is the bot (own PR)', async () => {
    const service = new MentionPollingService(db, mockProcessManager);
    const config = createMentionPollingConfig(db, {
      agentId,
      repo: 'CorvidLabs/corvid-agent',
      mentionUsername: 'corvid-bot',
      projectId,
    });

    const mention = makeMention({ sender: 'corvid-bot' });
    const processMention = (service as unknown as {
      processMention: (c: typeof config, m: DetectedMention) => Promise<boolean>;
    }).processMention.bind(service);

    const result = await processMention(config, mention);
    expect(result).toBe(true);
    expect(mockAddIssueComment).not.toHaveBeenCalled();
  });

  test('dedup prevents second ack for same issue across configs', async () => {
    const service = new MentionPollingService(db, mockProcessManager);
    const config1 = createMentionPollingConfig(db, {
      agentId,
      repo: 'CorvidLabs/corvid-agent',
      mentionUsername: 'corvid-bot',
      projectId,
    });
    const config2 = createMentionPollingConfig(db, {
      agentId,
      repo: 'CorvidLabs/corvid-agent',
      mentionUsername: 'corvid-bot',
      projectId,
    });

    const processMention = (service as unknown as {
      processMention: (c: typeof config1, m: DetectedMention) => Promise<boolean>;
    }).processMention.bind(service);

    // Use a unique issue number to avoid cross-test pollution from DedupService.global()
    const mention1 = makeMention({ id: 'comment-200', number: 999 });
    const mention2 = makeMention({ id: 'comment-201', number: 999 });

    // First config triggers ack
    await processMention(config1, mention1);
    expect(mockAddIssueComment).toHaveBeenCalledTimes(1);

    mockAddIssueComment.mockClear();

    // Second config for same issue — no ack (dedup)
    await processMention(config2, mention2);
    expect(mockAddIssueComment).not.toHaveBeenCalled();
  });
});
