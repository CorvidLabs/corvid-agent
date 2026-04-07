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
import { getWorkTask, updateWorkTaskStatus } from '../db/work-tasks';
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
        queueSpawn(0); // bun x tsc --noEmit
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
        queueSpawn(0); // bun x tsc
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
