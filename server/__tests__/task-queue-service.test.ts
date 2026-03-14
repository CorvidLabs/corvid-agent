import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { TaskQueueService } from '../work/queue';
import {
    createWorkTask,
    updateWorkTaskStatus,
} from '../db/work-tasks';

// --- Helpers ----------------------------------------------------------------

const AGENT_ID = 'agent-q';
const PROJECT_ID = 'proj-q';

function seedFixtures(db: Database): void {
    db.query(
        `INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'QueueAgent', 'test', 'test')`,
    ).run(AGENT_ID);
    db.query(
        `INSERT INTO projects (id, name, working_dir) VALUES (?, 'QueueProject', '/tmp/queue-test')`,
    ).run(PROJECT_ID);
}

/** Minimal WorkTaskService stub that satisfies TaskQueueService's constructor. */
function createMockWorkTaskService(db: Database) {
    return {
        shuttingDown: false,
        create: mock(async (input: any) => {
            const task = createWorkTask(db, {
                agentId: input.agentId,
                projectId: input.projectId,
                description: input.description,
                source: input.source ?? 'web',
            });
            return task;
        }),
        executeTask: mock(async () => {}),
        drainRunningTasks: mock(async () => {}),
    } as any;
}

// --- Tests ------------------------------------------------------------------

