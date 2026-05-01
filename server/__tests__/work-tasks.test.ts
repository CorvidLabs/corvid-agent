import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import {
  cleanupStaleWorkTasks,
  clearWorktreeDir,
  createWorkTask,
  createWorkTaskAtomic,
  getTerminalTasksWithWorktrees,
  getWorkTask,
  getWorkTaskBySessionId,
  listWorkTasks,
  resetWorkTaskForRetry,
  updateWorkTaskStatus,
} from '../db/work-tasks';

let db: Database;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';

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

// ── createWorkTask ───────────────────────────────────────────────────

describe('createWorkTask', () => {
  test('creates a work task with defaults', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Fix bug #123',
    });
    expect(task.id).toBeTruthy();
    expect(task.agentId).toBe(AGENT_ID);
    expect(task.projectId).toBe(PROJECT_ID);
    expect(task.description).toBe('Fix bug #123');
    expect(task.source).toBe('web');
    expect(task.sourceId).toBeNull();
    expect(task.requesterInfo).toEqual({});
    expect(task.status).toBe('pending');
    expect(task.branchName).toBeNull();
    expect(task.prUrl).toBeNull();
    expect(task.summary).toBeNull();
    expect(task.error).toBeNull();
    expect(task.iterationCount).toBe(0);
    expect(task.completedAt).toBeNull();
  });

  test('creates with custom source and requesterInfo', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Improve tests',
      source: 'agent',
      sourceId: 'issue-456',
      requesterInfo: { user: 'corvid', repo: 'org/repo' },
    });
    expect(task.source).toBe('agent');
    expect(task.sourceId).toBe('issue-456');
    expect(task.requesterInfo).toEqual({ user: 'corvid', repo: 'org/repo' });
  });
});

// ── createWorkTaskAtomic ─────────────────────────────────────────────

describe('createWorkTaskAtomic', () => {
  test('creates task when no active tasks exist', () => {
    const task = createWorkTaskAtomic(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'First task',
    });
    expect(task).not.toBeNull();
    expect(task!.description).toBe('First task');
  });

  test('returns null when active task exists on same project', () => {
    const first = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Active task',
    });
    updateWorkTaskStatus(db, first.id, 'running');

    const second = createWorkTaskAtomic(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Second task',
    });
    expect(second).toBeNull();
  });

  test('allows creation when existing tasks are completed/failed', () => {
    const first = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Done task',
    });
    updateWorkTaskStatus(db, first.id, 'completed');

    const second = createWorkTaskAtomic(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'New task',
    });
    expect(second).not.toBeNull();
  });

  test('blocks on branching status', () => {
    const first = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Branching task',
    });
    updateWorkTaskStatus(db, first.id, 'branching');

    const second = createWorkTaskAtomic(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Blocked task',
    });
    expect(second).toBeNull();
  });

  test('blocks on validating status', () => {
    const first = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Validating task',
    });
    updateWorkTaskStatus(db, first.id, 'validating');

    expect(
      createWorkTaskAtomic(db, {
        agentId: AGENT_ID,
        projectId: PROJECT_ID,
        description: 'Blocked',
      }),
    ).toBeNull();
  });
});

// ── Get/List ─────────────────────────────────────────────────────────

