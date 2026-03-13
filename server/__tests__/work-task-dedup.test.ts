/**
 * Unit tests for work task deduplication (bug #974).
 *
 * Covers:
 *  (a) Task allowed when no existing PR or active work task exists for the issue
 *  (b) Task rejected when an active work task already exists for the same issue
 *  (c) Task rejected when an open PR already addresses the same issue
 */

import { test, expect, beforeEach, afterEach, describe, mock, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createProject } from '../db/projects';
import { createAgent } from '../db/agents';
import { createWorkTask, updateWorkTaskStatus } from '../db/work-tasks';
import { WorkTaskService } from '../work/service';
import { ConflictError } from '../lib/errors';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';

// ─── Mock helpers ──────────────────────────────────────────────────────────────

let db: Database;
let service: WorkTaskService;
let spawnResults: Array<{ exitCode: number; stdout: string; stderr: string }>;

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

function createMockProcessManager(): ProcessManager {
    return {
        startProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        isRunning: mock(() => false),
        subscribe: mock((_sessionId: string, _cb: (sid: string, event: ClaudeStreamEvent) => void) => {}),
        unsubscribe: mock((_sessionId: string, _cb: (sid: string, event: ClaudeStreamEvent) => void) => {}),
        subscribeAll: mock(() => {}),
        unsubscribeAll: mock(() => {}),
        getMemoryStats: mock(() => ({ processes: 0, subscribers: 0, sessionMeta: 0, pausedSessions: 0, sessionTimeouts: 0, stableTimers: 0, globalSubscribers: 0 })),
        cleanupSessionState: mock(() => {}),
        shutdown: mock(() => {}),
    } as unknown as ProcessManager;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    spawnResults = [];

    spyOn(Bun, 'spawn').mockImplementation((..._args: unknown[]) => {
        const result = spawnResults.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
        return makeMockProc(result) as ReturnType<typeof Bun.spawn>;
    });

    service = new WorkTaskService(db, createMockProcessManager());
});

