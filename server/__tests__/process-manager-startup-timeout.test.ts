/**
 * Tests for the startup timeout in ProcessManager.
 *
 * When a session starts but receives no events within the startup window,
 * the timer fires and kills the session (e.g., hung Ollama proxy, dead endpoint).
 */

import { mock, spyOn } from 'bun:test';

// Must mock sdk-process before ProcessManager import
mock.module('../process/sdk-process', () => ({
  startSdkProcess: () => ({ pid: 999, sendMessage: () => true, kill: () => {} }),
}));

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { createSession, getSession } from '../db/sessions';
import { ProcessManager } from '../process/manager';
import type { SessionTimerManager } from '../process/session-timer-manager';
import type { ClaudeStreamEvent } from '../process/types';

const AGENT_ID = 'agent-startup-timeout-1';
const PROJECT_ID = 'proj-startup-timeout-1';

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

  const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'StartupTimeoutTest' });
  sessionId = session.id;

  pm = new ProcessManager(db);
});

afterEach(() => {
  pm.shutdown();
  db.close();
});

describe('startup timeout', () => {
  test('onStartupTimeout callback stops session and adds system message', () => {
    // Access the timerManager's callbacks by triggering the startup timeout directly
    // We spy on stopProcess-related DB calls to verify the callback wiring
    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session);

    // Directly invoke the startup timeout callback via the timer manager
    // by getting the callback from the ProcessManager's timerManager
    const timerManager = (pm as unknown as { timerManager: SessionTimerManager }).timerManager;
    const callbacks = (timerManager as unknown as { callbacks: { onStartupTimeout: (id: string) => void } }).callbacks;

    // Call the callback directly to test the wiring
    callbacks.onStartupTimeout(sessionId);

    // Session should be stopped
    const updated = getSession(db, sessionId)!;
    expect(updated.status).toBe('stopped');

    // Should have a system message about the timeout
    const messages = db
      .query('SELECT content FROM session_messages WHERE session_id = ? AND role = ?')
      .all(sessionId, 'system') as { content: string }[];
    const timeoutMsg = messages.find((m) => m.content.includes('timed out waiting for the model'));
    expect(timeoutMsg).toBeDefined();
  });

  test('clearStartupTimeout is called on handleEvent', () => {
    const timerManager = (pm as unknown as { timerManager: SessionTimerManager }).timerManager;
    const spy = spyOn(timerManager, 'clearStartupTimeout');

    const session = getSession(db, sessionId)!;
    pm.resumeProcess(session);
    spy.mockClear(); // clear calls from setup

    // Trigger handleEvent via the private method through the event callback
    const handleEvent = (pm as unknown as { handleEvent: (id: string, e: ClaudeStreamEvent) => void }).handleEvent;
    handleEvent.call(pm, sessionId, { type: 'assistant', session_id: sessionId } as ClaudeStreamEvent);

    expect(spy).toHaveBeenCalledWith(sessionId);
    spy.mockRestore();
  });
});
