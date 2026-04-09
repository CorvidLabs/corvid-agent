import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import {
  cleanupStaleWorkTasks,
  countQueuedTasks,
  createWorkTask,
  dequeueNextTask,
  getActiveTaskForProject,
  getActiveWorkTasks,
  getPausedTasks,
  getPendingTasksForProject,
  getWorkTask,
  pauseWorkTask,
  resumePausedTask,
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

// ── Priority field ──────────────────────────────────────────────────

describe('priority field', () => {
  test('defaults to P2 (normal) when not specified', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Default priority task',
    });
    expect(task.priority).toBe(2);
  });

  test('accepts explicit priority values P0-P3 (in-memory)', () => {
    for (const p of [0, 1, 2, 3] as const) {
      const task = createWorkTask(db, {
        agentId: AGENT_ID,
        projectId: PROJECT_ID,
        description: `Priority ${p} task`,
        priority: p,
      });
      // Priority is set in-memory on the returned object
      expect(task.priority).toBe(p);
    }
  });

  test('DB persists priority (survives re-fetch)', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'P0 critical',
      priority: 0,
    });
    expect(task.priority).toBe(0);
    // Priority is now persisted to the DB column
    const fetched = getWorkTask(db, task.id)!;
    expect(fetched.priority).toBe(0);
  });
});

// ── dequeueNextTask ─────────────────────────────────────────────────

