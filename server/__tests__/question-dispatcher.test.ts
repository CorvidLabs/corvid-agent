import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { upsertChannel } from '../db/notifications';
import { runMigrations } from '../db/schema';
import { QuestionDispatcher } from '../notifications/question-dispatcher';
import type { OwnerQuestion } from '../process/owner-question-manager';

// Use a real in-memory DB instead of mock.module to avoid polluting global state.
// mock.module replaces modules process-wide, breaking other test files that import
// from the same modules (e.g., question-channels.test.ts, notification DB tests).

let db: Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterAll(() => db.close());

function makeQuestion(overrides: Partial<OwnerQuestion> = {}): OwnerQuestion {
  return {
    id: 'q-1',
    agentId: 'agent-1',
    sessionId: 'sess-1',
    question: 'Should I proceed?',
    options: ['Yes', 'No'],
    context: 'Testing context',
    createdAt: '2026-03-07T00:00:00Z',
    timeoutMs: 300000,
    ...overrides,
  };
}

function seedAgent(agentId: string): void {
  // Ensure agent exists for foreign key constraint
  db.query(`INSERT OR IGNORE INTO agents (id, name, model, system_prompt) VALUES (?, ?, ?, ?)`).run(
    agentId,
    'Test Agent',
    'test-model',
    'test prompt',
  );
}

describe('QuestionDispatcher', () => {
  let dispatcher: QuestionDispatcher;

  beforeEach(() => {
    dispatcher = new QuestionDispatcher(db);
    // Clean channels between tests
    db.exec('DELETE FROM owner_question_dispatches');
    db.exec('DELETE FROM notification_channels');
  });

  test('returns empty array when no channels configured', async () => {
    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual([]);
  });

  test('skips disabled channels', async () => {
    seedAgent('agent-1');
    upsertChannel(db, 'agent-1', 'github', { repo: 'org/repo' }, false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = spyOn(dispatcher as any, 'dispatchToChannel');
    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  test('dispatches to channel and records dispatch', async () => {
    seedAgent('agent-1');
    upsertChannel(db, 'agent-1', 'github', { repo: 'org/repo' }, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spyOn(dispatcher as any, 'dispatchToChannel').mockResolvedValue({
      success: true,
      externalRef: 'issue-42',
    });

    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual(['github']);

    // Verify dispatch was recorded in DB
    const dispatches = db.query(`SELECT * FROM owner_question_dispatches WHERE question_id = ?`).all('q-1') as Record<
      string,
      unknown
    >[];
    expect(dispatches.length).toBe(1);
    expect(dispatches[0].channel_type).toBe('github');
    expect(dispatches[0].external_ref).toBe('issue-42');
  });

  test('handles channel dispatch failure gracefully', async () => {
    seedAgent('agent-1');
    upsertChannel(db, 'agent-1', 'github', { repo: 'org/repo' }, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spyOn(dispatcher as any, 'dispatchToChannel').mockResolvedValue({
      success: false,
      error: 'failed',
    });

    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual([]);

    // No dispatch recorded
    const dispatches = db.query(`SELECT * FROM owner_question_dispatches WHERE question_id = ?`).all('q-1') as Record<
      string,
      unknown
    >[];
    expect(dispatches.length).toBe(0);
  });

  test('handles channel dispatch exception gracefully', async () => {
    seedAgent('agent-1');
    upsertChannel(db, 'agent-1', 'github', { repo: 'org/repo' }, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spyOn(dispatcher as any, 'dispatchToChannel').mockRejectedValue(new Error('network error'));

    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual([]);
  });

  test('dispatches to multiple channels', async () => {
    seedAgent('agent-1');
    upsertChannel(db, 'agent-1', 'github', { repo: 'org/repo' }, true);
    upsertChannel(db, 'agent-1', 'telegram', { botToken: 'tok', chatId: '123' }, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spyOn(dispatcher as any, 'dispatchToChannel').mockResolvedValue({
      success: true,
      externalRef: 'ref-1',
    });

    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual(['github', 'telegram']);

    const dispatches = db.query(`SELECT * FROM owner_question_dispatches WHERE question_id = ?`).all('q-1') as Record<
      string,
      unknown
    >[];
    expect(dispatches.length).toBe(2);
  });

  test('returns error for missing github repo config', async () => {
    seedAgent('agent-1');
    upsertChannel(db, 'agent-1', 'github', {}, true);
    const origRepo = process.env.NOTIFICATION_GITHUB_REPO;
    delete process.env.NOTIFICATION_GITHUB_REPO;

    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual([]);

    process.env.NOTIFICATION_GITHUB_REPO = origRepo;
  });

  test('returns error for missing telegram config', async () => {
    seedAgent('agent-1');
    upsertChannel(db, 'agent-1', 'telegram', {}, true);
    const origToken = process.env.TELEGRAM_BOT_TOKEN;
    const origChat = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual([]);

    process.env.TELEGRAM_BOT_TOKEN = origToken;
    process.env.TELEGRAM_CHAT_ID = origChat;
  });

  test('returns error for unknown channel type', async () => {
    seedAgent('agent-1');
    upsertChannel(db, 'agent-1', 'carrier_pigeon', {}, true);

    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual([]);
  });

  test('returns error for discord (notification-only)', async () => {
    seedAgent('agent-1');
    upsertChannel(db, 'agent-1', 'discord', {}, true);

    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual([]);
  });

  test('algochat requires messenger to be set', async () => {
    seedAgent('agent-1');
    upsertChannel(db, 'agent-1', 'algochat', { toAddress: 'ADDR123' }, true);

    // No messenger set — should fail
    const result = await dispatcher.dispatch(makeQuestion());
    expect(result).toEqual([]);
  });
});