afterEach(() => {
    db.close();
    mock.restore();
    delete process.env.GH_TOKEN;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createAgentAndProject(projectDir = '/tmp/dedup-test-project') {
    const agent = createAgent(db, { name: 'DedupAgent' });
    const project = createProject(db, { name: 'DedupProject', workingDir: projectDir });
    return { agent, project };
}

/** Insert a task directly in DB (bypassing service) and set it to a given status. */
function seedTask(agentId: string, projectId: string, description: string, status: string) {
    const task = createWorkTask(db, { agentId, projectId, description, source: 'agent' });
    if (status !== 'pending') {
        updateWorkTaskStatus(db, task.id, status as any);
    }
    return task;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Work task deduplication', () => {
    describe('(a) task allowed when no conflict exists', () => {
        test('creates task when no active tasks or open PRs for the issue', async () => {
            const { agent, project } = createAgentAndProject();

            // Spawn queue: git remote get-url origin (no github remote), worktree add, bun install
            queueSpawn(1, '', 'no remote'); // git remote fails → repoSlug = null
            queueSpawn(0); // git worktree add
            queueSpawn(0); // bun install

            const task = await service.create({
                agentId: agent.id,
                description: 'Fix issue #99',
                projectId: project.id,
                issueRef: { repo: 'owner/repo', number: 99 },
            });

            expect(task.status).toMatch(/^(pending|queued|branching|running)$/);
        });

        test('creates task when issueRef not provided (no dedup attempted)', async () => {
            const { agent, project } = createAgentAndProject();

            queueSpawn(1, '', 'no remote'); // git remote get-url origin
            queueSpawn(0); // worktree add
            queueSpawn(0); // bun install

            const task = await service.create({
                agentId: agent.id,
                description: 'General task with no issue reference',
                projectId: project.id,
            });

            expect(task.id).toBeTruthy();
        });
    });

    describe('(b) task rejected when active work task already exists for same issue', () => {
        test('rejects via issueRef when running task exists referencing the same issue number', async () => {
            const { agent, project } = createAgentAndProject();

            // Seed an existing running task that references #3
            seedTask(agent.id, project.id, 'Fix protocol-algochat issue #3', 'running');

            // Queue git remote spawn (happens before dedup check)
            queueSpawn(0, 'https://github.com/corvidlabs/protocol-algochat.git');

            await expect(
                service.create({
                    agentId: agent.id,
                    description: 'Another attempt at issue #3',
                    projectId: project.id,
                    issueRef: { repo: 'corvidlabs/protocol-algochat', number: 3 },
                }),
            ).rejects.toBeInstanceOf(ConflictError);
        });

        test('error message names the issue number', async () => {
            const { agent, project } = createAgentAndProject();

            seedTask(agent.id, project.id, 'Implement feature #42', 'running');
            queueSpawn(0, 'https://github.com/owner/repo.git');

            await expect(
                service.create({
                    agentId: agent.id,
                    description: 'Fix #42',
                    projectId: project.id,
                    issueRef: { repo: 'owner/repo', number: 42 },
                }),
            ).rejects.toMatchObject({ message: expect.stringContaining('#42') });
        });

        test('rejects when pending task references same issue (description parsing path)', async () => {
            const { agent, project } = createAgentAndProject();

            // No issueRef — dedup falls back to description parsing
            seedTask(agent.id, project.id, 'Fix bug #7 in utils', 'pending');
            queueSpawn(1, '', 'fatal: not a git repository'); // git remote fails

            await expect(
                service.create({
                    agentId: agent.id,
                    description: 'Fix bug #7 again',
                    projectId: project.id,
                }),
            ).rejects.toBeInstanceOf(ConflictError);
        });

        test('allows task when no tasks exist for that issue number', async () => {
            const { agent, project } = createAgentAndProject();

            // Seed a task for a DIFFERENT issue on a different project
            const project2 = createProject(db, { name: 'OtherProject', workingDir: '/tmp/other-project' });
            seedTask(agent.id, project2.id, 'Fix issue #5', 'running');

            // Creating a task for issue #6 on a clean project — should not be blocked
            queueSpawn(1, '', 'no remote'); // git remote fails → repoSlug = null
            queueSpawn(0); // worktree add
            queueSpawn(0); // bun install

            const task = await service.create({
                agentId: agent.id,
                description: 'Fix issue #6',
                projectId: project.id,
                issueRef: { repo: 'owner/repo', number: 6 },
            });

            expect(task.id).toBeTruthy();
            expect(task.status).toMatch(/^(pending|queued|branching|running)$/);
        });
    });

    describe('(c) task rejected when open PR already addresses the issue', () => {
        test('rejects when GitHub reports an open PR referencing the issue', async () => {
            const { agent, project } = createAgentAndProject();

            // No active tasks in DB for #5
            // Set GH_TOKEN so the GitHub check runs
            process.env.GH_TOKEN = 'test-token';

            // Spawn queue:
            // 1. git remote get-url origin → returns a github URL
            // 2. gh pr list → returns a PR that closes #5
            queueSpawn(0, 'https://github.com/corvidlabs/protocol-algochat.git');
            queueSpawn(0, JSON.stringify([{
                number: 5,
                title: 'Fix something',
                url: 'https://github.com/corvidlabs/protocol-algochat/pull/5',
                author: { login: 'corvid-agent' },
                state: 'open',
                headRefName: 'fix-branch',
                baseRefName: 'main',
                body: 'Closes #5\n\nThis fixes the issue.',
                createdAt: '2026-03-10T00:00:00Z',
                additions: 10,
                deletions: 2,
                changedFiles: 1,
            }]));

            await expect(
                service.create({
                    agentId: agent.id,
                    description: 'Fix protocol-algochat issue #5',
                    projectId: project.id,
                    issueRef: { repo: 'corvidlabs/protocol-algochat', number: 5 },
                }),
            ).rejects.toBeInstanceOf(ConflictError);
        });

        test('allows task creation when GitHub returns no matching open PRs', async () => {
            const { agent, project } = createAgentAndProject();

            process.env.GH_TOKEN = 'test-token';

            // 1. git remote get-url origin
            queueSpawn(0, 'https://github.com/owner/repo.git');
            // 2. gh pr list → empty array (no open PRs for this issue)
            queueSpawn(0, JSON.stringify([]));
            // 3. git worktree add
            queueSpawn(0);
            // 4. bun install
            queueSpawn(0);

            const task = await service.create({
                agentId: agent.id,
                description: 'Fix owner/repo issue #10',
                projectId: project.id,
                issueRef: { repo: 'owner/repo', number: 10 },
            });

            expect(task.id).toBeTruthy();
            expect(task.status).toMatch(/^(pending|queued|branching|running)$/);
        });

        test('proceeds when GitHub check fails (non-fatal)', async () => {
            const { agent, project } = createAgentAndProject();

            process.env.GH_TOKEN = 'test-token';

            // 1. git remote get-url origin
            queueSpawn(0, 'https://github.com/owner/repo.git');
            // 2. gh pr list → error exit
            queueSpawn(1, '', 'API error');
            // 3. git worktree add
            queueSpawn(0);
            // 4. bun install
            queueSpawn(0);

            // GitHub failure is non-fatal — task should still be created
            const task = await service.create({
                agentId: agent.id,
                description: 'Fix #20',
                projectId: project.id,
                issueRef: { repo: 'owner/repo', number: 20 },
            });

            expect(task.id).toBeTruthy();
        });
    });
});
