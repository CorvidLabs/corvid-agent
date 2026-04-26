import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { createSession } from '../db/sessions';
import { type EventCallback, ProcessManager } from '../process/manager';
import type { SdkProcess } from '../process/sdk-process';

let db: Database;
let pm: ProcessManager;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  pm = new ProcessManager(db);
});

afterEach(() => {
  pm.shutdown();
  db.close();
});

describe('cleanupSessionState', () => {
  test('removes subscribers for a session', () => {
    const cb: EventCallback = () => {};
    pm.subscribe('session-1', cb);
    pm.subscribe('session-2', cb);

    const before = pm.getMemoryStats();
    expect(before.subscribers).toBe(2);

    pm.cleanupSessionState('session-1');

    const after = pm.getMemoryStats();
    expect(after.subscribers).toBe(1);
  });

  test('removes pausedSession entries', () => {
    // We can't directly set pausedSessions, but we can verify
    // cleanupSessionState is idempotent and doesn't throw on
    // sessions that don't exist in any map.
    pm.cleanupSessionState('nonexistent-session');

    const stats = pm.getMemoryStats();
    expect(stats.subscribers).toBe(0);
    expect(stats.processes).toBe(0);
    expect(stats.sessionMeta).toBe(0);
    expect(stats.pausedSessions).toBe(0);
  });

  test('is idempotent — safe to call multiple times', () => {
    const cb: EventCallback = () => {};
    pm.subscribe('session-1', cb);

    pm.cleanupSessionState('session-1');
    pm.cleanupSessionState('session-1'); // second call should be a no-op

    const stats = pm.getMemoryStats();
    expect(stats.subscribers).toBe(0);
  });

  test('cleans up multiple subscribers for same session', () => {
    const cb1: EventCallback = () => {};
    const cb2: EventCallback = () => {};
    const cb3: EventCallback = () => {};

    pm.subscribe('session-1', cb1);
    pm.subscribe('session-1', cb2);
    pm.subscribe('session-1', cb3);

    expect(pm.getMemoryStats().subscribers).toBe(1); // 1 Map entry with 3 callbacks

    pm.cleanupSessionState('session-1');

    expect(pm.getMemoryStats().subscribers).toBe(0);
  });

  test('does not affect other sessions', () => {
    const cb: EventCallback = () => {};
    pm.subscribe('session-1', cb);
    pm.subscribe('session-2', cb);
    pm.subscribe('session-3', cb);

    pm.cleanupSessionState('session-2');

    const stats = pm.getMemoryStats();
    expect(stats.subscribers).toBe(2);
  });
});

describe('getMemoryStats', () => {
  test('returns zero counts on fresh instance', () => {
    const stats = pm.getMemoryStats();
    expect(stats.processes).toBe(0);
    expect(stats.subscribers).toBe(0);
    expect(stats.sessionMeta).toBe(0);
    expect(stats.pausedSessions).toBe(0);
    expect(stats.sessionTimeouts).toBe(0);
    expect(stats.stableTimers).toBe(0);
    expect(stats.globalSubscribers).toBe(0);
  });

  test('tracks subscriber additions', () => {
    const cb: EventCallback = () => {};

    pm.subscribe('s1', cb);
    expect(pm.getMemoryStats().subscribers).toBe(1);

    pm.subscribe('s2', cb);
    expect(pm.getMemoryStats().subscribers).toBe(2);
  });

  test('tracks global subscriber additions', () => {
    const cb: EventCallback = () => {};

    pm.subscribeAll(cb);
    expect(pm.getMemoryStats().globalSubscribers).toBe(1);

    pm.unsubscribeAll(cb);
    expect(pm.getMemoryStats().globalSubscribers).toBe(0);
  });
});

describe('subscribe/unsubscribe lifecycle', () => {
  test('unsubscribe removes callback and cleans Set when empty', () => {
    const cb: EventCallback = () => {};
    pm.subscribe('session-1', cb);
    expect(pm.getMemoryStats().subscribers).toBe(1);

    pm.unsubscribe('session-1', cb);
    expect(pm.getMemoryStats().subscribers).toBe(0);
  });

  test('unsubscribe only removes specified callback', () => {
    const cb1: EventCallback = () => {};
    const cb2: EventCallback = () => {};

    pm.subscribe('session-1', cb1);
    pm.subscribe('session-1', cb2);

    pm.unsubscribe('session-1', cb1);
    // Map entry should still exist (cb2 remains)
    expect(pm.getMemoryStats().subscribers).toBe(1);

    pm.unsubscribe('session-1', cb2);
    // Now the Set is empty, Map entry should be removed
    expect(pm.getMemoryStats().subscribers).toBe(0);
  });

  test('unsubscribe is safe for unknown sessions', () => {
    const cb: EventCallback = () => {};
    pm.unsubscribe('nonexistent', cb);
    expect(pm.getMemoryStats().subscribers).toBe(0);
  });
});