describe('TaskQueueService', () => {
    let db: Database;
    let service: TaskQueueService;
    let mockWts: ReturnType<typeof createMockWorkTaskService>;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
        seedFixtures(db);
        mockWts = createMockWorkTaskService(db);
        service = new TaskQueueService(db, mockWts, {
            maxConcurrency: 2,
            pollIntervalMs: 60_000, // long interval so timer doesn't fire during tests
        });
    });

    afterEach(async () => {
        await service.stop();
        db.close();
    });

    // ── Constructor / config ─────────────────────────────────────────

    it('uses provided config values', () => {
        const status = service.getQueueStatus();
        expect(status.maxConcurrency).toBe(2);
    });

    it('defaults running to false', () => {
        expect(service.running).toBe(false);
    });

    // ── start / stop ─────────────────────────────────────────────────

    it('start sets running to true', () => {
        service.start();
        expect(service.running).toBe(true);
    });

    it('start is idempotent', () => {
        service.start();
        service.start();
        expect(service.running).toBe(true);
    });

    it('stop sets running to false and clears timer', async () => {
        service.start();
        await service.stop();
        expect(service.running).toBe(false);
    });

    it('stop with drain calls drainRunningTasks', async () => {
        service.start();
        await service.stop(true);
        expect(mockWts.drainRunningTasks).toHaveBeenCalledTimes(1);
    });

    it('stop without drain does not call drainRunningTasks', async () => {
        service.start();
        await service.stop(false);
        expect(mockWts.drainRunningTasks).toHaveBeenCalledTimes(0);
    });

    // ── activeCount / pendingCount ───────────────────────────────────

    it('activeCount reflects DB state', () => {
        expect(service.activeCount).toBe(0);
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Active task',
        });
        updateWorkTaskStatus(db, task.id, 'running');
        expect(service.activeCount).toBe(1);
    });

    it('pendingCount reflects DB state', () => {
        expect(service.pendingCount).toBe(0);
        createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Pending task',
        });
        expect(service.pendingCount).toBe(1);
    });

    // ── getQueueStatus ───────────────────────────────────────────────

    it('getQueueStatus returns complete status object', () => {
        createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Pending',
        });
        const task2 = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Running',
        });
        updateWorkTaskStatus(db, task2.id, 'running');

        const status = service.getQueueStatus();
        expect(status.pendingCount).toBe(1);
        expect(status.activeCount).toBe(1);
        expect(status.maxConcurrency).toBe(2);
        expect(status.activeByProject).toBeDefined();
        expect(status.activeByProject[PROJECT_ID]).toBe(task2.id);
    });

    // ── enqueue ──────────────────────────────────────────────────────

    it('enqueue delegates to WorkTaskService.create', async () => {
        const task = await service.enqueue({
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Enqueued task',
            source: 'web',
        });
        expect(task).toBeDefined();
        expect(task.description).toBe('Enqueued task');
        expect(mockWts.create).toHaveBeenCalledTimes(1);
    });

    it('enqueue throws when shutting down', async () => {
        mockWts.shuttingDown = true;
        await expect(
            service.enqueue({
                agentId: AGENT_ID,
                projectId: PROJECT_ID,
                description: 'Should fail',
                source: 'web',
            }),
        ).rejects.toThrow(/shutting down/i);
    });

    // ── Queue change listeners ───────────────────────────────────────

    it('onQueueChange registers a listener that fires on enqueue', async () => {
        const calls: Array<[number, number]> = [];
        const listener = (active: number, pending: number) => {
            calls.push([active, pending]);
        };
        service.onQueueChange(listener);

        await service.enqueue({
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Listener test',
            source: 'web',
        });

        expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    it('offQueueChange removes a listener', async () => {
        const calls: number[] = [];
        const listener = () => calls.push(1);
        service.onQueueChange(listener);
        service.offQueueChange(listener);

        await service.enqueue({
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'No listener',
            source: 'web',
        });

        expect(calls).toHaveLength(0);
    });

    it('listener errors do not propagate', async () => {
        const badListener = () => {
            throw new Error('boom');
        };
        service.onQueueChange(badListener);

        // Should not throw
        const task = await service.enqueue({
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Error listener test',
            source: 'web',
        });
        expect(task).toBeDefined();
    });

    // ── tick() dispatch loop ─────────────────────────────────────────

    it('tick does nothing when active count >= maxConcurrency', async () => {
        // Fill up both concurrency slots
        const task1 = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Active 1',
        });
        updateWorkTaskStatus(db, task1.id, 'running');

        const PROJECT_ID_2 = 'proj-q2';
        db.query(
            `INSERT INTO projects (id, name, working_dir) VALUES (?, 'QueueProject2', '/tmp/queue-test-2')`,
        ).run(PROJECT_ID_2);
        const task2 = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID_2,
            description: 'Active 2',
        });
        updateWorkTaskStatus(db, task2.id, 'running');

        // A pending task waiting to be dispatched
        const pendingTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Pending task (should stay pending)',
        });

        await (service as any).tick();

        // executeTask should not have been called since we are at max concurrency
        expect(mockWts.executeTask).toHaveBeenCalledTimes(0);

        // The pending task should still be pending
        const row = db.query(`SELECT status FROM work_tasks WHERE id = ?`).get(pendingTask.id) as { status: string } | null;
        expect(row?.status).toBe('pending');
    });

    it('tick dispatches a pending task when under maxConcurrency', async () => {
        // Create a pending task — no active tasks in the DB so it is a dispatch candidate
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Should be dispatched',
        });

        await (service as any).tick();

        // executeTask should have been called once for the promoted task
        expect(mockWts.executeTask).toHaveBeenCalledTimes(1);

        // The task should have been promoted to 'branching' during the transaction
        // (executeTask mock resolves immediately so status may have moved on,
        // but we can at least confirm executeTask received the right task id)
        const [calledTask] = mockWts.executeTask.mock.calls[0];
        expect(calledTask.id).toBe(task.id);
    });

    it('tick does not dispatch when no pending candidates exist', async () => {
        // No tasks in DB at all
        await (service as any).tick();
        expect(mockWts.executeTask).toHaveBeenCalledTimes(0);
    });

    it('tick skips project that already has an active task', async () => {
        // Make task1 active for PROJECT_ID
        const activeTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Already running',
        });
        updateWorkTaskStatus(db, activeTask.id, 'running');

        // Add a pending task for the same project — should not be dispatched
        createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Blocked by active task',
        });

        await (service as any).tick();

        expect(mockWts.executeTask).toHaveBeenCalledTimes(0);
    });

    it('tick dispatches multiple candidates up to available slots', async () => {
        const PROJECT_ID_A = 'proj-tick-a';
        const PROJECT_ID_B = 'proj-tick-b';
        db.query(
            `INSERT INTO projects (id, name, working_dir) VALUES (?, 'TickA', '/tmp/tick-a')`,
        ).run(PROJECT_ID_A);
        db.query(
            `INSERT INTO projects (id, name, working_dir) VALUES (?, 'TickB', '/tmp/tick-b')`,
        ).run(PROJECT_ID_B);

        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID_A, description: 'Task A' });
        createWorkTask(db, { agentId: AGENT_ID, projectId: PROJECT_ID_B, description: 'Task B' });

        await (service as any).tick();

        // Both tasks should have been dispatched (maxConcurrency=2, active=0 → available=2)
        expect(mockWts.executeTask).toHaveBeenCalledTimes(2);
    });

    it('tick notifies queue change listeners when tasks are dispatched', async () => {
        createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Dispatch listener test',
        });

        const calls: Array<[number, number]> = [];
        service.onQueueChange((active, pending) => calls.push([active, pending]));

        await (service as any).tick();

        expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    // ── tick() error handling ────────────────────────────────────────

    it('tick error is caught by the interval error handler without throwing', async () => {
        // Stub executeTask to throw so the executePromoted promise rejects.
        // tick() itself swallows per-task errors via .catch(), so tick() should resolve.
        mockWts.executeTask = mock(async () => {
            throw new Error('executeTask exploded');
        });

        createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Task that will error',
        });

        // Should not throw — errors are caught inside tick/executePromoted
        await expect((service as any).tick()).resolves.toBeUndefined();
    });

    // ── executePromoted() ────────────────────────────────────────────

    it('executePromoted calls executeTask with resolved agent and project', async () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Promoted task',
        });
        updateWorkTaskStatus(db, task.id, 'branching');

        // Reload task so we have the full object
        // Manually build a WorkTask-like object (tick() uses the raw row from dispatchCandidates)
        const workTask = { ...task, status: 'branching' as const };

        await (service as any).executePromoted(workTask);

        expect(mockWts.executeTask).toHaveBeenCalledTimes(1);
        const [calledTask, calledAgent, calledProject] = mockWts.executeTask.mock.calls[0];
        expect(calledTask.id).toBe(task.id);
        expect(calledAgent.id).toBe(AGENT_ID);
        expect(calledProject.id).toBe(PROJECT_ID);
    });

    it('executePromoted marks task as failed when agent does not exist', async () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Missing agent task',
        });
        updateWorkTaskStatus(db, task.id, 'branching');

        const workTask = { ...task, status: 'branching' as const, agentId: 'nonexistent-agent' };

        await (service as any).executePromoted(workTask);

        expect(mockWts.executeTask).toHaveBeenCalledTimes(0);

        // Task should now be failed in the DB
        const row = db.query(`SELECT status, error FROM work_tasks WHERE id = ?`).get(task.id) as { status: string; error: string | null } | null;
        expect(row?.status).toBe('failed');
        expect(row?.error).toMatch(/missing/i);
    });

    it('executePromoted marks task as failed when project does not exist', async () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Missing project task',
        });
        updateWorkTaskStatus(db, task.id, 'branching');

        const workTask = { ...task, status: 'branching' as const, projectId: 'nonexistent-project' };

        await (service as any).executePromoted(workTask);

        expect(mockWts.executeTask).toHaveBeenCalledTimes(0);

        const row = db.query(`SELECT status, error FROM work_tasks WHERE id = ?`).get(task.id) as { status: string; error: string | null } | null;
        expect(row?.status).toBe('failed');
        expect(row?.error).toMatch(/missing/i);
    });
});
