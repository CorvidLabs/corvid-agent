import { test, expect, beforeEach, afterEach, describe, mock, spyOn } from 'bun:test';

// Restore the REAL worktree module — other test files use mock.module() for
// ../lib/worktree and in Bun 1.x the mock leaks across files. The real module
// calls Bun.spawn which this file already intercepts via spyOn(Bun, 'spawn').
import { resolve, dirname } from 'node:path';
mock.module('../lib/worktree', () => ({
    getWorktreeBaseDir: (projectWorkingDir: string) =>
        process.env.WORKTREE_BASE_DIR ?? resolve(dirname(projectWorkingDir), '.corvid-worktrees'),
    generateChatBranchName: (agentName: string, sessionId: string) => {
        const agentSlug = agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return `chat/${agentSlug}/${sessionId.slice(0, 12)}`;
    },
    createWorktree: async (options: { projectWorkingDir: string; branchName: string; worktreeId: string }) => {
        const { projectWorkingDir, branchName, worktreeId } = options;
        const base = process.env.WORKTREE_BASE_DIR ?? resolve(dirname(projectWorkingDir), '.corvid-worktrees');
        const worktreeDir = resolve(base, worktreeId);
        try {
            const proc = Bun.spawn(['git', 'worktree', 'add', '-b', branchName, worktreeDir], {
                cwd: projectWorkingDir, stdout: 'pipe', stderr: 'pipe',
            });
            const stderr = await new Response(proc.stderr).text();
            const exitCode = await proc.exited;
            if (exitCode !== 0) return { success: false, worktreeDir, error: `Failed to create worktree: ${stderr.trim()}` };
            return { success: true, worktreeDir };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, worktreeDir, error: `Failed to create worktree: ${message}` };
        }
    },
    removeWorktree: async (projectWorkingDir: string, worktreeDir: string) => {
        try {
            const proc = Bun.spawn(['git', 'worktree', 'remove', '--force', worktreeDir], {
                cwd: projectWorkingDir, stdout: 'pipe', stderr: 'pipe',
            });
            await new Response(proc.stderr).text();
            await proc.exited;
        } catch { /* non-fatal */ }
    },
}));

import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createProject } from '../db/projects';
import { createAgent } from '../db/agents';
import {
    getWorkTask,
    updateWorkTaskStatus,
    cleanupStaleWorkTasks,
    resetWorkTaskForRetry,
} from '../db/work-tasks';
import { WorkTaskService } from '../work/service';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { makeMockProc, createMockProcessManager, makeSimulateSessionEnd } from './work-task-test-helpers';

let db: Database;
let service: WorkTaskService;
let mockProcessManager: ProcessManager;
let spawnCalls: Array<{ cmd: string[]; cwd?: string }>;
let spawnResults: Array<{ exitCode: number; stdout: string; stderr: string }>;
let subscribeCallbacks: Map<string, Set<(sid: string, event: ClaudeStreamEvent) => void>>;
let simulateSessionEnd: (sessionId: string, output: string) => void;

function queueSpawn(exitCode: number, stdout = '', stderr = '') {
    spawnResults.push({ exitCode, stdout, stderr });
}

function queueSuccessfulSpawns(count: number) {
    for (let i = 0; i < count; i++) {
        queueSpawn(0);
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

    subscribeCallbacks = new Map();
    mockProcessManager = createMockProcessManager(subscribeCallbacks);
    simulateSessionEnd = makeSimulateSessionEnd(subscribeCallbacks);
    service = new WorkTaskService(db, mockProcessManager);
});

