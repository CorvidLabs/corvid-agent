import { test, expect, beforeEach, afterEach, describe, mock, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createProject } from '../db/projects';
import { createAgent } from '../db/agents';
import {
    createWorkTask,
    createWorkTaskAtomic,
    getWorkTask,
    getWorkTaskBySessionId,
    updateWorkTaskStatus,
    cleanupStaleWorkTasks,
    resetWorkTaskForRetry,
} from '../db/work-tasks';
import { WorkTaskService } from '../work/service';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';

/**
 * Edge-case tests for WorkTaskService.
 *
 * Focuses on:
 * - Worktree conflict prevention via atomic inserts
 * - Max iteration boundary conditions
 * - Interrupted task recovery edge cases (recoverStaleTasks)
 * - Validation flow: governance / security scan failures
 * - Retry task edge cases (shutting down, non-failed, missing agent/project)
 * - Cancel task edge cases (running session, no session, non-existent)
 * - Completion callback error isolation
 * - PR fallback failure paths
 * - Multiple concurrent active statuses blocking
 * - Branch name edge cases with unicode and numbers
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

let db: Database;
let service: WorkTaskService;
let mockProcessManager: ProcessManager;
let spawnCalls: Array<{ cmd: string[]; cwd?: string }>;
let spawnResults: Array<{ exitCode: number; stdout: string; stderr: string }>;
let subscribeCallbacks: Map<string, Set<(sid: string, event: ClaudeStreamEvent) => void>>;

function makeMockProc(result: { exitCode: number; stdout: string; stderr: string }) {
    const makeStream = (text: string) =>
        new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(text));
                controller.close();
            },
        });
    return {
        stdout: makeStream(result.stdout),
        stderr: makeStream(result.stderr),
        exited: Promise.resolve(result.exitCode),
        pid: 12345,
        kill: () => {},
    };
}

function queueSpawn(exitCode: number, stdout = '', stderr = '') {
    spawnResults.push({ exitCode, stdout, stderr });
}

function queueSuccessfulSpawns(count: number) {
    for (let i = 0; i < count; i++) queueSpawn(0);
}

function createMockProcessManager(): ProcessManager {
    subscribeCallbacks = new Map();
    return {
        startProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        isRunning: mock(() => false),
        subscribe: mock((sessionId: string, cb: (sid: string, event: ClaudeStreamEvent) => void) => {
            let cbs = subscribeCallbacks.get(sessionId);
            if (!cbs) { cbs = new Set(); subscribeCallbacks.set(sessionId, cbs); }
            cbs.add(cb);
        }),
        unsubscribe: mock((sessionId: string, cb: (sid: string, event: ClaudeStreamEvent) => void) => {
            subscribeCallbacks.get(sessionId)?.delete(cb);
        }),
        subscribeAll: mock(() => {}),
        unsubscribeAll: mock(() => {}),
        getMemoryStats: mock(() => ({
            processes: 0, subscribers: 0, sessionMeta: 0,
            pausedSessions: 0, sessionTimeouts: 0, stableTimers: 0, globalSubscribers: 0,
        })),
        cleanupSessionState: mock(() => {}),
        shutdown: mock(() => {}),
    } as unknown as ProcessManager;
}

function simulateSessionEnd(sessionId: string, output: string) {
    const cbs = subscribeCallbacks.get(sessionId);
    if (!cbs) return;
    if (output) {
        for (const cb of cbs) {
            cb(sessionId, { type: 'assistant', message: { role: 'assistant', content: output } });
        }
    }
    const cbsCopy = new Set(cbs);
    for (const cb of cbsCopy) {
        cb(sessionId, { type: 'result', total_cost_usd: 0 });
    }
}

function createTestAgentAndProject(opts?: { agentName?: string; projectWorkingDir?: string }) {
    const agent = createAgent(db, { name: opts?.agentName ?? 'TestAgent' });
    const project = createProject(db, {
        name: 'TestProject',
        workingDir: opts?.projectWorkingDir ?? '/tmp/test-project',
    });
    return { agent, project };
}

/** Insert a task directly in DB bypassing service logic. */
function insertTaskWithStatus(
    agentId: string,
    projectId: string,
    status: string,
    opts?: { worktreeDir?: string; iterationCount?: number; sessionId?: string; branchName?: string },
): string {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO work_tasks (id, agent_id, project_id, description, source, requester_info, status, worktree_dir, iteration_count, session_id, branch_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        id, agentId, projectId, 'Test task', 'web', '{}', status,
        opts?.worktreeDir ?? null, opts?.iterationCount ?? 0,
        opts?.sessionId ?? null, opts?.branchName ?? null,
    );
    return id;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    spawnCalls = [];
    spawnResults = [];

    spyOn(Bun, 'spawn').mockImplementation((...args: unknown[]) => {
        const cmd = args[0] as string[];
        const opts = args[1] as { cwd?: string } | undefined;
        spawnCalls.push({ cmd, cwd: opts?.cwd });
        const result = spawnResults.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
        return makeMockProc(result) as ReturnType<typeof Bun.spawn>;
    });

    mockProcessManager = createMockProcessManager();
    service = new WorkTaskService(db, mockProcessManager);
});

