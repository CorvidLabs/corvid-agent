/**
 * Tests for ResponsePollingService — polls GitHub issues and Telegram
 * for answers to owner questions dispatched by the notification system.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createAgent } from '../db/agents';
import { runMigrations } from '../db/schema';
import { ResponsePollingService } from '../notifications/response-poller';
import type { OwnerQuestionManager, OwnerQuestionResponse } from '../process/owner-question-manager';

// ─── Test Setup ─────────────────────────────────────────────────────────────

let db: Database;
let agentId: string;

function createMockOwnerQuestionManager() {
  return {
    resolveQuestion: mock((_questionId: string, _response: OwnerQuestionResponse) => true),
    findByShortId: mock(() => null),
  } as unknown as OwnerQuestionManager;
}

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

// Helper: insert an owner question into the DB
function insertOwnerQuestion(questionId: string, options?: string[]) {
  db.query(`
        INSERT INTO owner_questions (id, session_id, agent_id, question, options, status)
        VALUES (?, 'sess-1', ?, 'What should I do?', ?, 'pending')
    `).run(questionId, agentId, options ? JSON.stringify(options) : null);
}

// Helper: insert a question dispatch
function insertDispatch(questionId: string, channelType: string, externalRef: string | null = null) {
  db.query(`
        INSERT INTO owner_question_dispatches (question_id, channel_type, external_ref, status)
        VALUES (?, ?, ?, 'sent')
    `).run(questionId, channelType, externalRef);
  const row = db.query('SELECT last_insert_rowid() as id').get() as { id: number };
  return row.id;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

describe('ResponsePollingService lifecycle', () => {
  test('start sets up polling interval', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    service.start();

    // Verify internal pollTimer is set
    const pollTimer = (service as unknown as { pollTimer: unknown }).pollTimer;
    expect(pollTimer).not.toBeNull();

    service.stop();
  });

  test('start is idempotent', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    service.start();
    service.start(); // Second call should be no-op

    service.stop();
  });

  test('stop clears polling interval', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    service.start();
    service.stop();

    const pollTimer = (service as unknown as { pollTimer: unknown }).pollTimer;
    expect(pollTimer).toBeNull();
  });

  test('stop is safe when not started', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    service.stop(); // Should not throw
  });
});

// ─── parseResponse ──────────────────────────────────────────────────────────

describe('parseResponse', () => {
  function callParseResponse(
    service: ResponsePollingService,
    text: string,
    questionId: string,
  ): { answer: string; selectedOption: number | null } {
    return (
      service as unknown as {
        parseResponse: (text: string, questionId: string) => { answer: string; selectedOption: number | null };
      }
    ).parseResponse(text, questionId);
  }

  test('returns freeform text when no options exist', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    insertOwnerQuestion('q1');

    const result = callParseResponse(service, 'My custom answer', 'q1');
    expect(result.answer).toBe('My custom answer');
    expect(result.selectedOption).toBeNull();
  });

  test('maps number to option (1-based)', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    insertOwnerQuestion('q2', ['Option A', 'Option B', 'Option C']);

    const result = callParseResponse(service, '2', 'q2');
    expect(result.answer).toBe('Option B');
    expect(result.selectedOption).toBe(1); // 0-based index
  });

  test('maps first option with number 1', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    insertOwnerQuestion('q3', ['Yes', 'No']);

    const result = callParseResponse(service, '1', 'q3');
    expect(result.answer).toBe('Yes');
    expect(result.selectedOption).toBe(0);
  });

  test('out-of-range number treated as freeform', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    insertOwnerQuestion('q4', ['A', 'B']);

    const result = callParseResponse(service, '5', 'q4');
    expect(result.answer).toBe('5');
    expect(result.selectedOption).toBeNull();
  });

  test('matches option text case-insensitively', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    insertOwnerQuestion('q5', ['Approve', 'Reject']);

    const result = callParseResponse(service, 'approve', 'q5');
    expect(result.answer).toBe('Approve');
    expect(result.selectedOption).toBe(0);
  });

  test('trims whitespace from response', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    insertOwnerQuestion('q6', ['Yes', 'No']);

    const result = callParseResponse(service, '  Yes  ', 'q6');
    expect(result.answer).toBe('Yes');
    expect(result.selectedOption).toBe(0);
  });

  test('handles non-existent question gracefully', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    // Question doesn't exist in DB
    const result = callParseResponse(service, 'response', 'nonexistent');
    expect(result.answer).toBe('response');
    expect(result.selectedOption).toBeNull();
  });

  test('handles question with null options', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    insertOwnerQuestion('q7');

    const result = callParseResponse(service, '1', 'q7');
    // No options to map to, so treated as freeform
    expect(result.answer).toBe('1');
    expect(result.selectedOption).toBeNull();
  });
});

// ─── markAllAnswered ────────────────────────────────────────────────────────

describe('markAllAnswered', () => {
  function callMarkAllAnswered(service: ResponsePollingService, questionId: string): void {
    (service as unknown as { markAllAnswered: (qId: string) => void }).markAllAnswered(questionId);
  }

  test('marks all sent dispatches for a question as answered', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    insertOwnerQuestion('q-mark-1');
    insertDispatch('q-mark-1', 'github', 'https://github.com/org/repo/issues/1');
    insertDispatch('q-mark-1', 'telegram', '12345');

    callMarkAllAnswered(service, 'q-mark-1');

    const dispatches = db
      .query(`SELECT status FROM owner_question_dispatches WHERE question_id = ?`)
      .all('q-mark-1') as Array<{ status: string }>;

    expect(dispatches.every((d) => d.status === 'answered')).toBe(true);
  });

  test('does not mark dispatches for other questions', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    insertOwnerQuestion('q-mark-2');
    insertOwnerQuestion('q-mark-3');
    insertDispatch('q-mark-2', 'github');
    insertDispatch('q-mark-3', 'github');

    callMarkAllAnswered(service, 'q-mark-2');

    const otherDispatch = db
      .query(`SELECT status FROM owner_question_dispatches WHERE question_id = ?`)
      .get('q-mark-3') as { status: string };

    expect(otherDispatch.status).toBe('sent');
  });

  test('skips dispatches not in sent status', () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    insertOwnerQuestion('q-mark-4');
    const id = insertDispatch('q-mark-4', 'github');
    db.query("UPDATE owner_question_dispatches SET status = 'expired' WHERE id = ?").run(id);

    callMarkAllAnswered(service, 'q-mark-4');

    const dispatch = db.query(`SELECT status FROM owner_question_dispatches WHERE id = ?`).get(id) as {
      status: string;
    };

    // Should still be expired, not answered
    expect(dispatch.status).toBe('expired');
  });
});

// ─── poll method ────────────────────────────────────────────────────────────

describe('poll', () => {
  function callPoll(service: ResponsePollingService): Promise<void> {
    return (service as unknown as { poll: () => Promise<void> }).poll();
  }

  test('does nothing when no active dispatches exist', async () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    await callPoll(service);
    // Should complete without error
    expect(oqm.resolveQuestion).not.toHaveBeenCalled();
  });

  test('skips poll if previous poll is still running', async () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    // Set the polling flag
    (service as unknown as { polling: boolean }).polling = true;

    await callPoll(service);
    // Should return early without doing anything
    expect(oqm.resolveQuestion).not.toHaveBeenCalled();

    (service as unknown as { polling: boolean }).polling = false;
  });

  test('resets polling flag after completion', async () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    await callPoll(service);

    const polling = (service as unknown as { polling: boolean }).polling;
    expect(polling).toBe(false);
  });

  test('resets polling flag even on error', async () => {
    const oqm = createMockOwnerQuestionManager();
    // Use a broken DB to cause errors
    const badDb = new Database(':memory:');
    // Don't run migrations — queries will fail
    const service = new ResponsePollingService(badDb, oqm);

    await callPoll(service);

    const polling = (service as unknown as { polling: boolean }).polling;
    expect(polling).toBe(false);

    badDb.close();
  });

  test('groups dispatches by channel type', async () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    // Mock pollGitHub and pollTelegram to avoid real HTTP calls
    const priv = service as unknown as {
      pollGitHub: (dispatches: GHDispatch[]) => Promise<void>;
      pollTelegram: (dispatches: unknown[]) => Promise<void>;
    };
    const originalPollGitHub = priv.pollGitHub;
    const originalPollTelegram = priv.pollTelegram;
    let ghCalled = false;
    let tgCalled = false;
    priv.pollGitHub = async () => {
      ghCalled = true;
    };
    priv.pollTelegram = async () => {
      tgCalled = true;
    };

    insertOwnerQuestion('q-group-1');
    insertDispatch('q-group-1', 'github', 'https://github.com/org/repo/issues/1');
    insertDispatch('q-group-1', 'telegram', '12345');

    await callPoll(service);

    // Verify both channel-specific pollers were invoked
    expect(ghCalled).toBe(true);
    expect(tgCalled).toBe(true);

    // Polling flag should be reset
    const polling = (service as unknown as { polling: boolean }).polling;
    expect(polling).toBe(false);

    // Restore
    priv.pollGitHub = originalPollGitHub;
    priv.pollTelegram = originalPollTelegram;
  });
});

// ─── pollGitHub ─────────────────────────────────────────────────────────────

type GHDispatch = { id: number; questionId: string; externalRef: string | null; createdAt: string };

describe('pollGitHub', () => {
  function callPollGitHub(service: ResponsePollingService, dispatches: GHDispatch[]): Promise<void> {
    return (
      service as unknown as {
        pollGitHub: (dispatches: GHDispatch[]) => Promise<void>;
      }
    ).pollGitHub(dispatches);
  }

  test('skips dispatches without externalRef', async () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    await callPollGitHub(service, [
      {
        id: 1,
        questionId: 'q1',
        externalRef: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    expect(oqm.resolveQuestion).not.toHaveBeenCalled();
  });

  test('skips dispatches with invalid GitHub URL', async () => {
    const oqm = createMockOwnerQuestionManager();
    const service = new ResponsePollingService(db, oqm);

    await callPollGitHub(service, [
      {
        id: 1,
        questionId: 'q1',
        externalRef: 'https://not-github.com/something',
        createdAt: new Date().toISOString(),
      },
    ]);

    expect(oqm.resolveQuestion).not.toHaveBeenCalled();
  });
});