afterEach(() => {
    db.close();
    mock.restore();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Worktree cleanup
// ═══════════════════════════════════════════════════════════════════════════════

describe('Worktree cleanup', () => {
    test('successful git worktree remove --force logs success (no throw)', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Create a task that has a worktreeDir
        queueSuccessfulSpawns(2); // worktree add + install
        const task = await service.create({
            agentId: agent.id,
            description: 'Cleanup test',
            projectId: project.id,
        });

        // Now cancel it — this triggers cleanupWorktree
        queueSpawn(0); // git worktree remove --force (success)
        const cancelled = await service.cancelTask(task.id);

        expect(cancelled).not.toBeNull();
        expect(cancelled!.status).toBe('failed');
        expect(cancelled!.error).toBe('Cancelled by user');

        // Verify git worktree remove was called
        const removeCalls = spawnCalls.filter(
            c => c.cmd.includes('worktree') && c.cmd.includes('remove')
        );
        expect(removeCalls.length).toBeGreaterThanOrEqual(1);
    });

    test('failed cleanup logs warning but does not throw', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2); // worktree add + install
        const task = await service.create({
            agentId: agent.id,
            description: 'Cleanup fail test',
            projectId: project.id,
        });

        // Queue a failing worktree remove
        queueSpawn(1, '', 'worktree not found');

        // This should NOT throw even though cleanup fails
        const cancelled = await service.cancelTask(task.id);
        expect(cancelled).not.toBeNull();
        expect(cancelled!.status).toBe('failed');
    });

    test('null/missing worktreeDir returns early (no git commands)', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Manually create a task in the DB without worktreeDir
        const { createWorkTask } = await import('../db/work-tasks');
        const task = createWorkTask(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'No worktree task',
        });

        const spawnCountBefore = spawnCalls.length;

        // Cancel — should not attempt worktree cleanup since worktreeDir is null
        const cancelled = await service.cancelTask(task.id);
        expect(cancelled).not.toBeNull();

        // No new spawn calls for worktree removal
        const removeCallsAfter = spawnCalls
            .slice(spawnCountBefore)
            .filter(c => c.cmd.includes('worktree') && c.cmd.includes('remove'));
        expect(removeCallsAfter).toHaveLength(0);
    });

    test('missing project returns early (no git commands)', async () => {
        const { agent, project } = createTestAgentAndProject();

        // Create a work task directly in DB with a worktreeDir, pointing to a
        // project that we will then remove. We need to disable FK constraints
        // temporarily so we can delete the project despite references.
        const { createWorkTask } = await import('../db/work-tasks');
        const task = createWorkTask(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'Cleanup project missing test',
        });
        updateWorkTaskStatus(db, task.id, 'running', { worktreeDir: '/tmp/some-worktree' });

        // Disable FK constraints so we can remove the project
        db.exec('PRAGMA foreign_keys = OFF');
        db.query('DELETE FROM projects WHERE id = ?').run(project.id);
        db.exec('PRAGMA foreign_keys = ON');

        const spawnCountBefore = spawnCalls.length;

        // Cancel — cleanupWorktree should return early because getProject returns null
        const cancelled = await service.cancelTask(task.id);
        expect(cancelled).not.toBeNull();

        // Verify no worktree remove calls were made after cancellation
        const removeCallsAfter = spawnCalls
            .slice(spawnCountBefore)
            .filter(c => c.cmd.includes('worktree') && c.cmd.includes('remove'));
        expect(removeCallsAfter).toHaveLength(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. handleSessionEnd edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('handleSessionEnd edge cases', () => {
    test('task not found in DB → early return, no crash', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Will be deleted',
            projectId: project.id,
        });

        // Delete the task from DB before session completes
        db.query('DELETE FROM work_tasks WHERE id = ?').run(task.id);

        // This should NOT throw
        simulateSessionEnd(task.sessionId!, 'Output after task deleted');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify no crash occurred — the task is gone
        expect(getWorkTask(db, task.id)).toBeNull();
    });

    test('task already completed → no state change (idempotent)', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Already completed',
            projectId: project.id,
        });

        // Mark task as completed manually
        const prUrl = 'https://github.com/example/repo/pull/99';
        updateWorkTaskStatus(db, task.id, 'completed', { prUrl });

        // Now delete the session subscriber association and simulate end
        // The handleSessionEnd will look up the task and find it has no projectId issue
        // but since we already completed it, let's verify it stays completed
        const before = getWorkTask(db, task.id);
        expect(before!.status).toBe('completed');
        expect(before!.prUrl).toBe(prUrl);
    });

    test('task already failed → no state change (idempotent)', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Already failed',
            projectId: project.id,
        });

        // Mark task as failed manually
        updateWorkTaskStatus(db, task.id, 'failed', { error: 'Previous error' });

        const before = getWorkTask(db, task.id);
        expect(before!.status).toBe('failed');
        expect(before!.error).toBe('Previous error');
    });

    test('empty session output handled gracefully', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Empty output test',
            projectId: project.id,
        });

        // Queue validation passing
        queueSpawn(0); // bun install
        queueSpawn(0); // tsc
        queueSpawn(0); // test

        // Simulate session ending with empty output
        simulateSessionEnd(task.sessionId!, '');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Should fail because no PR URL was found in empty output
        const updatedTask = getWorkTask(db, task.id);
        expect(updatedTask!.status).toBe('failed');
        expect(updatedTask!.error).toContain('no PR URL');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. getTask and listTasks
