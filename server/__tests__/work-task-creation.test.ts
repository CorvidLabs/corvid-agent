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
import { WorkTaskService } from '../work/service';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { makeMockProc, createMockProcessManager } from './work-task-test-helpers';

let db: Database;
let service: WorkTaskService;
let mockProcessManager: ProcessManager;
let spawnCalls: Array<{ cmd: string[]; cwd?: string }>;
let spawnResults: Array<{ exitCode: number; stdout: string; stderr: string }>;
let subscribeCallbacks: Map<string, Set<(sid: string, event: ClaudeStreamEvent) => void>>;

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
// 6. Task creation validation
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

    test('queues task when concurrent active task exists on same project', async () => {
        const { agent, project } = createTestAgentAndProject();
        queueSuccessfulSpawns(2);

        // Create first task successfully
        const first = await service.create({
            agentId: agent.id,
            description: 'First task',
            projectId: project.id,
        });

        // Second task on same project should be queued, not rejected
        const second = await service.create({
            agentId: agent.id,
            description: 'Second task',
            projectId: project.id,
        });

        expect(first.status).toBe('running');
        expect(second.status).toBe('queued');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Git worktree creation failure
// ═══════════════════════════════════════════════════════════════════════════════

describe('Git worktree creation failure', () => {
    test('worktree creation failure marks task as failed', async () => {
        const { agent, project } = createTestAgentAndProject();
        // Queue: git remote check (ok), git worktree add FAILS
        queueSpawn(0);  // git remote get-url origin (off-limits check)
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

        // Make spawn throw for the second call (worktree creation)
        // First call is git remote get-url origin (off-limits check)
        let callIdx = 0;
        (Bun.spawn as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void }).mockImplementation((...args: unknown[]) => {
            callIdx++;
            if (callIdx === 2) {
                // Second call is the worktree creation — throw
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