describe('dequeueNextTask', () => {
  test('returns null when no pending/queued tasks', () => {
    expect(dequeueNextTask(db, PROJECT_ID)).toBeNull();
  });

  test('returns the only pending task', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Only task',
    });
    const dequeued = dequeueNextTask(db, PROJECT_ID);
    expect(dequeued).not.toBeNull();
    expect(dequeued!.id).toBe(task.id);
  });

  test('uses FIFO ordering (priority ordering is at service layer)', () => {
    const first = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'First task',
    });
    createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Second task',
    });

    const dequeued = dequeueNextTask(db, PROJECT_ID);
    expect(dequeued!.id).toBe(first.id);
  });

  test('includes queued status tasks', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Queued task',
    });
    updateWorkTaskStatus(db, task.id, 'queued');

    const dequeued = dequeueNextTask(db, PROJECT_ID);
    expect(dequeued!.id).toBe(task.id);
  });

  test('ignores running/completed/failed/paused tasks', () => {
    const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Running' });
    const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Completed' });
    const t3 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Failed' });
    const t4 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Paused' });

    updateWorkTaskStatus(db, t1.id, 'running');
    updateWorkTaskStatus(db, t2.id, 'completed');
    updateWorkTaskStatus(db, t3.id, 'failed');
    pauseWorkTask(db, t4.id);

    expect(dequeueNextTask(db, PROJECT_ID)).toBeNull();
  });

  test('scopes to project', () => {
    const proj2 = 'proj-2';
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'Project2', '/tmp/test2')`).run(proj2);

    createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: proj2,
      description: 'Other project task',
    });

    expect(dequeueNextTask(db, PROJECT_ID)).toBeNull();
  });
});

// ── getPendingTasksForProject ───────────────────────────────────────

describe('getPendingTasksForProject', () => {
  test('returns all pending/queued tasks', () => {
    const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'First' });
    const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Second' });
    updateWorkTaskStatus(db, t2.id, 'queued');
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Third' });

    const pending = getPendingTasksForProject(db, PROJECT_ID);
    expect(pending).toHaveLength(3);
    const ids = pending.map((t) => t.id);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
  });

  test('excludes running/completed/paused tasks', () => {
    const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Running' });
    updateWorkTaskStatus(db, t1.id, 'running');
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Pending' });

    const pending = getPendingTasksForProject(db, PROJECT_ID);
    expect(pending).toHaveLength(1);
  });
});

// ── getActiveTaskForProject ─────────────────────────────────────────

describe('getActiveTaskForProject', () => {
  test('returns null when no active task', () => {
    expect(getActiveTaskForProject(db, PROJECT_ID)).toBeNull();
  });

  test('returns running task', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Running task',
    });
    updateWorkTaskStatus(db, task.id, 'running');

    const active = getActiveTaskForProject(db, PROJECT_ID);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(task.id);
  });

  test('returns branching task', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Branching task',
    });
    updateWorkTaskStatus(db, task.id, 'branching');

    expect(getActiveTaskForProject(db, PROJECT_ID)).not.toBeNull();
  });

  test('returns validating task', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Validating task',
    });
    updateWorkTaskStatus(db, task.id, 'validating');

    expect(getActiveTaskForProject(db, PROJECT_ID)).not.toBeNull();
  });

  test('does not return pending/paused/completed/failed tasks', () => {
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Pending' });
    expect(getActiveTaskForProject(db, PROJECT_ID)).toBeNull();
  });
});

// ── Pause/Resume ────────────────────────────────────────────────────

describe('pauseWorkTask', () => {
  test('sets status to paused', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'To be paused',
    });
    updateWorkTaskStatus(db, task.id, 'running');

    pauseWorkTask(db, task.id);

    const paused = getWorkTask(db, task.id)!;
    expect(paused.status).toBe('paused');
  });
});

describe('resumePausedTask', () => {
  test('resumes paused task to pending', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Paused task',
    });
    pauseWorkTask(db, task.id);

    resumePausedTask(db, task.id);

    const resumed = getWorkTask(db, task.id)!;
    expect(resumed.status).toBe('pending');
  });

  test('only resumes paused tasks (no-op for other statuses)', () => {
    const task = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Running task',
    });
    updateWorkTaskStatus(db, task.id, 'running');

    resumePausedTask(db, task.id);

    const still = getWorkTask(db, task.id)!;
    expect(still.status).toBe('running');
  });
});

describe('getPausedTasks', () => {
  test('returns paused tasks for a project', () => {
    const t1 = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Paused 1',
    });
    const t2 = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Paused 2',
    });

    pauseWorkTask(db, t1.id);
    pauseWorkTask(db, t2.id);

    const results = getPausedTasks(db, PROJECT_ID);
    expect(results).toHaveLength(2);
  });

  test('returns empty array when no paused tasks', () => {
    expect(getPausedTasks(db, PROJECT_ID)).toEqual([]);
  });
});

// ── countQueuedTasks ────────────────────────────────────────────────

describe('countQueuedTasks', () => {
  test('counts pending and queued tasks for project', () => {
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Pending 1' });
    const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Queued 1' });
    updateWorkTaskStatus(db, t2.id, 'queued');
    const t3 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Running' });
    updateWorkTaskStatus(db, t3.id, 'running');

    expect(countQueuedTasks(db, PROJECT_ID)).toBe(2);
  });

  test('returns 0 when no queued tasks', () => {
    expect(countQueuedTasks(db, PROJECT_ID)).toBe(0);
  });
});

// ── cleanupStaleWorkTasks with paused tasks ─────────────────────────

describe('cleanupStaleWorkTasks with paused tasks', () => {
  test('resumes paused tasks when stale active tasks are cleaned up', () => {
    const active = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Active task',
    });
    updateWorkTaskStatus(db, active.id, 'running');

    const paused = createWorkTask(db, {
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      description: 'Paused task',
    });
    pauseWorkTask(db, paused.id);

    cleanupStaleWorkTasks(db);

    const resumed = getWorkTask(db, paused.id)!;
    expect(resumed.status).toBe('pending');
  });
});

// ── getActiveWorkTasks includes paused/queued ───────────────────────

describe('getActiveWorkTasks includes new statuses', () => {
  test('includes paused and queued tasks', () => {
    const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Queued' });
    updateWorkTaskStatus(db, t1.id, 'queued');

    const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Paused' });
    pauseWorkTask(db, t2.id);

    const t3 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Running' });
    updateWorkTaskStatus(db, t3.id, 'running');

    const active = getActiveWorkTasks(db);
    expect(active).toHaveLength(3);
  });
});

// ── FIFO queue ordering at DB level ─────────────────────────────────

describe('FIFO queue ordering at DB level', () => {
  test('dequeues in creation order (FIFO)', () => {
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'First' });
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Second' });
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Third' });
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Fourth' });
    createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Fifth' });

    // Dequeue one by one (simulating processing)
    const order: string[] = [];

    let next = dequeueNextTask(db, PROJECT_ID);
    while (next) {
      order.push(next.description);
      updateWorkTaskStatus(db, next.id, 'completed');
      next = dequeueNextTask(db, PROJECT_ID);
    }

    expect(order).toEqual(['First', 'Second', 'Third', 'Fourth', 'Fifth']);
  });
});
