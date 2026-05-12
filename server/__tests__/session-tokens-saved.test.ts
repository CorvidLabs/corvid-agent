/**
 * Tests for addSessionTokensSaved — tracks tokens saved by keep-alive warm turns.
 *
 * Warm turns skip context reconstruction, saving ~80-90% of input tokens.
 * This function atomically accumulates those savings in the sessions table.
 */
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { addSessionTokensSaved, createSession, getSession } from '../db/sessions';

const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';

let db: Database;
let sessionId: string;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  // Simulate migration 130 (Layer 1 protected — added here for test isolation)
  const cols = db.query('PRAGMA table_info(sessions)').all() as { name: string }[];
  if (!cols.find((c) => c.name === 'tokens_saved')) {
    db.exec('ALTER TABLE sessions ADD COLUMN tokens_saved INTEGER NOT NULL DEFAULT 0');
  }
  db.query(
    `INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'claude-sonnet-4-6', 'test')`,
  ).run(AGENT_ID);
  db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
  const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Test' });
  sessionId = session.id;
});

afterEach(() => {
  db.close();
});

describe('addSessionTokensSaved', () => {
  test('new session starts with tokensSaved = 0', () => {
    const session = getSession(db, sessionId);
    expect(session).not.toBeNull();
    expect(session!.tokensSaved).toBe(0);
  });

  test('increments tokensSaved by the given amount', () => {
    addSessionTokensSaved(db, sessionId, 45000);

    const session = getSession(db, sessionId);
    expect(session!.tokensSaved).toBe(45000);
  });

  test('accumulates across multiple calls', () => {
    addSessionTokensSaved(db, sessionId, 45000);
    addSessionTokensSaved(db, sessionId, 50000);
    addSessionTokensSaved(db, sessionId, 12000);

    const session = getSession(db, sessionId);
    expect(session!.tokensSaved).toBe(107000);
  });

  test('handles unknown sessionId gracefully without throwing', () => {
    expect(() => {
      addSessionTokensSaved(db, 'non-existent-session-id', 10000);
    }).not.toThrow();
  });
});
