/**
 * Stale worktree state cleanup helpers.
 *
 * Extracted into a separate module so they can be tested directly without
 * being affected by mock.module() leakage in Bun 1.x — seven other test
 * files mock '../lib/worktree' but none mock this module.
 */

import { existsSync, rmSync } from 'node:fs';
import { createLogger } from './logger';

const log = createLogger('Worktree');

/**
 * Check if a git branch exists locally.
 */
export async function branchExists(projectWorkingDir: string, branchName: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(['git', 'rev-parse', '--verify', `refs/heads/${branchName}`], {
      cwd: projectWorkingDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await new Response(proc.stderr).text();
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

/**
 * Force-delete a local git branch. Non-fatal on failure.
 */
export async function deleteBranch(projectWorkingDir: string, branchName: string): Promise<void> {
  try {
    const proc = Bun.spawn(['git', 'branch', '-D', branchName], {
      cwd: projectWorkingDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await new Response(proc.stderr).text();
    await proc.exited;
  } catch {
    // Non-fatal — creation will report the real error if the branch still blocks.
  }
}

/**
 * Force-remove a worktree directory via git, then prune. Non-fatal on failure.
 */
export async function forceRemoveWorktree(
  projectWorkingDir: string,
  worktreeDir: string,
  pruneAfter: (cwd: string) => Promise<void>,
): Promise<void> {
  try {
    const proc = Bun.spawn(['git', 'worktree', 'remove', '--force', worktreeDir], {
      cwd: projectWorkingDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await new Response(proc.stderr).text();
    await proc.exited;
  } catch {
    // If git worktree remove fails, try manual cleanup + prune
    try {
      rmSync(worktreeDir, { recursive: true, force: true });
      await pruneAfter(projectWorkingDir);
    } catch {
      // Non-fatal — creation will report the real error
    }
  }
}

/**
 * Clean stale worktree state before creating a new worktree.
 * Prunes dead references, removes leftover directories, and deletes
 * conflicting branches.
 */
export async function cleanStaleWorktreeState(
  projectWorkingDir: string,
  worktreeDir: string,
  branchName: string,
  pruneWorktrees: (cwd: string) => Promise<void>,
): Promise<void> {
  // Clean stale worktree references
  await pruneWorktrees(projectWorkingDir);

  // Remove leftover worktree directory from a crash
  if (existsSync(worktreeDir)) {
    log.info('Removing stale worktree directory before creation', { worktreeDir });
    await forceRemoveWorktree(projectWorkingDir, worktreeDir, pruneWorktrees);
  }

  // Delete conflicting branches from previous failed attempts
  if (await branchExists(projectWorkingDir, branchName)) {
    log.info('Deleting stale branch before worktree creation', { branchName });
    await deleteBranch(projectWorkingDir, branchName);
  }
}
