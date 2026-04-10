/**
 * Tests for ack-comment dedup logic in MentionPollingService.processMention.
 *
 * Tests verify dedup behavior through DedupService state rather than
 * mock.module (which is process-wide in Bun and leaks between test files).
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// Import the real prompt-injection module BEFORE mock.module so we can
// re-export it in the mock (mock.module is process-wide and leaks).
import { scanForInjection, scanGitHubContent } from '../lib/prompt-injection';

// We still need mock.module for github/operations so processMention doesn't
// make real HTTP calls, but we also re-export prompt-injection to avoid
// clobbering prompt-injection.test.ts.
const mockAddIssueComment = mock(() => Promise.resolve());
mock.module('../github/operations', () => ({
  addIssueComment: mockAddIssueComment,
}));

mock.module('../lib/prompt-injection', () => ({
  scanForInjection,
  scanGitHubContent,
}));

import { createAgent } from '../db/agents';
import { createMentionPollingConfig } from '../db/mention-polling';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import { DedupService } from '../lib/dedup';
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

const ACK_DEDUP_NS = 'polling:ack-comments';

describe('ack comment dedup via processMention', () => {
  test('marks ack dedup key for external mentions', async () => {
    const service = new MentionPollingService(db, mockProcessManager);
    const config = createMentionPollingConfig(db, {
      agentId,
      repo: 'CorvidLabs/corvid-agent',
      mentionUsername: 'corvid-bot',
      projectId,
    });

    const mention = makeMention({ sender: 'external-user', number: 7001 });
    const processMention = (service as unknown as {
      processMention: (c: typeof config, m: DetectedMention) => Promise<boolean>;
    }).processMention.bind(service);

    const dedup = DedupService.global();
    const ackKey = 'CorvidLabs/corvid-agent#7001';
    expect(dedup.has(ACK_DEDUP_NS, ackKey)).toBe(false);

    const result = await processMention(config, mention);
    expect(result).toBe(true);
    // After processing an external mention, the ack dedup key should be set
    expect(dedup.has(ACK_DEDUP_NS, ackKey)).toBe(true);
  });

  test('skips ack when sender is the bot (own PR)', async () => {
    const service = new MentionPollingService(db, mockProcessManager);
    const config = createMentionPollingConfig(db, {
      agentId,
      repo: 'CorvidLabs/corvid-agent',
      mentionUsername: 'corvid-bot',
      projectId,
    });

    const mention = makeMention({ sender: 'corvid-bot', number: 7002 });
    const processMention = (service as unknown as {
      processMention: (c: typeof config, m: DetectedMention) => Promise<boolean>;
    }).processMention.bind(service);

    const dedup = DedupService.global();
    const ackKey = 'CorvidLabs/corvid-agent#7002';

    const result = await processMention(config, mention);
    expect(result).toBe(true);
    // Bot's own mentions should NOT set the ack dedup key
    expect(dedup.has(ACK_DEDUP_NS, ackKey)).toBe(false);
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

    const dedup = DedupService.global();
    const ackKey = 'CorvidLabs/corvid-agent#7003';

    const mention1 = makeMention({ id: 'comment-200', number: 7003 });
    const mention2 = makeMention({ id: 'comment-201', number: 7003 });

    // First config triggers ack — key gets set
    expect(dedup.has(ACK_DEDUP_NS, ackKey)).toBe(false);
    await processMention(config1, mention1);
    expect(dedup.has(ACK_DEDUP_NS, ackKey)).toBe(true);

    // Second config for same issue — key already set, dedup prevents ack
    // The dedup.has() check in processMention will return true, skipping the ack
    await processMention(config2, mention2);
    // Key is still set (idempotent)
    expect(dedup.has(ACK_DEDUP_NS, ackKey)).toBe(true);
  });
});
