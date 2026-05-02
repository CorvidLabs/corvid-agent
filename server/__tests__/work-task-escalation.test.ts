/**
 * Tests for work task escalation behavior in session-lifecycle.ts.
 *
 * Covers the scenario where validation fails at the max iteration cap:
 * - Task is marked `escalation_needed` (not `failed`)
 * - Owner is notified with actionable instructions
 * - Notification failures are non-fatal
 *
 * Uses context-injected `runValidation` instead of mock.module() to avoid
 * Bun 1.x mock leakage across test files.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

mock.module('../lib/worktree', () => ({
  removeWorktree: mock(async () => ({ success: true })),
  createWorktree: async () => ({ success: true, worktreeDir: '/tmp/mock' }),
  resolveAndCreateWorktree: async () => ({ success: true, workDir: '/tmp/mock' }),
  generateChatBranchName: () => 'branch',
  getWorktreeBaseDir: (d: string) => `${d}/.worktrees`,
}));

import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createWorkTask, getWorkTask, updateWorkTaskStatus } from '../db/work-tasks';
import type { SessionLifecycleContext } from '../work/session-lifecycle';
import { handleSessionEnd } from '../work/session-lifecycle';

let db: Database;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';

const mockRunValidation = async (_dir: string) => ({ passed: false, output: 'tsc: error TS2322' });

function makeCtx(overrides?: Partial<SessionLifecycleContext>): SessionLifecycleContext {
  return {
    db,
    processManager: { startProcess: mock(() => {}), isRunning: mock(() => false) } as never,
    notifyCallbacks: mock(() => {}),
    notifyStatusChange: mock(() => {}),
    subscribeForCompletion: mock(() => {}),
    notifyOwner: null,
    runValidation: mockRunValidation,
    ...overrides,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
  db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
});

afterEach(() => {
  db.close();
});

describe('handleSessionEnd — escalation at iteration cap', () => {
  test('marks task as escalation_needed when validation fails at max iterations', async () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Fix the bug' });
    updateWorkTaskStatus(db, task.id, 'running', {
      iterationCount: 3,
      worktreeDir: '/tmp/fake-worktree',
    });

    await handleSessionEnd(makeCtx(), task.id, 'session output');

    const updated = getWorkTask(db, task.id)!;
    expect(updated.status).toBe('escalation_needed');
    expect(updated.error).toContain('Validation failed after 3');
    expect(updated.error).toContain('tsc: error TS2322');
  });

  test('task is NOT marked failed when escalated at iteration cap', async () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Some work' });
    updateWorkTaskStatus(db, task.id, 'running', { iterationCount: 3, worktreeDir: '/tmp/wt' });

    await handleSessionEnd(makeCtx(), task.id, 'output');

    expect(getWorkTask(db, task.id)!.status).not.toBe('failed');
  });

  test('notifyOwner is called with actionable message containing task ID', async () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'My task' });
    updateWorkTaskStatus(db, task.id, 'running', { iterationCount: 3, worktreeDir: '/tmp/wt' });

    const notifyCalls: Array<{ title: string; message: string; level: string }> = [];
    const notifyOwner = mock(async (params: { agentId: string; title: string; message: string; level: string }) => {
      notifyCalls.push(params);
    });

    await handleSessionEnd(makeCtx({ notifyOwner }), task.id, 'output');

    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0].level).toBe('error');
    expect(notifyCalls[0].message).toContain(task.id);
    expect(notifyCalls[0].message).toContain('corvid_work_task_escalate');
  });

  test('notifyOwner failure is non-fatal — task still marked escalation_needed', async () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'My task' });
    updateWorkTaskStatus(db, task.id, 'running', { iterationCount: 3, worktreeDir: '/tmp/wt' });

    const notifyOwner = mock(async () => {
      throw new Error('Notification service unavailable');
    });

    await expect(handleSessionEnd(makeCtx({ notifyOwner }), task.id, 'output')).resolves.toBeUndefined();

    expect(getWorkTask(db, task.id)!.status).toBe('escalation_needed');
  });

  test('notifyCallbacks is still invoked after escalation', async () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'My task' });
    updateWorkTaskStatus(db, task.id, 'running', { iterationCount: 3, worktreeDir: '/tmp/wt' });

    const notifyCallbacks = mock((_id: string) => {});
    await handleSessionEnd(makeCtx({ notifyCallbacks }), task.id, 'output');

    expect(notifyCallbacks).toHaveBeenCalledWith(task.id);
  });

  test('under the iteration cap spawns a new session (not escalation_needed)', async () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Failing task' });
    updateWorkTaskStatus(db, task.id, 'running', {
      iterationCount: 1,
      worktreeDir: '/tmp/wt',
      branchName: 'agent/test/branch',
    });

    const subscribeForCompletion = mock((_taskId: string, _sessionId: string) => {});
    await handleSessionEnd(makeCtx({ subscribeForCompletion }), task.id, 'output');

    // Should be running (new iteration) not escalation_needed
    const updated = getWorkTask(db, task.id)!;
    expect(updated.status).toBe('running');
    expect(updated.iterationCount).toBe(2);
  });
});
