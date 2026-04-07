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
import { getWorkTask } from '../db/work-tasks';
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
        // Queue: git remote check (success), git worktree add (success), bun install --frozen-lockfile (FAIL), bun install (success)
        queueSpawn(0);  // git remote get-url origin (off-limits check)
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
        // Queue: git remote check (ok), worktree (ok), frozen-lockfile (fail), retry (also fail)
        queueSpawn(0);  // git remote get-url origin (off-limits check)
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
        (Bun.spawn as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void }).mockImplementation((...args: unknown[]) => {
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
// 11. Validation install retry during runValidation
// ═══════════════════════════════════════════════════════════════════════════════

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
