/**
 * Tests for stale-state cleanup in createWorktree().
 *
 * These tests exercise the REAL worktree module to ensure codecov covers the
 * new branchExists / deleteBranch / forceRemoveWorktree paths added for
 * stale-state recovery.
 *
 * IMPORTANT: In Bun 1.x, mock.module() leaks across test files. Seven other
 * test files mock '../lib/worktree' with simplified implementations that lack
 * stale-cleanup logic. We must re-provide the real module here to override
 * any leaked mocks before our imports resolve.
 */
import { mock } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Re-provide the real worktree module to override leaked mocks.
const __dirname = dirname(fileURLToPath(import.meta.url));
const realModulePath = resolve(__dirname, '../lib/worktree.ts');
mock.module('../lib/worktree', () => import(realModulePath));

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorktree, pruneWorktrees } from '../lib/worktree';

const IS_WINDOWS = process.platform === 'win32';

describe('worktree stale-state cleanup', () => {
  let tempDir: string;
  let originalWorktreeBaseDir: string | undefined;

  beforeEach(() => {
    originalWorktreeBaseDir = process.env.WORKTREE_BASE_DIR;
    tempDir = mkdtempSync(join(tmpdir(), 'wt-cleanup-test-'));
    process.env.WORKTREE_BASE_DIR = join(tempDir, '.worktrees');
    // Initialize a git repo with one commit (required for worktrees)
    Bun.spawnSync(['git', 'init'], { cwd: tempDir });
    Bun.spawnSync(['git', 'config', 'user.email', 'test@test.com'], { cwd: tempDir });
    Bun.spawnSync(['git', 'config', 'user.name', 'Test'], { cwd: tempDir });
    Bun.spawnSync(['git', 'commit', '--allow-empty', '-m', 'initial'], { cwd: tempDir });
  });

  afterEach(() => {
    if (originalWorktreeBaseDir !== undefined) {
      process.env.WORKTREE_BASE_DIR = originalWorktreeBaseDir;
    } else {
      delete process.env.WORKTREE_BASE_DIR;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test.skipIf(IS_WINDOWS)('recovers from stale branch left by a previous failed task', async () => {
    // Simulate a stale branch left behind by a crashed task
    Bun.spawnSync(['git', 'branch', 'stale/branch'], { cwd: tempDir });

    // Verify the branch exists
    const check = Bun.spawnSync(['git', 'rev-parse', '--verify', 'refs/heads/stale/branch'], { cwd: tempDir });
    expect(check.exitCode).toBe(0);

    // createWorktree should auto-delete the stale branch and succeed
    const result = await createWorktree({
      projectWorkingDir: tempDir,
      branchName: 'stale/branch',
      worktreeId: 'stale-branch-session',
    });

    expect(result.success).toBe(true);
    expect(existsSync(result.worktreeDir)).toBe(true);
  });

  test.skipIf(IS_WINDOWS)('recovers from stale worktree directory on disk', async () => {
    const worktreeBase = join(tempDir, '.worktrees');
    const staleDir = join(worktreeBase, 'stale-dir-session');

    // Simulate a leftover worktree directory from a crash
    mkdirSync(staleDir, { recursive: true });
    expect(existsSync(staleDir)).toBe(true);

    // createWorktree should remove the stale directory and succeed
    const result = await createWorktree({
      projectWorkingDir: tempDir,
      branchName: 'fresh/branch',
      worktreeId: 'stale-dir-session',
    });

    expect(result.success).toBe(true);
    expect(existsSync(result.worktreeDir)).toBe(true);
  });

  test.skipIf(IS_WINDOWS)('recovers from stale git worktree references', async () => {
    // Create a real worktree, then manually delete its directory to create
    // a stale reference that `git worktree prune` needs to clean up.
    const first = await createWorktree({
      projectWorkingDir: tempDir,
      branchName: 'prune/test-old',
      worktreeId: 'prune-session-old',
    });
    expect(first.success).toBe(true);

    // Manually remove the directory without git worktree remove
    rmSync(first.worktreeDir, { recursive: true, force: true });

    // Now create a new worktree — the stale reference should be pruned automatically
    const result = await createWorktree({
      projectWorkingDir: tempDir,
      branchName: 'prune/test-new',
      worktreeId: 'prune-session-new',
    });

    expect(result.success).toBe(true);
    expect(existsSync(result.worktreeDir)).toBe(true);
  });

  test.skipIf(IS_WINDOWS)('recovers from both stale branch and stale directory', async () => {
    const worktreeBase = join(tempDir, '.worktrees');
    const staleDir = join(worktreeBase, 'combo-session');

    // Simulate both: stale branch + leftover directory
    Bun.spawnSync(['git', 'branch', 'combo/branch'], { cwd: tempDir });
    mkdirSync(staleDir, { recursive: true });

    const result = await createWorktree({
      projectWorkingDir: tempDir,
      branchName: 'combo/branch',
      worktreeId: 'combo-session',
    });

    expect(result.success).toBe(true);
    expect(existsSync(result.worktreeDir)).toBe(true);
  });

  test.skipIf(IS_WINDOWS)('pruneWorktrees succeeds on clean repo', async () => {
    // Should not throw on a repo with no stale worktrees
    await pruneWorktrees(tempDir);
  });

  test('pruneWorktrees handles non-git directory gracefully', async () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-prune-'));
    try {
      // Should not throw, just log a warning
      await pruneWorktrees(nonGitDir);
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});
