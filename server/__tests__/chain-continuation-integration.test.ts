/**
 * Integration tests for multi-tool chain continuation (GitHub issue #1018).
 *
 * Verifies:
 *   1. A work task whose session fires enough stall events triggers escalation.
 *   2. The escalated task uses a higher ModelTier (Sonnet instead of Haiku).
 *   3. A session that calls tools normally is NOT escalated.
 *   4. A session already at OPUS is not escalated (graceful no-op).
 *   5. The storeTierOverride / resolveModelForTask path applies correctly.
 *
 * Strategy: stub ProcessManager to control event flow without spawning real
 * processes. Drive events via the subscribe callbacks captured from mock calls.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { Session } from '../../shared/types';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import { getWorkTask } from '../db/work-tasks';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { ModelTier } from '../work/chain-continuation';
import { WorkTaskService } from '../work/service';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventCallback = (sessionId: string, event: ClaudeStreamEvent) => void;

// ─── Mock factory ─────────────────────────────────────────────────────────────

/**
 * Creates a ProcessManager stub that:
 *  - Captures subscribe() callbacks so tests can drive events
 *  - Reads the agent's model directly from the DB at startProcess() call time,
 *    capturing any temporary model override applied by WorkTaskService before
 *    the call (the DB temp-patch pattern used to avoid touching Layer 0 paths).
 */