describe('get and list', () => {
  test('getWorkTask returns by id', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Test',
    });
    const fetched = getWorkTask(db, task.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(task.id);
  });

  test('getWorkTask returns null for unknown id', () => {
    expect(getWorkTask(db, 'nonexistent')).toBeNull();
  });

  test('getWorkTaskBySessionId returns task', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Test',
    });
    updateWorkTaskStatus(db, task.id, 'running', { sessionId: 'sess-42' });

    const fetched = getWorkTaskBySessionId(db, 'sess-42');
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(task.id);
  });

  test('getWorkTaskBySessionId returns null for unknown session', () => {
    expect(getWorkTaskBySessionId(db, 'unknown')).toBeNull();
  });

  test('listWorkTasks returns all tasks', () => {
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Task 1' });
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Task 2' });
    expect(listWorkTasks(db)).toHaveLength(2);
  });

  test('listWorkTasks filters by agentId', () => {
    const agent2 = 'agent-2';
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'A2', 'test', 'test')`).run(agent2);

    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Task 1' });
    createWorkTask(db, { agentId: agent2, projectId: PROJECT_ID, description: 'Task 2' });

    expect(listWorkTasks(db, AGENT_ID)).toHaveLength(1);
  });
});

// ── updateWorkTaskStatus ─────────────────────────────────────────────

describe('updateWorkTaskStatus', () => {
  test('updates status with extra fields', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Test',
    });
    updateWorkTaskStatus(db, task.id, 'running', {
      sessionId: 'sess-1',
      branchName: 'fix/bug-123',
      originalBranch: 'main',
      worktreeDir: '/tmp/worktree',
    });

    const updated = getWorkTask(db, task.id)!;
    expect(updated.status).toBe('running');
    expect(updated.sessionId).toBe('sess-1');
    expect(updated.branchName).toBe('fix/bug-123');
    expect(updated.originalBranch).toBe('main');
    expect(updated.worktreeDir).toBe('/tmp/worktree');
  });

  test('sets completedAt when status is completed', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Test',
    });
    updateWorkTaskStatus(db, task.id, 'completed', {
      prUrl: 'https://github.com/org/repo/pull/42',
      summary: 'Fixed the bug',
    });

    const updated = getWorkTask(db, task.id)!;
    expect(updated.status).toBe('completed');
    expect(updated.completedAt).toBeTruthy();
    expect(updated.prUrl).toBe('https://github.com/org/repo/pull/42');
    expect(updated.summary).toBe('Fixed the bug');
  });

  test('sets completedAt when status is failed', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Test',
    });
    updateWorkTaskStatus(db, task.id, 'failed', {
      error: 'tsc found 3 errors',
      iterationCount: 3,
    });

    const updated = getWorkTask(db, task.id)!;
    expect(updated.status).toBe('failed');
    expect(updated.completedAt).toBeTruthy();
    expect(updated.error).toBe('tsc found 3 errors');
    expect(updated.iterationCount).toBe(3);
  });

  test('does not set completedAt for non-terminal statuses', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Test',
    });
    updateWorkTaskStatus(db, task.id, 'running');

    const updated = getWorkTask(db, task.id)!;
    expect(updated.completedAt).toBeNull();
  });
});

// ── cleanupStaleWorkTasks ────────────────────────────────────────────

describe('cleanupStaleWorkTasks', () => {
  test('marks active tasks as failed with restart message', () => {
    const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Running' });
    const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Branching' });
    updateWorkTaskStatus(db, t1.id, 'running');
    updateWorkTaskStatus(db, t2.id, 'branching');

    const stale = cleanupStaleWorkTasks(db);
    expect(stale).toHaveLength(2);

    const updated1 = getWorkTask(db, t1.id)!;
    expect(updated1.status).toBe('failed');
    expect(updated1.error).toBe('Interrupted by server restart');
    expect(updated1.completedAt).toBeTruthy();
  });

  test('does not affect completed/failed/pending tasks', () => {
    const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Completed' });
    const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Pending' });
    updateWorkTaskStatus(db, t1.id, 'completed');

    const stale = cleanupStaleWorkTasks(db);
    expect(stale).toHaveLength(0);

    expect(getWorkTask(db, t1.id)!.status).toBe('completed');
    expect(getWorkTask(db, t2.id)!.status).toBe('pending');
  });

  test('returns empty array when no stale tasks', () => {
    expect(cleanupStaleWorkTasks(db)).toEqual([]);
  });
});

// ── getTerminalTasksWithWorktrees ───────────────────────────────────

describe('getTerminalTasksWithWorktrees', () => {
  test('returns completed/failed tasks that still have a worktree_dir', () => {
    const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Completed with worktree' });
    const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Failed with worktree' });
    const t3 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Running with worktree' });
    const t4 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Completed no worktree' });

    updateWorkTaskStatus(db, t1.id, 'completed', { worktreeDir: '/tmp/wt1' });
    updateWorkTaskStatus(db, t2.id, 'failed', { worktreeDir: '/tmp/wt2', error: 'boom' });
    updateWorkTaskStatus(db, t3.id, 'running', { worktreeDir: '/tmp/wt3' });
    updateWorkTaskStatus(db, t4.id, 'completed');

    const stale = getTerminalTasksWithWorktrees(db);
    expect(stale).toHaveLength(2);
    const ids = stale.map((t) => t.id).sort();
    expect(ids).toEqual([t1.id, t2.id].sort());
  });

  test('returns empty array when no terminal tasks have worktrees', () => {
    const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Completed clean' });
    updateWorkTaskStatus(db, t1.id, 'completed');
    expect(getTerminalTasksWithWorktrees(db)).toEqual([]);
  });

  test('returns empty array when no tasks exist', () => {
    expect(getTerminalTasksWithWorktrees(db)).toEqual([]);
  });
});

// ── clearWorktreeDir ───────────────────────────────────────────────

describe('clearWorktreeDir', () => {
  test('clears worktree_dir for a task', () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Has worktree' });
    updateWorkTaskStatus(db, task.id, 'completed', { worktreeDir: '/tmp/wt' });

    const before = getWorkTask(db, task.id)!;
    expect(before.worktreeDir).toBe('/tmp/wt');

    clearWorktreeDir(db, task.id);

    const after = getWorkTask(db, task.id)!;
    expect(after.worktreeDir).toBeNull();
  });

  test('is idempotent — clearing an already-null worktree_dir is fine', () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'No worktree' });
    clearWorktreeDir(db, task.id);
    expect(getWorkTask(db, task.id)!.worktreeDir).toBeNull();
  });
});

describe('resetWorkTaskForRetry', () => {
  test('resets a failed task back to pending with cleared transient fields', () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Test retry' });
    updateWorkTaskStatus(db, task.id, 'running', {
      sessionId: 'sess-1',
      branchName: 'agent/test/branch',
      worktreeDir: '/tmp/worktree',
      iterationCount: 2,
    });
    updateWorkTaskStatus(db, task.id, 'failed', { error: 'Interrupted by server restart' });

    resetWorkTaskForRetry(db, task.id);

    const reset = getWorkTask(db, task.id)!;
    expect(reset.status).toBe('pending');
    expect(reset.sessionId).toBeNull();
    expect(reset.branchName).toBeNull();
    expect(reset.worktreeDir).toBeNull();
    expect(reset.error).toBeNull();
    expect(reset.completedAt).toBeNull();
    expect(reset.iterationCount).toBe(0);
  });

  test('preserves original task metadata', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Important work',
      source: 'algochat',
      sourceId: 'msg-123',
    });
    updateWorkTaskStatus(db, task.id, 'failed', { error: 'Interrupted by server restart' });

    resetWorkTaskForRetry(db, task.id);

    const reset = getWorkTask(db, task.id)!;
    expect(reset.description).toBe('Important work');
    expect(reset.source).toBe('algochat');
    expect(reset.sourceId).toBe('msg-123');
    expect(reset.agentId).toBe(AGENT_ID);
    expect(reset.projectId).toBe(PROJECT_ID);
  });
});

// ── escalation_needed status ──────────────────────────────────────────

describe('escalation_needed status', () => {
  test('updateWorkTaskStatus can set escalation_needed with error and summary', () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Failing task' });
    updateWorkTaskStatus(db, task.id, 'running', { iterationCount: 3 });
    updateWorkTaskStatus(db, task.id, 'escalation_needed', {
      error: 'Validation failed after 3 iteration(s):\ntsc error',
      summary: 'Agent tried but failed',
    });

    const updated = getWorkTask(db, task.id)!;
    expect(updated.status).toBe('escalation_needed');
    expect(updated.error).toContain('Validation failed after 3');
    expect(updated.summary).toBe('Agent tried but failed');
    expect(updated.iterationCount).toBe(3);
    expect(updated.completedAt).toBeNull();
  });

  test('cleanupStaleWorkTasks does not affect escalation_needed tasks', () => {
    const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Running task' });
    const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Escalated task' });
    updateWorkTaskStatus(db, t1.id, 'running');
    updateWorkTaskStatus(db, t2.id, 'escalation_needed', { error: 'Needs owner attention' });

    const stale = cleanupStaleWorkTasks(db);
    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe(t1.id);

    expect(getWorkTask(db, t1.id)!.status).toBe('failed');
    expect(getWorkTask(db, t2.id)!.status).toBe('escalation_needed');
  });

  test('resetWorkTaskForRetry resets escalation_needed task to pending', () => {
    const task = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Escalated task' });
    updateWorkTaskStatus(db, task.id, 'escalation_needed', {
      error: 'Validation failed after 3 iteration(s)',
      iterationCount: 3,
    });

    resetWorkTaskForRetry(db, task.id);

    const reset = getWorkTask(db, task.id)!;
    expect(reset.status).toBe('pending');
    expect(reset.error).toBeNull();
    expect(reset.iterationCount).toBe(0);
    expect(reset.completedAt).toBeNull();
  });

  test('listWorkTasks includes escalation_needed tasks', () => {
    const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Escalated' });
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Pending' });
    updateWorkTaskStatus(db, t1.id, 'escalation_needed', { error: 'Needs owner review' });

    const all = listWorkTasks(db);
    expect(all).toHaveLength(2);
    const statuses = all.map((t) => t.status).sort();
    expect(statuses).toContain('escalation_needed');
    expect(statuses).toContain('pending');
  });
});
