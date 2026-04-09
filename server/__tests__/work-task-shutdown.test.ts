import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

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
import { getWorkTask, updateWorkTaskStatus } from '../db/work-tasks';
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
// 17. Shutdown gate
// ═══════════════════════════════════════════════════════════════════════════════

describe('Shutdown gate', () => {
  test('create() rejects new tasks when shuttingDown flag is set', async () => {
    const { agent, project } = createTestAgentAndProject();
    queueSuccessfulSpawns(2);

    // Trigger the shutdown flag via drainRunningTasks (sets _shuttingDown = true)
    await service.drainRunningTasks();

    await expect(
      service.create({
        agentId: agent.id,
        description: 'Should be rejected',
        projectId: project.id,
      }),
    ).rejects.toThrow('Server is shutting down');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 18. Drain on shutdown (drainRunningTasks)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Drain on shutdown (drainRunningTasks)', () => {
  test('drainRunningTasks() resolves immediately when no active tasks exist', async () => {
    const start = Date.now();
    await service.drainRunningTasks();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
  });

  test('drainRunningTasks() completes quickly when tasks are already done', async () => {
    const { agent, project } = createTestAgentAndProject();
    queueSuccessfulSpawns(2);

    const task = await service.create({
      agentId: agent.id,
      description: 'Long running task',
      projectId: project.id,
    });

    updateWorkTaskStatus(db, task.id, 'completed', { prUrl: 'https://github.com/test/test/pull/1' });

    const start = Date.now();
    await service.drainRunningTasks();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);

    const finalTask = getWorkTask(db, task.id);
    expect(finalTask?.status).toBe('completed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 19. Startup recovery with iteration limit
// ═══════════════════════════════════════════════════════════════════════════════

describe('Startup recovery with iteration limit', () => {
  test('recoverStaleTasks retries tasks below max iterations', async () => {
    const { agent, project } = createTestAgentAndProject();

    db.query(
      `INSERT INTO work_tasks (id, agent_id, project_id, description, status, source, requester_info, iteration_count)
             VALUES (?, ?, ?, ?, 'running', 'web', '{}', 1)`,
    ).run('stale-task-1', agent.id, project.id, 'Interrupted task');

    queueSuccessfulSpawns(2);

    await service.recoverStaleTasks();

    const recovered = getWorkTask(db, 'stale-task-1');
    expect(recovered).toBeTruthy();
    expect(['branching', 'running']).toContain(recovered!.status);
  });

  test('recoverStaleTasks skips tasks at max iterations (3)', async () => {
    const { agent, project } = createTestAgentAndProject();

    db.query(
      `INSERT INTO work_tasks (id, agent_id, project_id, description, status, source, requester_info, iteration_count)
             VALUES (?, ?, ?, ?, 'running', 'web', '{}', 3)`,
    ).run('maxed-task', agent.id, project.id, 'Task at max iterations');

    await service.recoverStaleTasks();

    const task = getWorkTask(db, 'maxed-task');
    expect(task).toBeTruthy();
    expect(task?.status).toBe('failed');
    expect(task?.error).toBe('Interrupted by server restart');
  });

  test('recoverStaleTasks retries task at iteration 2 (below max of 3)', async () => {
    const { agent, project } = createTestAgentAndProject();

    db.query(
      `INSERT INTO work_tasks (id, agent_id, project_id, description, status, source, requester_info, iteration_count)
             VALUES (?, ?, ?, ?, 'validating', 'web', '{}', 2)`,
    ).run('mid-task', agent.id, project.id, 'Task at iteration 2');

    queueSuccessfulSpawns(2);

    await service.recoverStaleTasks();

    const task = getWorkTask(db, 'mid-task');
    expect(task).toBeTruthy();
    expect(['branching', 'running']).toContain(task!.status);
  });

  test('recoverStaleTasks handles mix of retryable and maxed-out tasks', async () => {
    const { agent, project } = createTestAgentAndProject();

    db.query(
      `INSERT INTO work_tasks (id, agent_id, project_id, description, status, source, requester_info, iteration_count)
             VALUES (?, ?, ?, ?, 'running', 'web', '{}', 1)`,
    ).run('retry-me', agent.id, project.id, 'Retryable task');

    const project2 = createProject(db, { name: 'Project2', workingDir: '/tmp/test-project-2' });

    db.query(
      `INSERT INTO work_tasks (id, agent_id, project_id, description, status, source, requester_info, iteration_count)
             VALUES (?, ?, ?, ?, 'running', 'web', '{}', 3)`,
    ).run('skip-me', agent.id, project2.id, 'Maxed out task');

    queueSuccessfulSpawns(2);

    await service.recoverStaleTasks();

    const retryable = getWorkTask(db, 'retry-me');
    expect(['branching', 'running']).toContain(retryable!.status);

    const maxed = getWorkTask(db, 'skip-me');
    expect(maxed?.status).toBe('failed');
    expect(maxed?.error).toBe('Interrupted by server restart');
  });
});
