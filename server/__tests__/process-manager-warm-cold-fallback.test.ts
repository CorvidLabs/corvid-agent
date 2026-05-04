/**
 * Tests for warm→cold fallback behavior in ProcessManager (issue #2225).
 *
 * Documents what DOES work correctly today (process eviction when a warm turn fails)
 * and what is still broken (no automatic cold-start fallback when sendMessage fails).
 *
 * Background: resumeProcess() has a warm-start path (processes.has() check) that
 * silently drops the user message when the underlying sendMessage() returns false.
 * The dead process IS evicted from the map by sendMessage(), but resumeProcess()
 * returns immediately rather than falling through to cold-start.
 *
 * The manager.ts fix that adds the cold-start fallback is blocked by governance
 * (manager.ts is Layer 0 Constitutional — requires human-only commit). This file
 * tests the eviction behaviour that already works correctly and documents the gap.
 *
 * See: specs/process/process-spawner.spec.md §"Invariant #8"
 */

// mock.module MUST be before any imports to prevent real SDK spawning
import { mock } from 'bun:test';

mock.module('../process/sdk-process', () => ({
  startSdkProcess: () => ({ pid: 999, sendMessage: () => true, kill: () => {}, isAlive: () => true }),
}));

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { createSession, getSession } from '../db/sessions';
import { ProcessManager } from '../process/manager';
import type { SdkProcess } from '../process/sdk-process';

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_ID = 'agent-warm-cold-1';
const PROJECT_ID = 'proj-warm-cold-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockProcess(sendResult: boolean = true, alive: boolean = true): SdkProcess {
  return {
    pid: 999,
    sendMessage: () => sendResult,
    kill: () => {},
    isAlive: () => alive,
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let db: Database;
let pm: ProcessManager;
let sessionId: string;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  db.query(
    `INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'claude-haiku-4-5-20251001', 'test')`,
  ).run(AGENT_ID);
  db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);

  const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'WarmColdTest' });
  sessionId = session.id;
  pm = new ProcessManager(db);
});

afterEach(() => {
  pm.shutdown();
  db.close();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('warm→cold fallback behavior (#2225)', () => {
  test('dead process is evicted from map when warm turn fails via resumeProcess', () => {
    // Zombie: in the processes Map (so has() check passes), but sendMessage returns false.
    // alive=true so the early isAlive guard in sendMessage does NOT fire — the eviction
    // happens via the cp.sendMessage() failure path (manager.ts:1629).
    const zombie = makeMockProcess(false, true);
    (pm as any).processes.set(sessionId, zombie);

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'my message');

    // The dead process must be evicted from the Map after the failed warm turn.
    // sendMessage() calls processes.delete() when cp.sendMessage() returns false.
    expect(pm.isRunning(sessionId)).toBe(false);
  });

  test('no message persisted to session history when warm turn fails (message is dropped — bug #2225)', () => {
    // When sendMessage returns false the message is NOT written to session_messages.
    // This is CORRECT for the sendMessage path itself (no partial-write), but the
    // session's prompt is lost because resumeProcess() returns without cold-starting.
    // After the manager.ts fix (#2225), the cold-start will deliver the message and
    // it WILL be persisted; this assertion will need to be updated accordingly.
    const zombie = makeMockProcess(false, true);
    (pm as any).processes.set(sessionId, zombie);

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'my message');

    const messages = db.query('SELECT * FROM session_messages WHERE session_id = ?').all(sessionId);
    expect(messages).toHaveLength(0);
  });

  test('process without prompt: warm path returns early without calling sendMessage', () => {
    // When resumeProcess is called with no prompt and a live process is registered,
    // it returns early (nothing to send) and the process stays in the Map.
    const liveProc = makeMockProcess(true, true);
    (pm as any).processes.set(sessionId, liveProc);

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session); // no prompt

    // Live process must still be in the Map — no eviction occurred
    expect(pm.isRunning(sessionId)).toBe(true);
  });

  test('sendMessage returns false and evicts zombie (direct sendMessage path)', () => {
    // Sanity-check: pm.sendMessage() correctly returns false and evicts a zombie.
    // This is a prerequisite for the resumeProcess eviction tested above.
    const zombie = makeMockProcess(false, true);
    (pm as any).processes.set(sessionId, zombie);

    const result = pm.sendMessage(sessionId, 'hello');

    expect(result).toBe(false);
    expect(pm.isRunning(sessionId)).toBe(false);
  });

  test('session is cold-start-ready after failed warm turn (process evicted, no stale state)', () => {
    // After the failed warm turn, the session must be in a clean state so that a
    // subsequent resumeProcess call can cold-start without hitting the has() guard.
    const zombie = makeMockProcess(false, true);
    (pm as any).processes.set(sessionId, zombie);

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session, 'my message');

    // Post-eviction: has() returns false → a subsequent resumeProcess would proceed
    // to the cold-start path rather than the warm path.
    expect((pm as any).processes.has(sessionId)).toBe(false);

    // Starting guard must also be clear so cold-start is not blocked
    expect((pm as any).startingSession.has(sessionId)).toBe(false);
  });
});
