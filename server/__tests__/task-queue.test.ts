import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { migrateUp } from '../db/migrate';
import {
    createWorkTask,
    updateWorkTaskStatus,
    countActiveTasks,
    countPendingTasks,
    dispatchCandidates,
    getActiveTasksByProject,
} from '../db/work-tasks';
import { TaskQueueService } from '../work/queue';
import type { WorkTaskService } from '../work/service';

let db: Database;
const AGENT_ID = 'agent-1';
const PROJECT_A = 'proj-a';
const PROJECT_B = 'proj-b';

function seedTestData() {
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'ProjectA', '/tmp/a')`).run(PROJECT_A);
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'ProjectB', '/tmp/b')`).run(PROJECT_B);
}

beforeEach(async () => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    await migrateUp(db); // Apply file-based migrations (including 081_task_queue)
    seedTestData();
});

afterEach(() => {
    db.close();
});

// ── DB query functions ───────────────────────────────────────────────

describe('countActiveTasks', () => {
    test('returns 0 when no tasks exist', () => {
        expect(countActiveTasks(db)).toBe(0);
    });

    test('counts branching, running, and validating tasks', () => {
        const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'task 1' });
        const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_B, description: 'task 2' });
        const t3 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'task 3' });

        updateWorkTaskStatus(db, t1.id, 'branching');
        updateWorkTaskStatus(db, t2.id, 'running');
        // t3 stays pending

        expect(countActiveTasks(db)).toBe(2);

        updateWorkTaskStatus(db, t3.id, 'validating');
        expect(countActiveTasks(db)).toBe(3);
    });

    test('does not count pending, completed, or failed tasks', () => {
        const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'done' });
        const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_B, description: 'failed' });

        updateWorkTaskStatus(db, t1.id, 'completed');
        updateWorkTaskStatus(db, t2.id, 'failed');

        expect(countActiveTasks(db)).toBe(0);
    });
});

describe('countPendingTasks', () => {
    test('counts only pending tasks', () => {
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'pending 1' });
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_B, description: 'pending 2' });
        const t3 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'active' });
        updateWorkTaskStatus(db, t3.id, 'running');

        expect(countPendingTasks(db)).toBe(2);
    });
});

describe('dispatchCandidates', () => {
    test('returns pending tasks for projects without active tasks', () => {
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'pending A' });
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_B, description: 'pending B' });

        const candidates = dispatchCandidates(db, 10);
        expect(candidates.length).toBe(2);
    });

    test('excludes tasks for projects with active tasks', () => {
        const activeTask = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'active' });
        updateWorkTaskStatus(db, activeTask.id, 'running');

        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'queued for A' });
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_B, description: 'free for B' });

        const candidates = dispatchCandidates(db, 10);
        expect(candidates.length).toBe(1);
        expect(candidates[0].projectId).toBe(PROJECT_B);
    });

    test('respects limit parameter', () => {
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'a' });
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_B, description: 'b' });

        const candidates = dispatchCandidates(db, 1);
        expect(candidates.length).toBe(1);
    });

    test('orders by priority DESC then created_at ASC', () => {
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'low priority', priority: 1 });
        const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_B, description: 'high priority', priority: 3 });

        const candidates = dispatchCandidates(db, 10);
        expect(candidates[0].id).toBe(t2.id); // higher priority first
    });
});

describe('getActiveTasksByProject', () => {
    test('returns empty object when no active tasks', () => {
        expect(getActiveTasksByProject(db)).toEqual({});
    });

    test('maps projectId to taskId for active tasks', () => {
        const t1 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'a' });
        const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_B, description: 'b' });
        updateWorkTaskStatus(db, t1.id, 'running');
        updateWorkTaskStatus(db, t2.id, 'branching');

        const active = getActiveTasksByProject(db);
        expect(active[PROJECT_A]).toBe(t1.id);
        expect(active[PROJECT_B]).toBe(t2.id);
    });
});

// ── TaskQueueService ─────────────────────────────────────────────────

