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

function queueSuccessfulSpawns(count: number) {
    for (let i = 0; i < count; i++) {
        spawnResults.push({ exitCode: 0, stdout: '', stderr: '' });
    }
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

// ─── Governance impact classification ────────────────────────────────────────

describe('governance impact classification', () => {
    // Pre-flight governance check is ADVISORY only (issue #1766).
    // Tasks that mention protected files in their description are NOT blocked at creation
    // time — they proceed and the real enforcement happens in validation.ts on the git diff.
    // This prevents false positives where a task description mentions a protected file
    // without actually needing to modify it.

    test('does not block task referencing Layer 0 file in description (governance.ts)', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Refactor server/councils/governance.ts to add new tier',
            projectId: project.id,
        });

        // Pre-flight is advisory — task proceeds; governance enforced on actual git diff
        expect(task.status).not.toBe('failed');
    });

    test('does not block task referencing Layer 0 file in description (spending.ts via substring)', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Modify server/algochat/spending.ts limits',
            projectId: project.id,
        });

        // Pre-flight is advisory — task proceeds; governance enforced on actual git diff
        expect(task.status).not.toBe('failed');
    });

    test('allows task referencing Layer 1 file (proceeds with governance warning)', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Update server/db/migrations/077_foo.sql for new column',
            projectId: project.id,
        });

        expect(task.status).not.toBe('failed');
    });

    test('allows task with no file path references', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Fix the login bug in the auth flow',
            projectId: project.id,
        });

        expect(task.status).not.toBe('failed');
    });

    test('does not block task referencing protected-paths.ts in description (Layer 0 substring)', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Update server/process/protected-paths.ts to add new path',
            projectId: project.id,
        });

        // Pre-flight is advisory — task proceeds; governance enforced on actual git diff
        expect(task.status).not.toBe('failed');
    });

    test('allows task referencing Layer 1 file schema.ts in description (issue #1766)', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Add new column to server/db/schema.ts for feature X',
            projectId: project.id,
        });

        // schema.ts is Layer 1 (was falsely Layer 0), and pre-flight is advisory
        expect(task.status).not.toBe('failed');
    });

    test('allows task referencing Layer 2 file (server/routes/analytics.ts)', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const project = createProject(db, { name: 'P', workingDir: '/tmp/p' });
        queueSuccessfulSpawns(2);

        const task = await service.create({
            agentId: agent.id,
            description: 'Add new endpoint in server/routes/analytics.ts',
            projectId: project.id,
        });

        expect(task.status).not.toBe('failed');
    });
});
