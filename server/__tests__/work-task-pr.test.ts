import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

// Restore the REAL worktree module — other test files use mock.module() for
// ../lib/worktree and in Bun 1.x the mock leaks across files. The real module
// calls Bun.spawn which this file already intercepts via spyOn(Bun, 'spawn').
import { dirname, resolve } from 'node:path';

mock.module('../lib/worktree', () => ({
  getWorktreeBaseDir: (projectWorkingDir: string) =>
    process.env.WORKTREE_BASE_DIR ?? resolve(dirname(projectWorkingDir), '.corvid-worktrees'),
  generateChatBranchName: (agentName: string, sessionId: string) => {
    const agentSlug = agentName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `chat/${agentSlug}/${sessionId.slice(0, 12)}`;
  },
  createWorktree: async (options: { projectWorkingDir: string; branchName: string; worktreeId: string }) => {
    const { projectWorkingDir, branchName, worktreeId } = options;
    const base = process.env.WORKTREE_BASE_DIR ?? resolve(dirname(projectWorkingDir), '.corvid-worktrees');
    const worktreeDir = resolve(base, worktreeId);
    try {
      const proc = Bun.spawn(['git', 'worktree', 'add', '-b', branchName, worktreeDir], {
        cwd: projectWorkingDir,
        stdout: 'pipe',
        stderr: 'pipe',
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
        cwd: projectWorkingDir,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      await new Response(proc.stderr).text();
      await proc.exited;
    } catch {
      /* non-fatal */
    }
  },
}));

import { Database } from 'bun:sqlite';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { WorkTaskService } from '../work/service';
import { createMockProcessManager, makeMockProc } from './work-task-test-helpers';

let db: Database;
let service: WorkTaskService;
let mockProcessManager: ProcessManager;
let spawnCalls: Array<{ cmd: string[]; cwd?: string }>;
let spawnResults: Array<{ exitCode: number; stdout: string; stderr: string }>;
let subscribeCallbacks: Map<string, Set<(sid: string, event: ClaudeStreamEvent) => void>>;

function queueSpawn(exitCode: number, stdout = '', stderr = '') {
  spawnResults.push({ exitCode, stdout, stderr });
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
// 16. PR dedup check
// ═══════════════════════════════════════════════════════════════════════════════

describe('PR dedup check', () => {
  let savedGhToken: string | undefined;

  beforeAll(() => {
    savedGhToken = process.env.GH_TOKEN;
    process.env.GH_TOKEN = 'ghp_test_dedup';
  });

  afterAll(() => {
    if (savedGhToken !== undefined) {
      process.env.GH_TOKEN = savedGhToken;
    } else {
      delete process.env.GH_TOKEN;
    }
  });

  test('skips task creation when an open PR already references the issue', async () => {
    const { agent, project } = createTestAgentAndProject();

    // 1. git remote get-url origin → returns a GitHub URL
    queueSpawn(0, 'https://github.com/CorvidLabs/corvid-agent.git');
    // 2. gh pr list --search → returns a matching PR
    queueSpawn(
      0,
      JSON.stringify([
        {
          number: 716,
          title: 'fix: heartbeat polling (#710)',
          url: 'https://github.com/CorvidLabs/corvid-agent/pull/716',
          author: { login: 'corvid-agent' },
          state: 'OPEN',
          headRefName: 'fix/710',
          baseRefName: 'main',
          body: 'Fixes #710',
          createdAt: '2026-03-07T00:00:00Z',
          additions: 10,
          deletions: 5,
          changedFiles: 2,
        },
      ]),
    );

    await expect(
      service.create({
        agentId: agent.id,
        description: 'Fix the council race condition (#710)',
        projectId: project.id,
      }),
    ).rejects.toThrow('An open PR (or active work task) already addresses issue #710. Skipping.');
  });

  test('proceeds when no open PR references the issue', async () => {
    const { agent, project } = createTestAgentAndProject();

    // 1. git remote get-url origin
    queueSpawn(0, 'https://github.com/CorvidLabs/corvid-agent.git');
    // 2. gh pr list --search → empty results
    queueSpawn(0, '[]');
    // 3. git worktree add (success)
    queueSpawn(0);
    // 4. bun install (success)
    queueSpawn(0);

    const task = await service.create({
      agentId: agent.id,
      description: 'Fix the council race condition (#710)',
      projectId: project.id,
    });

    expect(task.status).toBe('running');
    expect(task.branchName).toBeTruthy();
  });

  test('proceeds when description has no issue reference', async () => {
    const { agent, project } = createTestAgentAndProject();

    // 1. git remote get-url origin (for off-limits check only, no dedup needed)
    queueSpawn(0, 'https://github.com/CorvidLabs/corvid-agent.git');
    // 2. git worktree add
    queueSpawn(0);
    // 3. bun install
    queueSpawn(0);

    const task = await service.create({
      agentId: agent.id,
      description: 'Refactor the logging system',
      projectId: project.id,
    });

    expect(task.status).toBe('running');
  });

  test('proceeds when GitHub search fails (non-fatal)', async () => {
    const { agent, project } = createTestAgentAndProject();

    // 1. git remote get-url origin
    queueSpawn(0, 'https://github.com/CorvidLabs/corvid-agent.git');
    // 2. gh pr list --search → fails
    queueSpawn(1, '', 'API rate limit exceeded');
    // 3. git worktree add
    queueSpawn(0);
    // 4. bun install
    queueSpawn(0);

    const task = await service.create({
      agentId: agent.id,
      description: 'Fix issue #999',
      projectId: project.id,
    });

    expect(task.status).toBe('running');
  });

  test('ignores closed/merged PRs (only open PRs block)', async () => {
    const { agent, project } = createTestAgentAndProject();

    // 1. git remote get-url origin
    queueSpawn(0, 'https://github.com/CorvidLabs/corvid-agent.git');
    // 2. gh pr list --search (state=open) → empty (the PR is merged so not in results)
    queueSpawn(0, '[]');
    // 3. git worktree add
    queueSpawn(0);
    // 4. bun install
    queueSpawn(0);

    const task = await service.create({
      agentId: agent.id,
      description: 'Follow up on #500',
      projectId: project.id,
    });

    expect(task.status).toBe('running');
  });
});