describe('TaskQueueService', () => {
    function createMockWorkTaskService(): WorkTaskService {
        return {
            create: mock(async (input: Record<string, unknown>) => {
                return createWorkTask(db, {
                    agentId: String(input.agentId),
                    projectId: String(input.projectId ?? PROJECT_A),
                    description: String(input.description),
                });
            }),
            shuttingDown: false,
            drainRunningTasks: mock(async () => {}),
            executeTask: mock(async () => ({})),
        } as unknown as WorkTaskService;
    }

    test('starts and stops cleanly', async () => {
        const wts = createMockWorkTaskService();
        const queue = new TaskQueueService(db, wts, { pollIntervalMs: 50 });

        expect(queue.running).toBe(false);
        queue.start();
        expect(queue.running).toBe(true);

        await queue.stop();
        expect(queue.running).toBe(false);
    });

    test('getQueueStatus returns current state', () => {
        const wts = createMockWorkTaskService();
        const queue = new TaskQueueService(db, wts);

        const status = queue.getQueueStatus();
        expect(status.activeCount).toBe(0);
        expect(status.pendingCount).toBe(0);
        expect(status.maxConcurrency).toBe(2);
        expect(status.activeByProject).toEqual({});
    });

    test('enqueue delegates to workTaskService.create', async () => {
        const wts = createMockWorkTaskService();
        const queue = new TaskQueueService(db, wts);

        const task = await queue.enqueue({
            agentId: AGENT_ID,
            description: 'test task',
            projectId: PROJECT_A,
        });

        expect(task).toBeDefined();
        expect(task.description).toBe('test task');
        expect(wts.create).toHaveBeenCalledTimes(1);
    });

    test('activeCount and pendingCount reflect DB state', () => {
        const wts = createMockWorkTaskService();
        const queue = new TaskQueueService(db, wts);

        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_A, description: 'pending' });
        expect(queue.pendingCount).toBe(1);
        expect(queue.activeCount).toBe(0);

        const t2 = createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_B, description: 'active' });
        updateWorkTaskStatus(db, t2.id, 'running');
        expect(queue.activeCount).toBe(1);
    });

    test('onQueueChange listener is called on enqueue', async () => {
        const wts = createMockWorkTaskService();
        const queue = new TaskQueueService(db, wts);
        const listener = mock(() => {});

        queue.onQueueChange(listener);
        await queue.enqueue({ agentId: AGENT_ID, description: 'task', projectId: PROJECT_A });

        expect(listener).toHaveBeenCalled();
    });

    test('offQueueChange removes listener', async () => {
        const wts = createMockWorkTaskService();
        const queue = new TaskQueueService(db, wts);
        const listener = mock(() => {});

        queue.onQueueChange(listener);
        queue.offQueueChange(listener);
        await queue.enqueue({ agentId: AGENT_ID, description: 'task', projectId: PROJECT_A });

        expect(listener).not.toHaveBeenCalled();
    });

    test('rejects enqueue when shutting down', async () => {
        const wts = createMockWorkTaskService();
        Object.defineProperty(wts, 'shuttingDown', { get: () => true });
        const queue = new TaskQueueService(db, wts);

        // The enqueue method checks shuttingDown and throws ValidationError
        await expect(queue.enqueue({ agentId: AGENT_ID, description: 'task', projectId: PROJECT_A })).rejects.toThrow();
    });
});

// ── Priority persistence ─────────────────────────────────────────────

describe('priority persistence', () => {
    test('createWorkTask persists priority to DB', () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_A,
            description: 'high priority',
            priority: 0,
        });
        expect(task.priority).toBe(0);
    });

    test('createWorkTask defaults priority to 2', () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_A,
            description: 'default priority',
        });
        expect(task.priority).toBe(2);
    });

    test('createWorkTask sets queuedAt timestamp', () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_A,
            description: 'with queue time',
        });
        expect(task.queuedAt).toBeTruthy();
    });
});
