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
});
