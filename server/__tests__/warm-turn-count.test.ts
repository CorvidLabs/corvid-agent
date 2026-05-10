import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { createSession, getSession, incrementSessionWarmTurnCount } from '../db/sessions';
import { ProcessManager } from '../process/manager';
import type { SdkProcess } from '../process/sdk-process';

let db: Database;
let pm: ProcessManager;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';
let sessionId: string;

function makeWarmProcess(sendResult = true): SdkProcess {
  return {
    pid: 42,
    sendMessage: () => sendResult,
    kill: () => {},
    isAlive: () => true,
    isWarm: () => true,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
  db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
  const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Test' });
  sessionId = session.id;
  pm = new ProcessManager(db);
});

afterEach(() => {
  pm.shutdown();
  db.close();
});

// ── incrementSessionWarmTurnCount ────────────────────────────────────────────

describe('incrementSessionWarmTurnCount', () => {
  test('starts at 0 on new session', () => {
    const session = getSession(db, sessionId);
    expect(session?.warmTurnCount).toBe(0);
  });

  test('increments from 0 to 1', () => {
    incrementSessionWarmTurnCount(db, sessionId);
    expect(getSession(db, sessionId)?.warmTurnCount).toBe(1);
  });

  test('increments cumulatively', () => {
    incrementSessionWarmTurnCount(db, sessionId);
    incrementSessionWarmTurnCount(db, sessionId);
    incrementSessionWarmTurnCount(db, sessionId);
    expect(getSession(db, sessionId)?.warmTurnCount).toBe(3);
  });

  test('is idempotent on nonexistent session — does not throw', () => {
    expect(() => incrementSessionWarmTurnCount(db, 'no-such-session')).not.toThrow();
  });
});

// ── ProcessManager warm path counting ────────────────────────────────────────

describe('resumeProcess warm path increments warm_turn_count', () => {
  test('increments warm_turn_count when message delivered to live process', () => {
    const warmProcess = makeWarmProcess();
    (pm as any).processes.set(sessionId, warmProcess);

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'hello warm turn');

    expect(getSession(db, sessionId)?.warmTurnCount).toBe(1);
  });

  test('increments on each subsequent warm turn', () => {
    const warmProcess = makeWarmProcess();
    (pm as any).processes.set(sessionId, warmProcess);

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'first warm message');
    pm.resumeProcess(session, 'second warm message');

    expect(getSession(db, sessionId)?.warmTurnCount).toBe(2);
  });

  test('does NOT increment when sendMessage fails (falls through to cold start)', () => {
    const failingProcess = makeWarmProcess(false);
    (pm as any).processes.set(sessionId, failingProcess);

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'will fail warm delivery');

    expect(getSession(db, sessionId)?.warmTurnCount).toBe(0);
  });

  test('does NOT increment on cold start (no live process)', () => {
    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'cold start prompt');

    expect(getSession(db, sessionId)?.warmTurnCount).toBe(0);
  });
});