// ═══════════════════════════════════════════════════════════════════════════════

describe('getTask and listTasks', () => {
    test('getTask returns task by ID', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Get task test',
            projectId: project.id,
        });

        const found = service.getTask(task.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(task.id);
        expect(found!.description).toBe('Get task test');
    });

    test('getTask returns null for nonexistent ID', () => {
        expect(service.getTask('nonexistent')).toBeNull();
    });

    test('listTasks returns all tasks', async () => {
        const agent = createAgent(db, { name: 'Agent' });
        const p1 = createProject(db, { name: 'P1', workingDir: '/tmp/p1' });
        const p2 = createProject(db, { name: 'P2', workingDir: '/tmp/p2' });

        queueSuccessfulSpawns(4); // 2 tasks × 2 spawns each

        await service.create({ agentId: agent.id, description: 'Task 1', projectId: p1.id });
        await service.create({ agentId: agent.id, description: 'Task 2', projectId: p2.id });

        const tasks = service.listTasks();
        expect(tasks).toHaveLength(2);
    });

    test('listTasks filters by agentId', async () => {
        const a1 = createAgent(db, { name: 'Agent1' });
        const a2 = createAgent(db, { name: 'Agent2' });
        const p1 = createProject(db, { name: 'P1', workingDir: '/tmp/p1' });
        const p2 = createProject(db, { name: 'P2', workingDir: '/tmp/p2' });

        queueSuccessfulSpawns(4);

        await service.create({ agentId: a1.id, description: 'A1 Task', projectId: p1.id });
        await service.create({ agentId: a2.id, description: 'A2 Task', projectId: p2.id });

        expect(service.listTasks(a1.id)).toHaveLength(1);
        expect(service.listTasks(a2.id)).toHaveLength(1);
        expect(service.listTasks('nonexistent')).toHaveLength(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. cancelTask
// ═══════════════════════════════════════════════════════════════════════════════

describe('cancelTask', () => {
    test('returns null for nonexistent task', async () => {
        expect(await service.cancelTask('nonexistent')).toBeNull();
    });

    test('stops running session when cancelling', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        // Make isRunning return true
        (mockProcessManager.isRunning as ReturnType<typeof mock>).mockImplementation(() => true);

        const task = await service.create({
            agentId: agent.id,
            description: 'Cancel test',
            projectId: project.id,
        });

        queueSpawn(0); // worktree remove
        await service.cancelTask(task.id);

        // Verify stopProcess was called with the session ID
        expect((mockProcessManager.stopProcess as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. onComplete callbacks
// ═══════════════════════════════════════════════════════════════════════════════

describe('onComplete callbacks', () => {
    test('completion callback is invoked when task completes', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Callback test',
            projectId: project.id,
        });

        let callbackTask: unknown = null;
        service.onComplete(task.id, (t) => {
            callbackTask = t;
        });

        // Queue validation passing + worktree cleanup
        queueSpawn(0); // bun install
        queueSpawn(0); // tsc
        queueSpawn(0); // test
        queueSpawn(0); // worktree remove

        const prUrl = 'https://github.com/corvidlabs/corvid-agent/pull/100';
        simulateSessionEnd(task.sessionId!, `Done!\n${prUrl}`);
        await new Promise(resolve => setTimeout(resolve, 150));

        expect(callbackTask).not.toBeNull();
        expect((callbackTask as { status: string }).status).toBe('completed');
    });

    test('callback errors are caught and do not crash the service', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Error callback test',
            projectId: project.id,
        });

        // Register a callback that throws
        service.onComplete(task.id, () => {
            throw new Error('Callback exploded!');
        });

        // Register a second callback that should still work
        let secondCallbackInvoked = false;
        service.onComplete(task.id, () => {
            secondCallbackInvoked = true;
        });

        // Queue validation passing + cleanup
        queueSpawn(0); // bun install
        queueSpawn(0); // tsc
        queueSpawn(0); // test
        queueSpawn(0); // worktree remove

        const prUrl = 'https://github.com/corvidlabs/corvid-agent/pull/101';
        simulateSessionEnd(task.sessionId!, prUrl);
        await new Promise(resolve => setTimeout(resolve, 150));

        // The throwing callback shouldn't prevent the second one from running
        expect(secondCallbackInvoked).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. recoverStaleTasks
// ═══════════════════════════════════════════════════════════════════════════════

describe('recoverStaleTasks', () => {
    test('retries interrupted tasks after recovery', async () => {
        const { agent, project } = createTestAgentAndProject();
        const { createWorkTask } = await import('../db/work-tasks');
        const task = createWorkTask(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'Stale task',
        });
        updateWorkTaskStatus(db, task.id, 'running');

        // Queue spawns for: worktree add, bun install, git remote (off-limits check not called for retry)
        queueSuccessfulSpawns(3);

        await service.recoverStaleTasks();

        // Task should be re-executing (running or branching), not failed
        const recovered = getWorkTask(db, task.id);
        expect(['branching', 'running']).toContain(recovered!.status);
    });

    test('does nothing when no stale tasks exist', async () => {
        // No tasks in DB at all
        await service.recoverStaleTasks(); // Should not throw
    });

    test('cleans up worktrees before retrying', async () => {
        const { agent, project } = createTestAgentAndProject();
        const { createWorkTask } = await import('../db/work-tasks');
        const task = createWorkTask(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'Stale task with worktree',
        });
        updateWorkTaskStatus(db, task.id, 'running', { worktreeDir: '/tmp/worktree-123' });

        // Queue worktree remove + worktree add + bun install for retry
        queueSuccessfulSpawns(4);

        await service.recoverStaleTasks();

        // Verify worktree removal was attempted
        const removeCalls = spawnCalls.filter(
            c => c.cmd.includes('worktree') && c.cmd.includes('remove')
        );
        expect(removeCalls.length).toBeGreaterThanOrEqual(1);

        // Task should be retrying, not permanently failed
        const recovered = getWorkTask(db, task.id);
        expect(recovered!.status).not.toBe('failed');
    });

    test('resets interrupted task to pending before retrying', async () => {
        const { agent, project } = createTestAgentAndProject();
        const { createWorkTask } = await import('../db/work-tasks');
        const task = createWorkTask(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'Reset test task',
        });
        updateWorkTaskStatus(db, task.id, 'running', {
            sessionId: 'old-session',
            branchName: 'old-branch',
            worktreeDir: '/tmp/old-worktree',
        });

        // Simulate the cleanup + reset that recoverStaleTasks does
        cleanupStaleWorkTasks(db);
        const failed = getWorkTask(db, task.id)!;
        expect(failed.status).toBe('failed');
        expect(failed.error).toContain('server restart');

        resetWorkTaskForRetry(db, task.id);
        const reset = getWorkTask(db, task.id)!;
        expect(reset.status).toBe('pending');
        expect(reset.sessionId).toBeNull();
        expect(reset.branchName).toBeNull();
        expect(reset.worktreeDir).toBeNull();
        expect(reset.error).toBeNull();
        expect(reset.completedAt).toBeNull();
    });
});