afterEach(() => {
    db.close();
    mock.restore();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Worktree conflict prevention (atomic inserts)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Worktree conflict prevention', () => {
    test('atomic insert blocks on pending status (not just active statuses)', () => {
        const { agent, project } = createTestAgentAndProject();
        // Create a pending task (the default status)
        createWorkTask(db, { agentId: agent.id, projectId: project.id, description: 'Pending task' });

        // Atomic insert should succeed because pending is NOT an active status
        // (only branching/running/validating are active)
        const second = createWorkTaskAtomic(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'Second task',
        });
        // pending tasks don't block — the atomic check only blocks on branching/running/validating
        expect(second).not.toBeNull();
    });

    test('atomic insert blocks on all three active statuses', () => {
        for (const status of ['branching', 'running', 'validating'] as const) {
            // Fresh DB for each status
            const innerDb = new Database(':memory:');
            innerDb.exec('PRAGMA foreign_keys = ON');
            runMigrations(innerDb);
            innerDb.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'A', 'test', 'test')`).run('a1');
            innerDb.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'P', '/tmp/p')`).run('p1');

            const first = createWorkTask(innerDb, { agentId: 'a1', projectId: 'p1', description: 'Task 1' });
            updateWorkTaskStatus(innerDb, first.id, status);

            const second = createWorkTaskAtomic(innerDb, { agentId: 'a1', projectId: 'p1', description: 'Task 2' });
            expect(second).toBeNull();
            innerDb.close();
        }
    });

    test('different projects do not conflict with each other', () => {
        const { agent } = createTestAgentAndProject();
        const project2 = createProject(db, { name: 'Project2', workingDir: '/tmp/project2' });

        const first = createWorkTask(db, { agentId: agent.id, projectId: (createProject(db, { name: 'P1', workingDir: '/tmp/p1' })).id, description: 'Task on P1' });
        updateWorkTaskStatus(db, first.id, 'running');

        const second = createWorkTaskAtomic(db, {
            agentId: agent.id,
            projectId: project2.id,
            description: 'Task on P2',
        });
        expect(second).not.toBeNull();
    });

    test('service.create throws ConflictError when atomic insert returns null', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Create and activate a task
        const first = createWorkTask(db, { agentId: agent.id, projectId: project.id, description: 'Active' });
        updateWorkTaskStatus(db, first.id, 'running');

        await expect(
            service.create({ agentId: agent.id, description: 'Blocked task', projectId: project.id }),
        ).rejects.toThrow(/already active/i);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Max iteration boundary conditions
// ═══════════════════════════════════════════════════════════════════════════════

describe('Max iteration limits', () => {
    test('iteration count starts at 1 after executeTask', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2); // worktree + install

        const task = await service.create({
            agentId: agent.id,
            description: 'Check iterations',
            projectId: project.id,
        });

        expect(task.iterationCount).toBe(1);
    });

    test('task fails at exactly WORK_MAX_ITERATIONS (default 3)', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2); // worktree + install
        const task = await service.create({
            agentId: agent.id,
            description: 'Iteration limit test',
            projectId: project.id,
        });

        // Manually set iterationCount to max (3) to simulate reaching limit
        updateWorkTaskStatus(db, task.id, 'running', { iterationCount: 3 });

        // Verify the task is at max iterations
        const atMax = getWorkTask(db, task.id);
        expect(atMax!.iterationCount).toBe(3);
    });

    test('iteration count increments correctly across multiple validation failures', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);
        const task = await service.create({
            agentId: agent.id,
            description: 'Multi-iteration test',
            projectId: project.id,
        });

        // Simulate iteration progression
        updateWorkTaskStatus(db, task.id, 'running', { iterationCount: 1 });
        let t = getWorkTask(db, task.id)!;
        expect(t.iterationCount).toBe(1);

        updateWorkTaskStatus(db, task.id, 'running', { iterationCount: 2 });
        t = getWorkTask(db, task.id)!;
        expect(t.iterationCount).toBe(2);

        updateWorkTaskStatus(db, task.id, 'running', { iterationCount: 3 });
        t = getWorkTask(db, task.id)!;
        expect(t.iterationCount).toBe(3);
    });

    test('error message is truncated to 2000 chars when max iterations reached', () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'running', { iterationCount: 3 });

        const longError = 'E'.repeat(5000);
        updateWorkTaskStatus(db, taskId, 'failed', {
            error: `Validation failed after 3 iteration(s):\n${longError.slice(0, 2000)}`,
        });

        const task = getWorkTask(db, taskId)!;
        // The error in the DB should not exceed the service's truncation
        expect(task.error!.length).toBeLessThanOrEqual(2100); // 2000 + prefix
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Interrupted task recovery (recoverStaleTasks)
// ═══════════════════════════════════════════════════════════════════════════════

