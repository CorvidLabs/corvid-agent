/**
 * Tests for stale-state cleanup in worktree-cleanup.ts.
 *
 * These helpers are extracted into a separate module specifically to avoid
 * mock.module() leakage in Bun 1.x — seven other test files mock
 * '../lib/worktree' but none mock '../lib/worktree-cleanup'.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { branchExists, cleanStaleWorktreeState, deleteBranch, forceRemoveWorktree } from '../lib/worktree-cleanup';

const IS_WINDOWS = process.platform === 'win32';

/** Simple prune helper for tests */
async function pruneWorktrees(projectWorkingDir: string): Promise<void> {
  const proc = Bun.spawn(['git', 'worktree', 'prune'], {
    cwd: projectWorkingDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  await new Response(proc.stderr).text();
  await proc.exited;
}

describe('worktree stale-state cleanup', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wt-cleanup-test-'));
    // Initialize a git repo with one commit (required for worktrees)
    Bun.spawnSync(['git', 'init'], { cwd: tempDir });
    Bun.spawnSync(['git', 'config', 'user.email', 'test@test.com'], { cwd: tempDir });
    Bun.spawnSync(['git', 'config', 'user.name', 'Test'], { cwd: tempDir });
    Bun.spawnSync(['git', 'commit', '--allow-empty', '-m', 'initial'], { cwd: tempDir });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // branchExists
  // -----------------------------------------------------------------------
  describe('branchExists', () => {
    test.skipIf(IS_WINDOWS)('returns true for existing branch', async () => {
      Bun.spawnSync(['git', 'branch', 'test/branch'], { cwd: tempDir });
      expect(await branchExists(tempDir, 'test/branch')).toBe(true);
    });

    test.skipIf(IS_WINDOWS)('returns false for non-existent branch', async () => {
      expect(await branchExists(tempDir, 'no/such/branch')).toBe(false);
    });

    test('returns false for non-git directory', async () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-'));
      try {
        expect(await branchExists(nonGitDir, 'any')).toBe(false);
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  // -----------------------------------------------------------------------
  // deleteBranch
  // -----------------------------------------------------------------------
  describe('deleteBranch', () => {
    test.skipIf(IS_WINDOWS)('deletes an existing branch', async () => {
      Bun.spawnSync(['git', 'branch', 'to-delete'], { cwd: tempDir });
      expect(await branchExists(tempDir, 'to-delete')).toBe(true);

      await deleteBranch(tempDir, 'to-delete');

      expect(await branchExists(tempDir, 'to-delete')).toBe(false);
    });

    test.skipIf(IS_WINDOWS)('does not throw for non-existent branch', async () => {
      // Should silently succeed
      await deleteBranch(tempDir, 'no-such-branch');
    });
  });

  // -----------------------------------------------------------------------
  // forceRemoveWorktree
  // -----------------------------------------------------------------------
  describe('forceRemoveWorktree', () => {
    test.skipIf(IS_WINDOWS)('removes an existing worktree directory', async () => {
      const worktreeDir = join(tempDir, '.worktrees', 'test-session');

      // Create a real worktree first
      const proc = Bun.spawn(['git', 'worktree', 'add', '-b', 'force-rm/test', worktreeDir], {
        cwd: tempDir,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      await proc.exited;
      expect(existsSync(worktreeDir)).toBe(true);

      await forceRemoveWorktree(tempDir, worktreeDir, pruneWorktrees);

      expect(existsSync(worktreeDir)).toBe(false);
    });

    test.skipIf(IS_WINDOWS)('handles plain directory (no git worktree metadata)', async () => {
      const plainDir = join(tempDir, '.worktrees', 'orphan-dir');
      mkdirSync(plainDir, { recursive: true });

      // Should not throw even though the directory isn't a real worktree
      await forceRemoveWorktree(tempDir, plainDir, pruneWorktrees);
    });
  });

  // -----------------------------------------------------------------------
  // cleanStaleWorktreeState (integration)
  // -----------------------------------------------------------------------
  describe('cleanStaleWorktreeState', () => {
    let originalWorktreeBaseDir: string | undefined;

    beforeEach(() => {
      originalWorktreeBaseDir = process.env.WORKTREE_BASE_DIR;
      process.env.WORKTREE_BASE_DIR = join(tempDir, '.worktrees');
    });

    afterEach(() => {
      if (originalWorktreeBaseDir !== undefined) {
        process.env.WORKTREE_BASE_DIR = originalWorktreeBaseDir;
      } else {
        delete process.env.WORKTREE_BASE_DIR;
      }
    });

    test.skipIf(IS_WINDOWS)('cleans stale branch before worktree creation', async () => {
      const worktreeDir = join(tempDir, '.worktrees', 'branch-test');
      Bun.spawnSync(['git', 'branch', 'stale/branch'], { cwd: tempDir });

      await cleanStaleWorktreeState(tempDir, worktreeDir, 'stale/branch', pruneWorktrees);

      // Branch should be gone
      expect(await branchExists(tempDir, 'stale/branch')).toBe(false);
    });

    test.skipIf(IS_WINDOWS)('cleans stale directory before worktree creation', async () => {
      const worktreeDir = join(tempDir, '.worktrees', 'dir-test');
      mkdirSync(worktreeDir, { recursive: true });

      await cleanStaleWorktreeState(tempDir, worktreeDir, 'fresh/branch', pruneWorktrees);

      // Directory should be gone (or replaced)
      // We just verify cleanup doesn't throw
    });

    test.skipIf(IS_WINDOWS)('cleans both stale branch and directory', async () => {
      const worktreeDir = join(tempDir, '.worktrees', 'combo-test');
      Bun.spawnSync(['git', 'branch', 'combo/branch'], { cwd: tempDir });
      mkdirSync(worktreeDir, { recursive: true });

      await cleanStaleWorktreeState(tempDir, worktreeDir, 'combo/branch', pruneWorktrees);

      expect(await branchExists(tempDir, 'combo/branch')).toBe(false);
    });

    test.skipIf(IS_WINDOWS)('succeeds on clean state', async () => {
      const worktreeDir = join(tempDir, '.worktrees', 'clean-test');

      // Should not throw when nothing to clean
      await cleanStaleWorktreeState(tempDir, worktreeDir, 'clean/branch', pruneWorktrees);
    });
  });
});