describe('shutdown', () => {
  test('clears all subscribers', () => {
    const cb: EventCallback = () => {};
    pm.subscribe('s1', cb);
    pm.subscribe('s2', cb);
    pm.subscribe('s3', cb);
    pm.subscribeAll(cb);

    expect(pm.getMemoryStats().subscribers).toBe(3);
    expect(pm.getMemoryStats().globalSubscribers).toBe(1);

    pm.shutdown();

    const stats = pm.getMemoryStats();
    expect(stats.subscribers).toBe(0);
    expect(stats.sessionMeta).toBe(0);
    expect(stats.pausedSessions).toBe(0);
    expect(stats.sessionTimeouts).toBe(0);
    expect(stats.stableTimers).toBe(0);
    // Note: globalSubscribers are NOT cleared by shutdown — they belong
    // to long-lived services (AlgoChatBridge) that clean themselves up
  });

  test('is idempotent', () => {
    const cb: EventCallback = () => {};
    pm.subscribe('s1', cb);

    pm.shutdown();
    pm.shutdown(); // should not throw

    expect(pm.getMemoryStats().subscribers).toBe(0);
  });
});

describe('memory leak simulation', () => {
  test('subscribers are cleaned after many session cycles', () => {
    // Simulate 100 sessions each adding a subscriber
    for (let i = 0; i < 100; i++) {
      const sessionId = `session-${i}`;
      const cb: EventCallback = () => {};
      pm.subscribe(sessionId, cb);
    }

    expect(pm.getMemoryStats().subscribers).toBe(100);

    // Clean up all sessions (simulating normal exit path)
    for (let i = 0; i < 100; i++) {
      pm.cleanupSessionState(`session-${i}`);
    }

    expect(pm.getMemoryStats().subscribers).toBe(0);
  });

  test('mixed subscribe/cleanup leaves no orphans', () => {
    const callbacks: EventCallback[] = [];

    // Simulate interleaved session starts and stops
    for (let i = 0; i < 50; i++) {
      const sessionId = `session-${i}`;
      const cb: EventCallback = () => {};
      callbacks.push(cb);
      pm.subscribe(sessionId, cb);

      // Clean up every other session immediately
      if (i % 2 === 0) {
        pm.cleanupSessionState(sessionId);
      }
    }

    // 25 sessions should remain
    expect(pm.getMemoryStats().subscribers).toBe(25);

    // Clean up remaining
    for (let i = 1; i < 50; i += 2) {
      pm.cleanupSessionState(`session-${i}`);
    }

    expect(pm.getMemoryStats().subscribers).toBe(0);
  });
});

function makeMockProcess(alive: boolean = true): SdkProcess {
  let killed = false;
  return {
    pid: 999,
    sendMessage: () => alive && !killed,
    kill: () => {
      killed = true;
    },
    isAlive: () => alive && !killed,
  };
}

describe('pruneOrphans — zombie detection', () => {
  const AGENT_ID = 'agent-1';
  const PROJECT_ID = 'proj-1';

  beforeEach(() => {
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(
      AGENT_ID,
    );
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
  });

  test('prunes dead-in-Map zombie process and resets session to idle', () => {
    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Zombie' });
    db.query(`UPDATE sessions SET status = 'running' WHERE id = ?`).run(session.id);

    const zombie = makeMockProcess(false);
    (pm as any).processes.set(session.id, zombie);

    const pruned = (pm as any).pruneOrphans();
    expect(pruned).toBeGreaterThanOrEqual(1);

    expect((pm as any).processes.has(session.id)).toBe(false);

    const row = db.query('SELECT status FROM sessions WHERE id = ?').get(session.id) as { status: string };
    expect(row.status).toBe('idle');
  });

  test('does not prune alive process still in Map', () => {
    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Alive' });
    db.query(`UPDATE sessions SET status = 'running' WHERE id = ?`).run(session.id);

    const alive = makeMockProcess(true);
    (pm as any).processes.set(session.id, alive);

    (pm as any).pruneOrphans();

    expect((pm as any).processes.has(session.id)).toBe(true);

    const row = db.query('SELECT status FROM sessions WHERE id = ?').get(session.id) as { status: string };
    expect(row.status).toBe('running');
  });

  test('prunes DB-running session with no process in Map', () => {
    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Orphan' });
    db.query(`UPDATE sessions SET status = 'running' WHERE id = ?`).run(session.id);

    const pruned = (pm as any).pruneOrphans();
    expect(pruned).toBeGreaterThanOrEqual(1);

    const row = db.query('SELECT status FROM sessions WHERE id = ?').get(session.id) as { status: string };
    expect(row.status).toBe('idle');
  });
});