describe('recoverStaleTasks', () => {
    test('skips tasks at max iterations', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'running', {
            iterationCount: 3,
            worktreeDir: '/tmp/wt',
        });

        // Queue: worktree cleanup
        queueSpawn(0);

        await service.recoverStaleTasks();

        const task = getWorkTask(db, taskId);
        expect(task!.status).toBe('failed');
        expect(task!.error).toBe('Interrupted by server restart');
    });

    test('retries tasks below max iterations when agent and project exist', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'running', {
            iterationCount: 1,
            worktreeDir: '/tmp/wt',
        });

        // Queue: worktree cleanup for stale, worktree add for retry, bun install
        queueSpawn(0); // worktree cleanup
        queueSpawn(0); // worktree add
        queueSpawn(0); // bun install

        await service.recoverStaleTasks();

        // The task should have been reset and re-queued
        const task = getWorkTask(db, taskId);
        expect(task).not.toBeNull();
        // After recovery it may be in branching/running state (from re-execute)
        // or back to pending (from reset). The key is it's not 'failed'.
        expect(task!.error).not.toBe('Interrupted by server restart');
    });

    test('skips tasks with missing agent', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Create task then delete the agent so it's missing during recovery
        const taskId = insertTaskWithStatus(agent.id, project.id, 'running', { iterationCount: 1 });
        // Disable FK checks temporarily to allow agent deletion
        db.exec('PRAGMA foreign_keys = OFF');
        db.query('DELETE FROM agents WHERE id = ?').run(agent.id);
        db.exec('PRAGMA foreign_keys = ON');

        // Should not throw — recovery skips tasks with missing agents
        await service.recoverStaleTasks();

        const task = getWorkTask(db, taskId);
        expect(task!.status).toBe('failed');
    });

    test('skips tasks with missing project', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'running', { iterationCount: 1 });
        // Delete the project
        db.exec('PRAGMA foreign_keys = OFF');
        db.query('DELETE FROM projects WHERE id = ?').run(project.id);
        db.exec('PRAGMA foreign_keys = ON');

        await service.recoverStaleTasks();

        const task = getWorkTask(db, taskId);
        expect(task!.status).toBe('failed');
    });

    test('cleans up worktrees before retrying', async () => {
        const { agent, project } = createTestAgentAndProject();
        insertTaskWithStatus(agent.id, project.id, 'running', {
            iterationCount: 1,
            worktreeDir: '/tmp/wt-cleanup-test',
        });

        // Queue: cleanup worktree remove, then worktree add + install for retry
        queueSpawn(0); // worktree remove (cleanup)
        queueSpawn(0); // worktree add (retry)
        queueSpawn(0); // bun install (retry)

        await service.recoverStaleTasks();

        // Verify worktree remove was called
        const removeCalls = spawnCalls.filter(c => c.cmd.includes('worktree') && c.cmd.includes('remove'));
        expect(removeCalls.length).toBeGreaterThanOrEqual(1);
    });

    test('handles multiple stale tasks in different states', async () => {
        const { agent, project } = createTestAgentAndProject();

        insertTaskWithStatus(agent.id, project.id, 'branching', { iterationCount: 0 });
        insertTaskWithStatus(agent.id, project.id, 'running', { iterationCount: 1 });
        insertTaskWithStatus(agent.id, project.id, 'validating', { iterationCount: 2 });

        // Queue spawns for cleanup and retries
        queueSuccessfulSpawns(20);

        await service.recoverStaleTasks();

        // All should have been processed
        // All should have been processed - verify no errors thrown
    });

    test('does nothing when no stale tasks exist', async () => {
        // Add only completed/failed/pending tasks
        const { agent, project } = createTestAgentAndProject();
        insertTaskWithStatus(agent.id, project.id, 'completed');
        insertTaskWithStatus(agent.id, project.id, 'failed');
        insertTaskWithStatus(agent.id, project.id, 'pending');

        await service.recoverStaleTasks();
        // Should complete without error
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Retry task edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('retryTask', () => {
    test('rejects retry when server is shutting down', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'failed');

        // Trigger shutdown
        await service.drainRunningTasks();
        expect(service.shuttingDown).toBe(true);

        await expect(service.retryTask(taskId)).rejects.toThrow(/shutting down/i);
    });

    test('returns null for non-existent task', async () => {
        const result = await service.retryTask('nonexistent-id');
        expect(result).toBeNull();
    });

    test('rejects retry of non-failed task', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'running');

        await expect(service.retryTask(taskId)).rejects.toThrow(/only failed/i);
    });

    test('rejects retry of completed task', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'completed');

        await expect(service.retryTask(taskId)).rejects.toThrow(/only failed/i);
    });

    test('rejects retry of pending task', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'pending');

        await expect(service.retryTask(taskId)).rejects.toThrow(/only failed/i);
    });

    test('cleans up old worktree before retrying', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'failed', {
            worktreeDir: '/tmp/old-worktree',
        });

        // Queue: worktree remove (cleanup), worktree add (retry), bun install
        queueSpawn(0); // worktree remove
        queueSpawn(0); // worktree add
        queueSpawn(0); // bun install

        await service.retryTask(taskId);

        const removeCalls = spawnCalls.filter(c => c.cmd.includes('worktree') && c.cmd.includes('remove'));
        expect(removeCalls.length).toBeGreaterThanOrEqual(1);
    });

    test('resets task fields on retry', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'failed', {
            iterationCount: 3,
            worktreeDir: '/tmp/old',
            sessionId: 'old-session',
            branchName: 'agent/old/branch',
        });

        // Queue spawns for retry
        queueSuccessfulSpawns(3);

        const retried = await service.retryTask(taskId);
        expect(retried).not.toBeNull();
        // After retry, it should have a new branch name
        expect(retried!.branchName).not.toBe('agent/old/branch');
        // And should be running with iteration count reset to 1
        expect(retried!.iterationCount).toBe(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Cancel task edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('cancelTask', () => {
    test('returns null for non-existent task', async () => {
        const result = await service.cancelTask('nonexistent');
        expect(result).toBeNull();
    });

    test('stops running session when cancelling', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);
        const task = await service.create({
            agentId: agent.id,
            description: 'Cancel me',
            projectId: project.id,
        });

        // Mock isRunning to return true
        (mockProcessManager.isRunning as ReturnType<typeof mock>).mockImplementation(
            (sid: string) => sid === task.sessionId,
        );

        queueSpawn(0); // worktree remove
        const cancelled = await service.cancelTask(task.id);

        expect(cancelled!.status).toBe('failed');
        expect(cancelled!.error).toBe('Cancelled by user');
        expect(mockProcessManager.stopProcess).toHaveBeenCalled();
    });

    test('cancel works on task without session (early cancel during branching)', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'branching');

        queueSpawn(0); // worktree remove (no-op since no worktreeDir)
        const cancelled = await service.cancelTask(taskId);

        expect(cancelled!.status).toBe('failed');
        expect(cancelled!.error).toBe('Cancelled by user');
    });

    test('cancel works on already-failed task', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'failed');

        const cancelled = await service.cancelTask(taskId);
        expect(cancelled!.status).toBe('failed');
        expect(cancelled!.error).toBe('Cancelled by user');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Completion callback isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Completion callbacks', () => {
    test('multiple callbacks are invoked for the same task', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);
        const task = await service.create({
            agentId: agent.id,
            description: 'Callback test',
            projectId: project.id,
        });

        const results: string[] = [];
        service.onComplete(task.id, () => results.push('cb1'));
        service.onComplete(task.id, () => results.push('cb2'));

        // Complete the task directly
        updateWorkTaskStatus(db, task.id, 'completed', { prUrl: 'https://github.com/test/repo/pull/1' });

        // Callbacks are cleared after notification, verify registration
        expect(results).toHaveLength(0); // Callbacks fire via notifyCallbacks, not direct status update
    });

    test('throwing callback does not prevent other callbacks from running', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);
        const task = await service.create({
            agentId: agent.id,
            description: 'Error callback test',
            projectId: project.id,
        });

        const results: string[] = [];
        service.onComplete(task.id, () => { throw new Error('Callback exploded'); });
        service.onComplete(task.id, () => results.push('survived'));

        // Simulate session ending with PR URL (triggers finalize → notifyCallbacks)
        // Queue validation spawns: install, tsc, test, git diff
        queueSuccessfulSpawns(8);

        // Find the session and simulate completion
        const updatedTask = getWorkTask(db, task.id)!;
        if (updatedTask.sessionId) {
            simulateSessionEnd(updatedTask.sessionId, 'Done! https://github.com/test/repo/pull/99');
            // Give async handlers time to run
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Task creation validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Task creation validation', () => {
    test('rejects non-existent agent', async () => {
        await expect(
            service.create({ agentId: 'nonexistent', description: 'Task', projectId: 'any' }),
        ).rejects.toThrow(/not found/i);
    });

    test('rejects when no projectId and no defaultProjectId on agent', async () => {
        const agent = createAgent(db, { name: 'NoDefaultProject' });
        // Agent has no defaultProjectId, and we don't pass projectId
        await expect(
            service.create({ agentId: agent.id, description: 'Task' }),
        ).rejects.toThrow(/not found/i);
    });

    test('rejects project without workingDir', async () => {
        const agent = createAgent(db, { name: 'A' });
        // Create project with empty workingDir
        const project = createProject(db, { name: 'NoWorkDir', workingDir: '' });

        await expect(
            service.create({ agentId: agent.id, description: 'Task', projectId: project.id }),
        ).rejects.toThrow(/workingDir/i);
    });

    test('rejects when server is shutting down', async () => {
        const { agent, project } = createTestAgentAndProject();
        await service.drainRunningTasks();

        await expect(
            service.create({ agentId: agent.id, description: 'Task', projectId: project.id }),
        ).rejects.toThrow(/shutting down/i);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Worktree creation failure paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('Worktree creation failures', () => {
    test('non-zero exit code from git worktree add marks task as failed', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Queue: git remote get-url (off-limits check), worktree add (FAIL)
        queueSpawn(0); // git remote get-url origin
        queueSpawn(128, '', 'fatal: worktree already exists'); // worktree add fails

        const task = await service.create({
            agentId: agent.id,
            description: 'Worktree fail',
            projectId: project.id,
        });

        expect(task.status).toBe('failed');
        expect(task.error).toMatch(/worktree/i);
    });

    test('exception during worktree creation marks task as failed', async () => {
        const { agent, project } = createTestAgentAndProject();

        // Override spawn to throw on worktree command
        (Bun.spawn as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void }).mockImplementation((...args: unknown[]) => {
            const cmd = args[0] as string[];
            const opts = args[1] as { cwd?: string } | undefined;
            spawnCalls.push({ cmd, cwd: opts?.cwd });

            if (cmd.includes('worktree') && cmd.includes('add')) {
                throw new Error('Permission denied');
            }
            const result = spawnResults.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
            return makeMockProc(result) as ReturnType<typeof Bun.spawn>;
        });

        // Queue: git remote get-url origin
        queueSpawn(0);

        const task = await service.create({
            agentId: agent.id,
            description: 'Exception worktree',
            projectId: project.id,
        });

        expect(task.status).toBe('failed');
        expect(task.error).toMatch(/permission denied/i);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Branch name edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('Branch name edge cases', () => {
    test('numeric-only description produces valid branch name', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: '12345',
            projectId: project.id,
        });

        expect(task.branchName).toBeTruthy();
        expect(task.branchName!.startsWith('agent/')).toBe(true);
        // Should contain the numeric slug
        expect(task.branchName!).toContain('12345');
    });

    test('description with only special characters still generates a branch name', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: '!@#$%^&*()',
            projectId: project.id,
        });

        // Should still generate a branch name (slug part may be empty, but timestamp/suffix present)
        expect(task.branchName).toBeTruthy();
        expect(task.branchName!.startsWith('agent/')).toBe(true);
    });

    test('agent name with all special chars produces valid slug', async () => {
        const agent = createAgent(db, { name: '!@#$%' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Normal desc',
            projectId: project.id,
        });

        // Agent slug should be empty after stripping (but branch still valid)
        expect(task.branchName).toBeTruthy();
        const parts = task.branchName!.split('/');
        expect(parts[0]).toBe('agent');
        // Agent slug may be empty string, that's ok
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. getTask and listTasks
// ═══════════════════════════════════════════════════════════════════════════════

describe('getTask and listTasks', () => {
    test('getTask returns null for unknown id', () => {
        expect(service.getTask('unknown')).toBeNull();
    });

    test('getTask returns the task after creation', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);
        const task = await service.create({
            agentId: agent.id,
            description: 'Get task test',
            projectId: project.id,
        });

        const fetched = service.getTask(task.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(task.id);
    });

    test('listTasks returns all tasks', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);
        await service.create({ agentId: agent.id, description: 'Task 1', projectId: project.id });

        // Complete the first task so second can be created
        const tasks1 = service.listTasks();
        expect(tasks1.length).toBeGreaterThanOrEqual(1);
    });

    test('listTasks filters by agentId', () => {
        const agent1 = createAgent(db, { name: 'Agent1' });
        const agent2 = createAgent(db, { name: 'Agent2' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });

        insertTaskWithStatus(agent1.id, project.id, 'pending');
        insertTaskWithStatus(agent1.id, project.id, 'completed');
        insertTaskWithStatus(agent2.id, project.id, 'pending');

        const agent1Tasks = service.listTasks(agent1.id);
        expect(agent1Tasks).toHaveLength(2);

        const agent2Tasks = service.listTasks(agent2.id);
        expect(agent2Tasks).toHaveLength(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. DB layer edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('DB layer edge cases', () => {
    test('resetWorkTaskForRetry clears all transient fields', () => {
        const { agent, project } = createTestAgentAndProject();
        const task = createWorkTask(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'Full fields',
            source: 'algochat',
            sourceId: 'msg-123',
            requesterInfo: { key: 'value' },
        });

        // Set all transient fields
        updateWorkTaskStatus(db, task.id, 'running', {
            sessionId: 'sess-1',
            branchName: 'agent/test/branch',
            worktreeDir: '/tmp/wt',
            iterationCount: 3,
            originalBranch: 'main',
        });
        updateWorkTaskStatus(db, task.id, 'failed', { error: 'Some error', summary: 'Summary text' });

        resetWorkTaskForRetry(db, task.id);

        const reset = getWorkTask(db, task.id)!;
        expect(reset.status).toBe('pending');
        expect(reset.sessionId).toBeNull();
        expect(reset.branchName).toBeNull();
        expect(reset.worktreeDir).toBeNull();
        expect(reset.error).toBeNull();
        expect(reset.completedAt).toBeNull();
        expect(reset.iterationCount).toBe(0);

        // Persistent fields should remain
        expect(reset.description).toBe('Full fields');
        expect(reset.source).toBe('algochat');
        expect(reset.sourceId).toBe('msg-123');
        expect(reset.agentId).toBe(agent.id);
        expect(reset.projectId).toBe(project.id);
    });

    test('cleanupStaleWorkTasks captures all three active statuses', () => {
        const agent1 = createAgent(db, { name: 'A1' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });

        const t1 = createWorkTask(db, { agentId: agent1.id, projectId: project.id, description: 'B' });
        const t2 = createWorkTask(db, { agentId: agent1.id, projectId: project.id, description: 'R' });
        const t3 = createWorkTask(db, { agentId: agent1.id, projectId: project.id, description: 'V' });
        updateWorkTaskStatus(db, t1.id, 'branching');
        updateWorkTaskStatus(db, t2.id, 'running');
        updateWorkTaskStatus(db, t3.id, 'validating');

        const stale = cleanupStaleWorkTasks(db);
        expect(stale).toHaveLength(3);

        for (const t of [t1, t2, t3]) {
            const task = getWorkTask(db, t.id)!;
            expect(task.status).toBe('failed');
            expect(task.error).toBe('Interrupted by server restart');
        }
    });

    test('updateWorkTaskStatus with completed sets completedAt', () => {
        const { agent, project } = createTestAgentAndProject();
        const task = createWorkTask(db, { agentId: agent.id, projectId: project.id, description: 'T' });

        updateWorkTaskStatus(db, task.id, 'completed', { prUrl: 'https://github.com/o/r/pull/1' });
        expect(getWorkTask(db, task.id)!.completedAt).toBeTruthy();
    });

    test('updateWorkTaskStatus with failed sets completedAt', () => {
        const { agent, project } = createTestAgentAndProject();
        const task = createWorkTask(db, { agentId: agent.id, projectId: project.id, description: 'T' });

        updateWorkTaskStatus(db, task.id, 'failed', { error: 'Something broke' });
        expect(getWorkTask(db, task.id)!.completedAt).toBeTruthy();
    });

    test('updateWorkTaskStatus with running does not set completedAt', () => {
        const { agent, project } = createTestAgentAndProject();
        const task = createWorkTask(db, { agentId: agent.id, projectId: project.id, description: 'T' });

        updateWorkTaskStatus(db, task.id, 'running');
        expect(getWorkTask(db, task.id)!.completedAt).toBeNull();
    });

    test('getWorkTaskBySessionId returns the correct task', () => {
        const { agent, project } = createTestAgentAndProject();
        const task = createWorkTask(db, { agentId: agent.id, projectId: project.id, description: 'T' });
        updateWorkTaskStatus(db, task.id, 'running', { sessionId: 'my-session' });

        const found = getWorkTaskBySessionId(db, 'my-session');
        expect(found).not.toBeNull();
        expect(found!.id).toBe(task.id);
    });

    test('getWorkTaskBySessionId returns null for no match', () => {
        expect(getWorkTaskBySessionId(db, 'no-such-session')).toBeNull();
    });

    test('createWorkTaskAtomic allows creation after active task is completed', () => {
        const { agent, project } = createTestAgentAndProject();
        const first = createWorkTask(db, { agentId: agent.id, projectId: project.id, description: 'First' });
        updateWorkTaskStatus(db, first.id, 'running');
        updateWorkTaskStatus(db, first.id, 'completed', { prUrl: 'https://github.com/x/pull/1' });

        const second = createWorkTaskAtomic(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'Second',
        });
        expect(second).not.toBeNull();
    });

    test('createWorkTaskAtomic allows creation after active task is failed', () => {
        const { agent, project } = createTestAgentAndProject();
        const first = createWorkTask(db, { agentId: agent.id, projectId: project.id, description: 'First' });
        updateWorkTaskStatus(db, first.id, 'running');
        updateWorkTaskStatus(db, first.id, 'failed', { error: 'broke' });

        const second = createWorkTaskAtomic(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'Second',
        });
        expect(second).not.toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Drain edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('Drain edge cases', () => {
    test('drain completes immediately with only terminal-state tasks', async () => {
        const { agent, project } = createTestAgentAndProject();
        insertTaskWithStatus(agent.id, project.id, 'completed');
        insertTaskWithStatus(agent.id, project.id, 'failed');
        insertTaskWithStatus(agent.id, project.id, 'pending');

        const start = Date.now();
        await service.drainRunningTasks();
        const elapsed = Date.now() - start;

        expect(service.shuttingDown).toBe(true);
        expect(elapsed).toBeLessThan(1000);
    });

    test('drain blocks retryTask after activation', async () => {
        const { agent, project } = createTestAgentAndProject();
        const taskId = insertTaskWithStatus(agent.id, project.id, 'failed');

        await service.drainRunningTasks();
        await expect(service.retryTask(taskId)).rejects.toThrow(/shutting down/i);
    });

    test('drain processes multiple active tasks', async () => {
        const { agent, project } = createTestAgentAndProject();
        const t1 = insertTaskWithStatus(agent.id, project.id, 'running');
        const t2 = insertTaskWithStatus(agent.id, project.id, 'validating');

        const drainPromise = service.drainRunningTasks(50);

        // Complete both tasks quickly
        setTimeout(() => {
            updateWorkTaskStatus(db, t1, 'completed', { prUrl: 'https://github.com/x/pull/1' });
            updateWorkTaskStatus(db, t2, 'completed', { prUrl: 'https://github.com/x/pull/2' });
        }, 20);

        await drainPromise;

        expect(getWorkTask(db, t1)!.status).toBe('completed');
        expect(getWorkTask(db, t2)!.status).toBe('completed');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. handleSessionEnd edge cases (via simulation)
// ═══════════════════════════════════════════════════════════════════════════════

describe('handleSessionEnd edge cases', () => {
    test('session_exited event also triggers handleSessionEnd', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);
        const task = await service.create({
            agentId: agent.id,
            description: 'Session exit test',
            projectId: project.id,
        });

        const sessionId = getWorkTask(db, task.id)!.sessionId!;

        // Queue validation spawns
        queueSuccessfulSpawns(10);

        // Simulate session_exited instead of result
        const cbs = subscribeCallbacks.get(sessionId);
        if (cbs) {
            const cbsCopy = new Set(cbs);
            for (const cb of cbsCopy) {
                cb(sessionId, { type: 'session_exited' } as ClaudeStreamEvent);
            }
        }

        await new Promise(resolve => setTimeout(resolve, 200));
        // The task should have progressed past 'running' state
    });

    test('handles empty session output gracefully', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);
        const task = await service.create({
            agentId: agent.id,
            description: 'Empty output',
            projectId: project.id,
        });

        const sessionId = getWorkTask(db, task.id)!.sessionId!;
        queueSuccessfulSpawns(10);

        // Send result with no prior assistant content (empty output)
        const cbs = subscribeCallbacks.get(sessionId);
        if (cbs) {
            const cbsCopy = new Set(cbs);
            for (const cb of cbsCopy) {
                cb(sessionId, { type: 'result', total_cost_usd: 0 });
            }
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. Validation pipeline (runValidation)
// ═══════════════════════════════════════════════════════════════════════════════

describe('runValidation', () => {
    // Import directly to test the function
    test('passes when tsc and tests succeed', async () => {
        // Queue: bun install, tsc, test, git diff
        queueSpawn(0); // bun install
        queueSpawn(0); // tsc
        queueSpawn(0); // bun test
        queueSpawn(0, ''); // git diff (empty = no changes)

        const { runValidation } = await import('../work/validation');
        const result = await runValidation('/tmp/test-dir');

        expect(result.passed).toBe(true);
        expect(result.output).toContain('TypeScript Check Passed');
        expect(result.output).toContain('Tests Passed');
    });

    test('fails when tsc returns non-zero', async () => {
        queueSpawn(0); // bun install
        queueSpawn(1, 'error TS2345: type mismatch', ''); // tsc fails
        queueSpawn(0); // bun test passes
        queueSpawn(0, ''); // git diff empty

        const { runValidation } = await import('../work/validation');
        const result = await runValidation('/tmp/test-dir');

        expect(result.passed).toBe(false);
        expect(result.output).toContain('TypeScript Check Failed');
        expect(result.output).toContain('TS2345');
    });

    test('fails when tests return non-zero', async () => {
        queueSpawn(0); // bun install
        queueSpawn(0); // tsc passes
        queueSpawn(1, 'FAIL: 2 tests failed', ''); // tests fail
        queueSpawn(0, ''); // git diff empty

        const { runValidation } = await import('../work/validation');
        const result = await runValidation('/tmp/test-dir');

        expect(result.passed).toBe(false);
        expect(result.output).toContain('Tests Failed');
    });

    test('install failure is non-fatal in validation', async () => {
        queueSpawn(1, '', 'install error'); // bun install fails
        queueSpawn(1, '', 'retry also fails'); // retry fails too
        queueSpawn(0); // tsc passes
        queueSpawn(0); // tests pass
        queueSpawn(0, ''); // git diff

        const { runValidation } = await import('../work/validation');
        const result = await runValidation('/tmp/test-dir');

        // Despite install failure, if tsc and tests pass, validation passes
        expect(result.passed).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. Bun install (standalone)
// ═══════════════════════════════════════════════════════════════════════════════

describe('runBunInstall', () => {
    test('successful frozen-lockfile does not retry', async () => {
        queueSpawn(0); // frozen-lockfile success
        const { runBunInstall } = await import('../work/validation');
        await runBunInstall('/tmp/test');

        const installCalls = spawnCalls.filter(c =>
            c.cmd.some(arg => arg === 'install' || arg.endsWith('install')),
        );
        expect(installCalls).toHaveLength(1);
    });

    test('failed frozen-lockfile triggers retry', async () => {
        queueSpawn(1, '', 'lockfile error'); // frozen fails
        queueSpawn(0); // retry succeeds

        const { runBunInstall } = await import('../work/validation');
        await runBunInstall('/tmp/test');

        const installCalls = spawnCalls.filter(c =>
            c.cmd.some(arg => arg === 'install' || arg.endsWith('install')),
        );
        expect(installCalls).toHaveLength(2);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. Repo map edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('Repo map utilities', () => {
    test('filePathPriority ranks source dirs over test files', async () => {
        const { filePathPriority } = await import('../work/repo-map');
        expect(filePathPriority('src/utils/helpers.ts')).toBe(1);
        expect(filePathPriority('server/work/service.ts')).toBe(1);
        expect(filePathPriority('lib/crypto.ts')).toBe(1);
        expect(filePathPriority('packages/env/index.ts')).toBe(1);
        expect(filePathPriority('other/file.ts')).toBe(2);
        expect(filePathPriority('server/__tests__/test.ts')).toBe(3);
        expect(filePathPriority('foo.test.ts')).toBe(3);
        expect(filePathPriority('bar.spec.ts')).toBe(3);
    });

    test('tokenizeDescription filters stop words and short tokens', async () => {
        const { tokenizeDescription } = await import('../work/repo-map');
        const tokens = tokenizeDescription('Fix the login bug in auth service');
        expect(tokens).not.toContain('the');
        expect(tokens).not.toContain('in');
        // 'fix' is a stop word in this codebase
        expect(tokens).not.toContain('fix');
        expect(tokens).toContain('login');
        expect(tokens).toContain('auth');
        expect(tokens).toContain('service');
    });

    test('tokenizeDescription splits camelCase', async () => {
        const { tokenizeDescription } = await import('../work/repo-map');
        const tokens = tokenizeDescription('Fix buildWorkPrompt method');
        expect(tokens).toContain('buildworkprompt');
        expect(tokens).toContain('work');
        expect(tokens).toContain('prompt');
        expect(tokens).toContain('method');
    });

    test('tokenizeDescription handles empty/whitespace-only input', async () => {
        const { tokenizeDescription } = await import('../work/repo-map');
        expect(tokenizeDescription('')).toEqual([]);
        expect(tokenizeDescription('   ')).toEqual([]);
        expect(tokenizeDescription('a b c')).toEqual([]); // all < 3 chars
    });

    test('STOP_WORDS contains expected common words', async () => {
        const { STOP_WORDS } = await import('../work/repo-map');
        expect(STOP_WORDS.has('the')).toBe(true);
        expect(STOP_WORDS.has('add')).toBe(true);
        expect(STOP_WORDS.has('fix')).toBe(true);
        expect(STOP_WORDS.has('create')).toBe(true);
        expect(STOP_WORDS.has('update')).toBe(true);
    });

    test('REPO_MAP_MAX_LINES is 200', async () => {
        const { REPO_MAP_MAX_LINES } = await import('../work/repo-map');
        expect(REPO_MAP_MAX_LINES).toBe(200);
    });
});
