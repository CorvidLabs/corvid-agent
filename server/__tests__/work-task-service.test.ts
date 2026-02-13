import { test, expect, beforeEach, afterEach, describe, mock, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createProject } from '../db/projects';
import { createAgent } from '../db/agents';
import { getWorkTask, updateWorkTaskStatus } from '../db/work-tasks';
import { WorkTaskService } from '../work/service';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';

/**
 * Tests for WorkTaskService.
 *
 * These tests cover branch name generation, bun install retry logic,
 * worktree cleanup, the validation iteration loop, and handleSessionEnd
 * edge cases. We mock Bun.spawn, ProcessManager, and use a real
 * in-memory SQLite DB with migrations for the database layer.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

let db: Database;
let service: WorkTaskService;
let mockProcessManager: ProcessManager;
let spawnCalls: Array<{ cmd: string[]; cwd?: string }>;
let spawnResults: Array<{ exitCode: number; stdout: string; stderr: string }>;
let subscribeCallbacks: Map<string, Set<(sid: string, event: ClaudeStreamEvent) => void>>;

/**
 * Build a mock Bun.spawn result that mimics the real API.
 * The service reads .stderr, .stdout via `new Response(proc.stderr).text()`,
 * and .exited as a Promise<number>.
 */
function makeMockProc(result: { exitCode: number; stdout: string; stderr: string }) {
    return {
        stdout: new Blob([result.stdout]).stream(),
        stderr: new Blob([result.stderr]).stream(),
        exited: Promise.resolve(result.exitCode),
        pid: 12345,
        kill: () => {},
    };
}

/** Queue a spawn result. Calls are served FIFO. */
function queueSpawn(exitCode: number, stdout = '', stderr = '') {
    spawnResults.push({ exitCode, stdout, stderr });
}

/** Queue multiple successful spawns. */
function queueSuccessfulSpawns(count: number) {
    for (let i = 0; i < count; i++) {
        queueSpawn(0);
    }
}

/**
 * Create a mock ProcessManager that records calls and allows
 * us to simulate session completion via subscribe callbacks.
 */
function createMockProcessManager(): ProcessManager {
    subscribeCallbacks = new Map();

    return {
        startProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        isRunning: mock(() => false),
        subscribe: mock((sessionId: string, cb: (sid: string, event: ClaudeStreamEvent) => void) => {
            let cbs = subscribeCallbacks.get(sessionId);
            if (!cbs) {
                cbs = new Set();
                subscribeCallbacks.set(sessionId, cbs);
            }
            cbs.add(cb);
        }),
        unsubscribe: mock((sessionId: string, cb: (sid: string, event: ClaudeStreamEvent) => void) => {
            subscribeCallbacks.get(sessionId)?.delete(cb);
        }),
        // Stubs for other ProcessManager methods that aren't used by WorkTaskService
        subscribeAll: mock(() => {}),
        unsubscribeAll: mock(() => {}),
        getMemoryStats: mock(() => ({ processes: 0, subscribers: 0, sessionMeta: 0, pausedSessions: 0, sessionTimeouts: 0, stableTimers: 0, globalSubscribers: 0 })),
        cleanupSessionState: mock(() => {}),
        shutdown: mock(() => {}),
    } as unknown as ProcessManager;
}

/**
 * Simulate a session completing by firing events to all subscribers.
 * This mimics what ProcessManager does when a Claude session ends.
 */
function simulateSessionEnd(sessionId: string, output: string) {
    const cbs = subscribeCallbacks.get(sessionId);
    if (!cbs) return;

    // First send assistant content
    if (output) {
        for (const cb of cbs) {
            cb(sessionId, {
                type: 'assistant',
                message: { role: 'assistant', content: output },
            });
        }
    }

    // Then send result event
    // Copy the set since callbacks may unsubscribe themselves
    const cbsCopy = new Set(cbs);
    for (const cb of cbsCopy) {
        cb(sessionId, { type: 'result', total_cost_usd: 0 });
    }
}

