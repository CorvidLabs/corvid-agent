import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { addSessionMessage, createSession } from '../db/sessions';
import { ProcessManager } from '../process/manager';
import type { SdkProcess } from '../process/sdk-process';
import type { ClaudeStreamEvent } from '../process/types';

let db: Database;
let pm: ProcessManager;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';
let sessionId: string;

function makeMockProcess(sendResult: boolean = true): SdkProcess {
  return {
    pid: 999,
    sendMessage: () => sendResult,
    kill: () => {},
    isAlive: () => true,
    isWarm: () => false,
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

describe('ProcessManager.compactSession', () => {
  test('returns false for nonexistent session', () => {
    expect(pm.compactSession('nonexistent-id')).toBe(false);
  });

  test('returns false when session has no running process', () => {
    expect(pm.compactSession(sessionId)).toBe(false);
  });

  test('returns true and kills process when session is running', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 5,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const result = pm.compactSession(sessionId);
    expect(result).toBe(true);
    expect(pm.isRunning(sessionId)).toBe(false);
  });

  test('generates context summary from session messages', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 3,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    addSessionMessage(db, sessionId, 'user', 'Fix the login bug in auth.ts');
    addSessionMessage(db, sessionId, 'assistant', 'I found the issue in the token validation.');

    pm.compactSession(sessionId);

    const row = db.query('SELECT conversation_summary FROM sessions WHERE id = ?').get(sessionId) as {
      conversation_summary: string | null;
    };
    expect(row.conversation_summary).toContain('[Context Summary]');
    expect(row.conversation_summary).toContain('Fix the login bug');
  });

  test('stores summary in sessionMeta.contextSummary', () => {
    const meta = {
      turnCount: 2,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, meta);

    addSessionMessage(db, sessionId, 'user', 'Implement feature X');
    addSessionMessage(db, sessionId, 'assistant', 'Done implementing feature X.');

    pm.compactSession(sessionId);

    const updatedMeta = (pm as any).sessionMeta.get(sessionId);
    expect(updatedMeta.contextSummary).toContain('[Context Summary]');
  });

  test('emits context_compacted session_error event', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 1,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const events: ClaudeStreamEvent[] = [];
    pm.subscribe(sessionId, (_sid, event) => events.push(event));

    pm.compactSession(sessionId);

    const errorEvent = events.find((e) => e.type === 'session_error') as any;
    expect(errorEvent).toBeDefined();
    expect(errorEvent.error.errorType).toBe('context_compacted');
    expect(errorEvent.error.message).toContain('compacted');
    expect(errorEvent.error.recoverable).toBe(true);
  });

  test('clears PID in database after compacting', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 1,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    // Set a PID first
    db.query('UPDATE sessions SET pid = 999 WHERE id = ?').run(sessionId);

    pm.compactSession(sessionId);

    const row = db.query('SELECT pid FROM sessions WHERE id = ?').get(sessionId) as { pid: number | null };
    expect(row.pid).toBeNull();
  });
});

describe('sendMessage /compact interception', () => {
  test('/compact command triggers compactSession', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 3,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const result = pm.sendMessage(sessionId, '/compact');
    expect(result).toBe(true);
    expect(pm.isRunning(sessionId)).toBe(false);
  });

  test('/compact is case-insensitive', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 1,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const result = pm.sendMessage(sessionId, '/Compact');
    expect(result).toBe(true);
    expect(pm.isRunning(sessionId)).toBe(false);
  });

  test('/compact with whitespace is still intercepted', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 1,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const result = pm.sendMessage(sessionId, '  /compact  ');
    expect(result).toBe(true);
    expect(pm.isRunning(sessionId)).toBe(false);
  });

  test('regular messages are not intercepted', () => {
    const mockProc = makeMockProcess();
    (pm as any).processes.set(sessionId, mockProc);
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 0,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const result = pm.sendMessage(sessionId, 'Hello, how are you?');
    expect(result).toBe(true);
    // Process should still be running (not killed by compact)
    expect(pm.isRunning(sessionId)).toBe(true);
  });

  test('messages containing /compact but not as the full command are not intercepted', () => {
    const mockProc = makeMockProcess();
    (pm as any).processes.set(sessionId, mockProc);
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 0,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const result = pm.sendMessage(sessionId, 'Can you explain /compact to me?');
    expect(result).toBe(true);
    expect(pm.isRunning(sessionId)).toBe(true);
  });
});

describe('auto-compact on context_usage event', () => {
  test('triggers compaction when usage reaches 90%', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 10,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const event = {
      type: 'context_usage',
      session_id: sessionId,
      estimatedTokens: 184000,
      contextWindow: 200000,
      usagePercent: 92,
    } as unknown as ClaudeStreamEvent;

    (pm as any).handleEvent(sessionId, event);

    expect(pm.isRunning(sessionId)).toBe(false);
  });

  test('does not trigger compaction below 90%', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 10,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const event = {
      type: 'context_usage',
      session_id: sessionId,
      estimatedTokens: 170000,
      contextWindow: 200000,
      usagePercent: 85,
    } as unknown as ClaudeStreamEvent;

    (pm as any).handleEvent(sessionId, event);

    expect(pm.isRunning(sessionId)).toBe(true);
  });

  test('updates lastContextUsagePercent in meta', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 5,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const event = {
      type: 'context_usage',
      session_id: sessionId,
      estimatedTokens: 150000,
      contextWindow: 200000,
      usagePercent: 75,
    } as unknown as ClaudeStreamEvent;

    (pm as any).handleEvent(sessionId, event);

    const meta = (pm as any).sessionMeta.get(sessionId);
    expect(meta.lastContextUsagePercent).toBe(75);
  });

  test('triggers at exactly 90%', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 8,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const event = {
      type: 'context_usage',
      session_id: sessionId,
      estimatedTokens: 180000,
      contextWindow: 200000,
      usagePercent: 90,
    } as unknown as ClaudeStreamEvent;

    (pm as any).handleEvent(sessionId, event);

    expect(pm.isRunning(sessionId)).toBe(false);
  });

  test('ignores context_usage without usagePercent', () => {
    (pm as any).processes.set(sessionId, makeMockProcess());
    (pm as any).sessionMeta.set(sessionId, {
      turnCount: 5,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    const event = {
      type: 'context_usage',
      session_id: sessionId,
    } as unknown as ClaudeStreamEvent;

    (pm as any).handleEvent(sessionId, event);

    expect(pm.isRunning(sessionId)).toBe(true);
    const meta = (pm as any).sessionMeta.get(sessionId);
    expect(meta.lastContextUsagePercent).toBeUndefined();
  });
});

describe('turnCount persistence', () => {
  test('session.totalTurns is stored in database', () => {
    db.query('UPDATE sessions SET total_turns = 15 WHERE id = ?').run(sessionId);

    const row = db.query('SELECT total_turns FROM sessions WHERE id = ?').get(sessionId) as { total_turns: number };
    expect(row.total_turns).toBe(15);
  });
});
