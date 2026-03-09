import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    createWorkTask,
    getWorkTask,
    updateWorkTaskStatus,
    dequeueNextTask,
    getActiveTaskForProject,
    pauseWorkTask,
    resumePausedTask,
    getTasksPausedBy,
    countQueuedTasks,
    cleanupStaleWorkTasks,
    getActiveWorkTasks,
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

    test('accepts explicit priority values P0-P3', () => {
        for (const p of [0, 1, 2, 3] as const) {
            const task = createWorkTask(db, {
                agentId: AGENT_ID,
                projectId: PROJECT_ID,
                description: `Priority ${p} task`,
                priority: p,
            });
            expect(task.priority).toBe(p);
        }
    });

    test('persists priority through get', () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'P0 critical',
            priority: 0,
        });
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

    test('returns highest priority (lowest number) first', () => {
        createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Low priority',
            priority: 3,
        });
        const high = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'High priority',
            priority: 0,
        });
        createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Normal priority',
            priority: 2,
        });

        const dequeued = dequeueNextTask(db, PROJECT_ID);
        expect(dequeued!.id).toBe(high.id);
        expect(dequeued!.priority).toBe(0);
    });

    test('uses FIFO ordering for same priority', () => {
        const first = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'First P2',
            priority: 2,
        });
        createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Second P2',
            priority: 2,
        });

        const dequeued = dequeueNextTask(db, PROJECT_ID);
        expect(dequeued!.id).toBe(first.id);
    });

    test('includes queued status tasks', () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Queued task',
            priority: 1,
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
        pauseWorkTask(db, t4.id, 'some-task');

        expect(dequeueNextTask(db, PROJECT_ID)).toBeNull();
    });

    test('scopes to project', () => {
        const proj2 = 'proj-2';
        db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'Project2', '/tmp/test2')`).run(proj2);

        createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: proj2,
            description: 'Other project task',
            priority: 0,
        });

        expect(dequeueNextTask(db, PROJECT_ID)).toBeNull();
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
    test('sets status to paused and records preemptedBy', () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'To be paused',
        });
        updateWorkTaskStatus(db, task.id, 'running');

        pauseWorkTask(db, task.id, 'preempting-task-id');

        const paused = getWorkTask(db, task.id)!;
        expect(paused.status).toBe('paused');
        expect(paused.preemptedBy).toBe('preempting-task-id');
    });
});

describe('resumePausedTask', () => {
    test('resumes paused task to pending and clears preemptedBy', () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Paused task',
        });
        pauseWorkTask(db, task.id, 'other-task');

        resumePausedTask(db, task.id);

        const resumed = getWorkTask(db, task.id)!;
        expect(resumed.status).toBe('pending');
        expect(resumed.preemptedBy).toBeNull();
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

describe('getTasksPausedBy', () => {
    test('returns tasks paused by a specific task', () => {
        const preempting = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Preempting task',
            priority: 0,
        });
        const paused1 = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Paused 1',
            priority: 2,
        });
        const paused2 = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Paused 2',
            priority: 3,
        });

        pauseWorkTask(db, paused1.id, preempting.id);
        pauseWorkTask(db, paused2.id, preempting.id);

        const results = getTasksPausedBy(db, preempting.id);
        expect(results).toHaveLength(2);
        // Ordered by priority ASC
        expect(results[0].priority).toBe(2);
        expect(results[1].priority).toBe(3);
    });

    test('returns empty array when no tasks paused by given id', () => {
        expect(getTasksPausedBy(db, 'nonexistent')).toEqual([]);
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

// ── cleanupStaleWorkTasks with priority ─────────────────────────────

describe('cleanupStaleWorkTasks with priority', () => {
    test('resumes paused tasks when stale active tasks are cleaned up', () => {
        const active = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Active task',
            priority: 0,
        });
        updateWorkTaskStatus(db, active.id, 'running');

        const paused = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Paused task',
            priority: 2,
        });
        pauseWorkTask(db, paused.id, active.id);

        cleanupStaleWorkTasks(db);

        const resumed = getWorkTask(db, paused.id)!;
        expect(resumed.status).toBe('pending');
        expect(resumed.preemptedBy).toBeNull();
    });
});

// ── getActiveWorkTasks includes paused/queued ───────────────────────

describe('getActiveWorkTasks includes new statuses', () => {
    test('includes paused and queued tasks', () => {
        const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Queued' });
        updateWorkTaskStatus(db, t1.id, 'queued');

        const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Paused' });
        pauseWorkTask(db, t2.id, 'some-task');

        const t3 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'Running' });
        updateWorkTaskStatus(db, t3.id, 'running');

        const active = getActiveWorkTasks(db);
        expect(active).toHaveLength(3);
    });
});

// ── Priority queue ordering integration ─────────────────────────────

describe('priority queue ordering', () => {
    test('dequeues in priority order then FIFO', () => {
        // Create tasks in mixed order
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'P3 low', priority: 3 });
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'P1 first', priority: 1 });
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'P0 critical', priority: 0 });
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'P1 second', priority: 1 });
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID, description: 'P2 normal', priority: 2 });

        // Dequeue one by one (simulating processing)
        const order: string[] = [];

        let next = dequeueNextTask(db, PROJECT_ID);
        while (next) {
            order.push(next.description);
            updateWorkTaskStatus(db, next.id, 'completed');
            next = dequeueNextTask(db, PROJECT_ID);
        }

        expect(order).toEqual([
            'P0 critical',
            'P1 first',
            'P1 second',
            'P2 normal',
            'P3 low',
        ]);
    });
});