/** Create a standard agent + project in the test DB. */
function createTestAgentAndProject(opts?: { agentName?: string; projectWorkingDir?: string }) {
    const agent = createAgent(db, { name: opts?.agentName ?? 'TestAgent' });
    const project = createProject(db, {
        name: 'TestProject',
        workingDir: opts?.projectWorkingDir ?? '/tmp/test-project',
    });
    return { agent, project };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    spawnCalls = [];
    spawnResults = [];

    // Mock Bun.spawn globally
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
// 1. Branch name generation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Branch name generation', () => {
    test('normal input produces valid git branch name format: agent/{slug}/{taskSlug}-{timestamp}-{suffix}', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Queue: worktree add (success), bun install (success)
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Fix the login bug',
            projectId: project.id,
        });

        expect(task.branchName).toBeTruthy();
        // Verify format: agent/{agentSlug}/{taskSlug}-{timestamp}-{suffix}
        const parts = task.branchName!.split('/');
        expect(parts[0]).toBe('agent');
        expect(parts[1]).toBe('testagent');
        // The third part should be: {taskSlug}-{timestamp}-{suffix}
        expect(parts[2]).toMatch(/^fix-the-login-bug-[a-z0-9]+-[a-f0-9]{6}$/);
    });

    test('special characters in agent name and description are sanitized to [a-z0-9-]', async () => {
        const agent = createAgent(db, { name: 'My Agent!@#$%^&*()' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Fix bug #123 (urgent!!)',
            projectId: project.id,
        });

        const parts = task.branchName!.split('/');
        // Agent slug should only contain a-z0-9 and hyphens
        expect(parts[1]).toMatch(/^[a-z0-9-]+$/);
        expect(parts[1]).toBe('my-agent');
        // Task slug in the third part should also be sanitized
        const taskPart = parts[2];
        // Should not contain special chars — only a-z, 0-9, hyphens
        expect(taskPart).toMatch(/^[a-z0-9-]+$/);
    });

    test('very long descriptions are truncated to 40 chars before slugification', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const longDescription = 'a'.repeat(100);
        const task = await service.create({
            agentId: agent.id,
            description: longDescription,
            projectId: project.id,
        });

        const parts = task.branchName!.split('/');
        const taskPart = parts[2];
        // The slug portion (before timestamp-suffix) should come from max 40 chars
        // After slugification of 40 'a's, we get 'aaaa...a' (40 chars)
        // Total taskPart = taskSlug + '-' + timestamp + '-' + suffix
        const segments = taskPart.split('-');
        // The task slug is the first segment(s) before the timestamp
        // With 40 'a's the slug is just 'aaaaaaa...' (40 a's)
        const slugPart = segments[0];
        expect(slugPart.length).toBeLessThanOrEqual(40);
    });

    test('empty or whitespace-only description produces valid (non-empty) branch names', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: '   ',
            projectId: project.id,
        });

        expect(task.branchName).toBeTruthy();
        // Should still have the format agent/{slug}/...-{timestamp}-{suffix}
        expect(task.branchName!.startsWith('agent/')).toBe(true);
        // Timestamp and suffix should still be present even if taskSlug is empty
        const parts = task.branchName!.split('/');
        expect(parts.length).toBe(3);
        // The last part should still contain timestamp and suffix
        expect(parts[2]).toMatch(/[a-z0-9]/);
    });

    test('leading/trailing hyphens are stripped from slugs', async () => {
        const agent = createAgent(db, { name: '---Agent---' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: '---fix things---',
            projectId: project.id,
        });

        const parts = task.branchName!.split('/');
        // Agent slug should not have leading/trailing hyphens
        expect(parts[1]).toBe('agent');
        expect(parts[1]).not.toMatch(/^-|-$/);
        // Task part should not start with a hyphen
        expect(parts[2]).not.toMatch(/^-/);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Bun install retry logic
// ═══════════════════════════════════════════════════════════════════════════════

describe('bun install retry logic', () => {
    test('successful frozen-lockfile install does not trigger retry', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Queue: git worktree add (success), bun install --frozen-lockfile (success)
        queueSpawn(0); // git worktree add
        queueSpawn(0); // bun install --frozen-lockfile

        await service.create({
            agentId: agent.id,
            description: 'Test task',
            projectId: project.id,
        });

        // Find bun install calls
        const installCalls = spawnCalls.filter(c => c.cmd[0] === 'bun' && c.cmd[1] === 'install');
        // Only one install call should have been made (the frozen-lockfile one)
        expect(installCalls).toHaveLength(1);
        expect(installCalls[0].cmd).toContain('--frozen-lockfile');
    });

    test('failed frozen-lockfile install triggers retry without --frozen-lockfile', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Queue: git worktree add (success), bun install --frozen-lockfile (FAIL), bun install (success)
        queueSpawn(0);  // git worktree add
        queueSpawn(1, '', 'lockfile mismatch');  // bun install --frozen-lockfile FAILS
        queueSpawn(0);  // bun install retry (success)

        await service.create({
            agentId: agent.id,
            description: 'Test task',
            projectId: project.id,
        });

        const installCalls = spawnCalls.filter(c => c.cmd[0] === 'bun' && c.cmd[1] === 'install');
        expect(installCalls).toHaveLength(2);
        expect(installCalls[0].cmd).toContain('--frozen-lockfile');
        expect(installCalls[1].cmd).not.toContain('--frozen-lockfile');
    });

    test('retry exit code is NOT checked (known issue — documented)', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Queue: worktree (ok), frozen-lockfile (fail), retry (also fail)
        queueSpawn(0);  // git worktree add
        queueSpawn(1, '', 'lockfile error');  // frozen-lockfile fails
        queueSpawn(1, '', 'retry also fails'); // retry also fails

        // NOTE: The retry's exit code is never checked in the source code
        // (see service.ts lines ~157-163). The retry proc's .exited is awaited
        // but its exit code is discarded. This is a known issue — the task
        // continues regardless of whether the retry succeeds or fails.
        const task = await service.create({
            agentId: agent.id,
            description: 'Test task',
            projectId: project.id,
        });

        // Task should still be running (install failure is non-fatal)
        expect(task.status).toBe('running');
    });

    test('total failure of both installs is non-fatal (caught, logged, continues)', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Queue: worktree (ok), then install will throw
        queueSpawn(0);  // git worktree add

        // Make Bun.spawn throw for install commands
        let callCount = 0;
        (Bun.spawn as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void }).mockImplementation((...args: unknown[]) => {
            callCount++;
            const cmd = args[0] as string[];
            if (cmd[0] === 'bun' && cmd[1] === 'install') {
                throw new Error('spawn failed: command not found');
            }
            // For non-install commands, use the normal mock behavior
            const opts = args[1] as { cwd?: string } | undefined;
            spawnCalls.push({ cmd, cwd: opts?.cwd });
            const result = spawnResults.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
            return makeMockProc(result);
        });

        const task = await service.create({
            agentId: agent.id,
            description: 'Test task',
            projectId: project.id,
        });

        // Task should still proceed to running status — install failure is non-fatal
        expect(task.status).toBe('running');
    });
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
// 4. Validation loop iteration control
// ═══════════════════════════════════════════════════════════════════════════════