function createMockProcessManager(db: Database) {
  const subscribers = new Map<string, EventCallback[]>();
  const processStartCalls: Array<{
    sessionId: string;
    resolvedAgentModel?: string;
  }> = [];

  const pm = {
    startProcess: mock((session: Session, _prompt?: string) => {
      // Capture the agent model at this exact moment — WorkTaskService temporarily
      // patches the DB with the tier-overridden model before calling startProcess.
      const row = session.agentId
        ? (db.query('SELECT model FROM agents WHERE id = ?').get(session.agentId) as { model: string } | null)
        : null;
      processStartCalls.push({ sessionId: session.id, resolvedAgentModel: row?.model });
    }),
    stopProcess: mock((_sessionId: string) => {
      // Mark process as not running
    }),
    isRunning: mock((_sessionId: string) => false),
    subscribe: mock((sessionId: string, cb: EventCallback) => {
      if (!subscribers.has(sessionId)) subscribers.set(sessionId, []);
      subscribers.get(sessionId)!.push(cb);
    }),
    unsubscribe: mock((sessionId: string, cb: EventCallback) => {
      const list = subscribers.get(sessionId);
      if (list) {
        const idx = list.indexOf(cb);
        if (idx !== -1) list.splice(idx, 1);
      }
    }),
    subscribeAll: mock(() => {}),
    unsubscribeAll: mock(() => {}),
    getMemoryStats: mock(() => ({
      processes: 0,
      warmProcesses: 0,
      subscribers: 0,
      sessionMeta: 0,
      pausedSessions: 0,
      sessionTimeouts: 0,
      stableTimers: 0,
      keepAliveTimers: 0,
      globalSubscribers: 0,
    })),
    cleanupSessionState: mock(() => {}),
    shutdown: mock(() => {}),

    // Test helpers
    _emit(sessionId: string, event: ClaudeStreamEvent): void {
      const list = subscribers.get(sessionId) ?? [];
      for (const cb of [...list]) {
        cb(sessionId, event);
      }
    },
    _processStartCalls: processStartCalls,
  };

  return pm as unknown as ProcessManager & {
    _emit: (sessionId: string, event: ClaudeStreamEvent) => void;
    _processStartCalls: Array<{ sessionId: string; resolvedAgentModel?: string }>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupDb() {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

/** Emit N consecutive stalled turns (message_stop without tool_use). */
function emitStalledTurns(pm: ReturnType<typeof createMockProcessManager>, sessionId: string, n: number): void {
  for (let i = 0; i < n; i++) {
    pm._emit(sessionId, { type: 'message_stop' } as ClaudeStreamEvent);
  }
}

/** Emit a productive turn (tool_use + message_stop). */
function emitProductiveTurn(pm: ReturnType<typeof createMockProcessManager>, sessionId: string): void {
  pm._emit(sessionId, {
    type: 'content_block_start',
    content_block: { type: 'tool_use' },
  } as unknown as ClaudeStreamEvent);
  pm._emit(sessionId, { type: 'message_stop' } as ClaudeStreamEvent);
}

/** Get the session ID that was most recently started for a task. */
function getSessionIdForTask(db: Database, taskId: string): string | null {
  return getWorkTask(db, taskId)?.sessionId ?? null;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

let db: Database;
let pm: ReturnType<typeof createMockProcessManager>;
let service: WorkTaskService;

let haikuAgent: { id: string; model: string; name: string };
let opusAgent: { id: string; model: string; name: string };
let project: { id: string; workingDir: string };

beforeEach(() => {
  db = setupDb();

  // Stub Bun.spawn so worktree creation (git worktree add) doesn't fail
  spyOn(Bun, 'spawn').mockImplementation(
    () =>
      ({
        stdout: new Blob(['']).stream(),
        stderr: new Blob(['']).stream(),
        exited: Promise.resolve(0),
        pid: 99999,
        kill: () => {},
      }) as ReturnType<typeof Bun.spawn>,
  );

  haikuAgent = createAgent(db, {
    name: 'HaikuAgent',
    model: 'claude-haiku-4-5-20251001',
  });

  opusAgent = createAgent(db, {
    name: 'OpusAgent',
    model: 'claude-opus-4-6',
  });

  project = createProject(db, {
    name: 'TestProject',
    workingDir: '/tmp/chain-test',
  });

  pm = createMockProcessManager(db);
  service = new WorkTaskService(db, pm as unknown as ProcessManager);
});

afterEach(() => {
  db.close();
  mock.restore();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('chain continuation: stall detection', () => {
  test('task with N stalled turns triggers escalation to next tier', async () => {
    // Create a Haiku work task
    const taskPromise = service.create({
      agentId: haikuAgent.id,
      projectId: project.id,
      description: 'Implement feature X',
      source: 'web',
    });

    // executeTask is async (worktree creation) — wait for it
    await new Promise((r) => setTimeout(r, 10));

    const task = await taskPromise;
    const sessionId = getSessionIdForTask(db, task.id);
    expect(sessionId).not.toBeNull();

    // Feed 5 stalled turns (default CHAIN_CONTINUATION_THRESHOLD)
    // Each message_stop without preceding tool_use is a stalled step
    emitStalledTurns(pm, sessionId!, 5);

    // Escalation is async (fire-and-forget) — wait for it to settle
    await new Promise((r) => setTimeout(r, 50));

    // The original task should be failed (slot released)
    const failed = getWorkTask(db, task.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('Auto-escalated');
    expect(failed?.error).toContain('haiku');
    expect(failed?.error).toContain('sonnet');

    // A new task should have been created for the escalated tier
    const allTasks = db
      .query('SELECT id, description, status FROM work_tasks ORDER BY created_at DESC')
      .all() as Array<{
      id: string;
      description: string;
      status: string;
    }>;
    const escalated = allTasks.find((t) => t.id !== task.id);
    expect(escalated).toBeDefined();
    expect(escalated!.description).toContain('Auto-escalated');
    expect(escalated!.description).toContain('Implement feature X');
  });

  test('session with tool calls does NOT escalate', async () => {
    const taskPromise = service.create({
      agentId: haikuAgent.id,
      projectId: project.id,
      description: 'Run git status',
      source: 'web',
    });
    await new Promise((r) => setTimeout(r, 10));
    const task = await taskPromise;
    const sessionId = getSessionIdForTask(db, task.id);
    expect(sessionId).not.toBeNull();

    // All productive turns — no stalls
    for (let i = 0; i < 10; i++) {
      emitProductiveTurn(pm, sessionId!);
    }

    // Session ends normally
    pm._emit(sessionId!, { type: 'result', total_cost_usd: 0.001 } as ClaudeStreamEvent);

    await new Promise((r) => setTimeout(r, 50));

    // Task status driven by handleSessionEnd (validating/completed/failed by finalize)
    // — but critically, no escalation error should be set
    const updatedTask = getWorkTask(db, task.id);
    expect(updatedTask?.error ?? '').not.toContain('Auto-escalated');
  });

  test('opus-tier session does not escalate (already at max)', async () => {
    const taskPromise = service.create({
      agentId: opusAgent.id,
      projectId: project.id,
      description: 'High-complexity task',
      source: 'web',
    });
    await new Promise((r) => setTimeout(r, 10));
    const task = await taskPromise;
    const sessionId = getSessionIdForTask(db, task.id);
    expect(sessionId).not.toBeNull();

    emitStalledTurns(pm, sessionId!, 5);
    await new Promise((r) => setTimeout(r, 50));

    // Task should still be running (or whatever state), NOT failed due to escalation
    const updatedTask = getWorkTask(db, task.id);
    // The task should not have been failed with an escalation error
    expect(updatedTask?.error ?? '').not.toContain('Auto-escalated');

    // No new escalated task should have been created
    const allTasks = db.query('SELECT id FROM work_tasks').all() as Array<{ id: string }>;
    expect(allTasks.length).toBe(1);
  });
});

describe('chain continuation: tier override', () => {
  test('task with modelTier=sonnet resolves agent model to sonnet at startProcess call time', async () => {
    const taskPromise = service.create({
      agentId: haikuAgent.id,
      projectId: project.id,
      description: 'Task with explicit tier',
      source: 'web',
      modelTier: ModelTier.SONNET,
    });
    await new Promise((r) => setTimeout(r, 10));
    await taskPromise;

    // The mock captures the agent model from the DB at the moment startProcess is called.
    // WorkTaskService temporarily patches the DB to the tier-overridden model, so the
    // resolved model should be claude-sonnet-4-6 even though the agent's default is haiku.
    const calls = pm._processStartCalls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.resolvedAgentModel).toBe('claude-sonnet-4-6');
  });

  test('task with modelTier=opus resolves agent model to opus at startProcess call time', async () => {
    const taskPromise = service.create({
      agentId: haikuAgent.id,
      projectId: project.id,
      description: 'Opus tier task',
      source: 'web',
      modelTier: ModelTier.OPUS,
    });
    await new Promise((r) => setTimeout(r, 10));
    await taskPromise;

    const calls = pm._processStartCalls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.resolvedAgentModel).toBe('claude-opus-4-6');
  });

  test('task with no modelTier uses agent default model (no override)', async () => {
    const taskPromise = service.create({
      agentId: haikuAgent.id,
      projectId: project.id,
      description: 'Default tier task',
      source: 'web',
    });
    await new Promise((r) => setTimeout(r, 10));
    await taskPromise;

    const calls = pm._processStartCalls;
    const lastCall = calls[calls.length - 1];
    // No tier override — agent model should remain haiku
    expect(lastCall?.resolvedAgentModel).toBe('claude-haiku-4-5-20251001');
  });

  test('invalid modelTier string is silently ignored', async () => {
    const taskPromise = service.create({
      agentId: haikuAgent.id,
      projectId: project.id,
      description: 'Invalid tier task',
      source: 'web',
      modelTier: 'invalid-tier',
    });
    await new Promise((r) => setTimeout(r, 10));
    await taskPromise;

    const calls = pm._processStartCalls;
    const lastCall = calls[calls.length - 1];
    // Invalid tier is silently ignored — agent model should remain haiku
    expect(lastCall?.resolvedAgentModel).toBe('claude-haiku-4-5-20251001');
  });
});

describe('chain continuation: stall reset', () => {
  test('productive turn mid-chain resets stall counter, preventing premature escalation', async () => {
    const taskPromise = service.create({
      agentId: haikuAgent.id,
      projectId: project.id,
      description: 'Mixed-productivity chain',
      source: 'web',
    });
    await new Promise((r) => setTimeout(r, 10));
    const task = await taskPromise;
    const sessionId = getSessionIdForTask(db, task.id);
    expect(sessionId).not.toBeNull();

    // 4 stalled (just under default threshold of 5)
    emitStalledTurns(pm, sessionId!, 4);
    // Productive turn resets counter
    emitProductiveTurn(pm, sessionId!);
    // 4 more stalled (counter reset, so total is 4, still under threshold)
    emitStalledTurns(pm, sessionId!, 4);

    await new Promise((r) => setTimeout(r, 50));

    // No escalation should have occurred
    const updatedTask = getWorkTask(db, task.id);
    expect(updatedTask?.error ?? '').not.toContain('Auto-escalated');
    // No extra tasks
    const count = (db.query('SELECT COUNT(*) as c FROM work_tasks').get() as { c: number }).c;
    expect(count).toBe(1);
  });
});