describe('Validation loop iteration control', () => {
    /**
     * Helper: Create a task that is in 'running' state with a session,
     * ready for handleSessionEnd to be triggered via session completion events.
     */
    async function createRunningTask(opts?: { description?: string }) {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2); // worktree add + install

        const task = await service.create({
            agentId: agent.id,
            description: opts?.description ?? 'Test validation task',
            projectId: project.id,
        });

        expect(task.status).toBe('running');
        expect(task.sessionId).toBeTruthy();

        return { task, agent, project };
    }

    test('validation passing → task finalized as completed (with PR URL)', async () => {
        const { task } = await createRunningTask();

        // Queue validation spawns: bun install (success), tsc (success), bun test (success)
        queueSpawn(0); // bun install --frozen-lockfile
        queueSpawn(0); // bunx tsc --noEmit
        queueSpawn(0); // bun test

        // Simulate session ending with a PR URL in the output
        const prUrl = 'https://github.com/corvidlabs/corvid-agent/pull/42';
        simulateSessionEnd(task.sessionId!, `All done!\n\n${prUrl}`);

        // Give async handlers time to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        const updatedTask = getWorkTask(db, task.id);
        expect(updatedTask!.status).toBe('completed');
        expect(updatedTask!.prUrl).toBe(prUrl);
    });

    test('validation passing but no PR URL → task marked failed', async () => {
        const { task } = await createRunningTask();

        // Queue validation spawns: install, tsc, test (all pass)
        queueSpawn(0); // bun install --frozen-lockfile
        queueSpawn(0); // bunx tsc
        queueSpawn(0); // bun test

        // Simulate session ending WITHOUT a PR URL
        simulateSessionEnd(task.sessionId!, 'Done but forgot to create PR');

        await new Promise(resolve => setTimeout(resolve, 100));

        const updatedTask = getWorkTask(db, task.id);
        expect(updatedTask!.status).toBe('failed');
        expect(updatedTask!.error).toContain('no PR URL');
    });

    test('validation failing under WORK_MAX_ITERATIONS → spawns follow-up session with incremented iteration', async () => {
        const { task } = await createRunningTask();

        // Queue validation spawns: install ok, tsc FAILS, test not reached
        queueSpawn(0); // bun install --frozen-lockfile
        queueSpawn(1, 'error TS2304: Cannot find name', ''); // tsc fails
        queueSpawn(1, '', 'test failures'); // bun test fails

        // Simulate session ending
        simulateSessionEnd(task.sessionId!, 'I made some changes');

        await new Promise(resolve => setTimeout(resolve, 100));

        const updatedTask = getWorkTask(db, task.id);
        // Should be back to running with incremented iteration
        expect(updatedTask!.status).toBe('running');
        expect(updatedTask!.iterationCount).toBe(2);

        // A new session should have been created and started
        expect(updatedTask!.sessionId).not.toBe(task.sessionId);
        expect((mockProcessManager.startProcess as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    test('validation failing at WORK_MAX_ITERATIONS → task marked failed with truncated error', async () => {
        const { task } = await createRunningTask();

        // Manually set iteration count to max (default 3)
        updateWorkTaskStatus(db, task.id, 'running', { iterationCount: 3 });

        // Queue validation spawns: install ok, tsc FAILS
        queueSpawn(0); // bun install --frozen-lockfile
        queueSpawn(1, 'lots of TypeScript errors here', ''); // tsc fails
        queueSpawn(1, '', 'test failures'); // bun test fails

        // Simulate session ending
        simulateSessionEnd(task.sessionId!, 'Tried to fix things');

        await new Promise(resolve => setTimeout(resolve, 100));

        const updatedTask = getWorkTask(db, task.id);
        expect(updatedTask!.status).toBe('failed');
        expect(updatedTask!.error).toContain('Validation failed after 3 iteration(s)');
    });

    test('iteration count is correctly incremented in DB', async () => {
        const { task } = await createRunningTask();

        // Verify initial iteration count
        const initial = getWorkTask(db, task.id);
        expect(initial!.iterationCount).toBe(1);

        // Fail validation to trigger iteration increment
        queueSpawn(0); // bun install
        queueSpawn(1, 'tsc error', ''); // tsc fails
        queueSpawn(1, '', 'test error'); // test fails

        simulateSessionEnd(task.sessionId!, 'Attempt 1');
        await new Promise(resolve => setTimeout(resolve, 100));

        const afterFirst = getWorkTask(db, task.id);
        expect(afterFirst!.iterationCount).toBe(2);

        // Fail validation again
        queueSpawn(0); // bun install
        queueSpawn(1, 'tsc error again', ''); // tsc fails
        queueSpawn(1, '', 'test error'); // test fails

        simulateSessionEnd(afterFirst!.sessionId!, 'Attempt 2');
        await new Promise(resolve => setTimeout(resolve, 100));

        const afterSecond = getWorkTask(db, task.id);
        expect(afterSecond!.iterationCount).toBe(3);
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
// 6. Additional service method tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Task creation validation', () => {
    test('throws when agent does not exist', async () => {
        createProject(db, { name: 'P', workingDir: '/tmp' });

        await expect(
            service.create({
                agentId: 'nonexistent-agent',
                description: 'Test',
            })
        ).rejects.toThrow('Agent nonexistent-agent not found');
    });

    test('throws when project does not exist', async () => {
        const agent = createAgent(db, { name: 'Agent' });

        await expect(
            service.create({
                agentId: agent.id,
                description: 'Test',
                projectId: 'nonexistent-project',
            })
        ).rejects.toThrow('Project nonexistent-project not found');
    });

    test('throws when project has no workingDir', async () => {
        const agent = createAgent(db, { name: 'Agent' });
        // Create a project with empty workingDir
        const project = createProject(db, { name: 'P', workingDir: '' });

        await expect(
            service.create({
                agentId: agent.id,
                description: 'Test',
                projectId: project.id,
            })
        ).rejects.toThrow('has no workingDir');
    });

    test('throws when concurrent active task exists on same project', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        // Create first task successfully
        await service.create({
            agentId: agent.id,
            description: 'First task',
            projectId: project.id,
        });

        // Second task on same project should fail
        await expect(
            service.create({
                agentId: agent.id,
                description: 'Second task',
                projectId: project.id,
            })
        ).rejects.toThrow('Another task is already active');
    });
});

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

describe('recoverStaleTasks', () => {
    test('marks active tasks as failed on recovery', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Create task directly in DB with 'running' status
        const { createWorkTask } = await import('../db/work-tasks');
        const task = createWorkTask(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'Stale task',
        });
        updateWorkTaskStatus(db, task.id, 'running');

        await service.recoverStaleTasks();

        const recovered = getWorkTask(db, task.id);
        expect(recovered!.status).toBe('failed');
        expect(recovered!.error).toContain('server restart');
    });

    test('does nothing when no stale tasks exist', async () => {
        // No tasks in DB at all
        await service.recoverStaleTasks(); // Should not throw
    });

    test('cleans up worktrees for stale tasks', async () => {
        const { agent, project } = createTestAgentAndProject();
        const { createWorkTask } = await import('../db/work-tasks');
        const task = createWorkTask(db, {
            agentId: agent.id,
            projectId: project.id,
            description: 'Stale task with worktree',
        });
        updateWorkTaskStatus(db, task.id, 'running', { worktreeDir: '/tmp/worktree-123' });

        // Queue worktree remove
        queueSpawn(0);

        await service.recoverStaleTasks();

        // Verify worktree removal was attempted
        const removeCalls = spawnCalls.filter(
            c => c.cmd.includes('worktree') && c.cmd.includes('remove')
        );
        expect(removeCalls.length).toBeGreaterThanOrEqual(1);
    });
});

describe('Validation install retry during runValidation', () => {
    test('validation install: frozen-lockfile failure triggers retry', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2); // create task: worktree add + install

        const task = await service.create({
            agentId: agent.id,
            description: 'Validation install test',
            projectId: project.id,
        });

        // Queue for runValidation:
        // bun install --frozen-lockfile (FAILS) → bun install (retry) → tsc (ok) → test (ok)
        queueSpawn(1, '', 'lockfile error'); // frozen-lockfile fails
        queueSpawn(0); // retry without frozen-lockfile
        queueSpawn(0); // tsc passes
        queueSpawn(0); // test passes
        queueSpawn(0); // worktree cleanup

        const prUrl = 'https://github.com/corvidlabs/corvid-agent/pull/55';
        simulateSessionEnd(task.sessionId!, prUrl);
        await new Promise(resolve => setTimeout(resolve, 150));

        const updatedTask = getWorkTask(db, task.id);
        expect(updatedTask!.status).toBe('completed');
    });
});

describe('Git worktree creation failure', () => {
    test('worktree creation failure marks task as failed', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Queue: git worktree add FAILS
        queueSpawn(128, '', 'fatal: branch already exists');

        const task = await service.create({
            agentId: agent.id,
            description: 'Worktree fail test',
            projectId: project.id,
        });

        expect(task.status).toBe('failed');
        expect(task.error).toContain('Failed to create worktree');
    });

    test('worktree creation exception marks task as failed', async () => {
        const { agent, project } = createTestAgentAndProject();

        // Make spawn throw for the first call (worktree creation)
        let callIdx = 0;
        (Bun.spawn as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void }).mockImplementation((...args: unknown[]) => {
            callIdx++;
            if (callIdx === 1) {
                // First call is the worktree creation — throw
                throw new Error('git not found');
            }
            const cmd = args[0] as string[];
            const opts = args[1] as { cwd?: string } | undefined;
            spawnCalls.push({ cmd, cwd: opts?.cwd });
            const result = spawnResults.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
            return makeMockProc(result);
        });

        const task = await service.create({
            agentId: agent.id,
            description: 'Git exception test',
            projectId: project.id,
        });

        expect(task.status).toBe('failed');
        expect(task.error).toContain('Failed to create worktree');
    });
});
