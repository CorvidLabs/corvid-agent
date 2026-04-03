/**
 * Shared git worktree utilities.
 *
 * Extracted from WorkTaskService so that both work tasks and chat sessions
 * can create isolated worktrees without duplicating logic.
 */

import { resolve, dirname } from 'node:path';
import { createLogger } from './logger';
import { resolveProjectDir } from './project-dir';
import type { Project } from '../../shared/types';
import { cleanStaleWorktreeState } from './worktree-cleanup';

const log = createLogger('Worktree');

/**
 * Resolve the base directory for git worktrees.
 * Defaults to a `.corvid-worktrees` sibling directory next to the project.
 */
export function getWorktreeBaseDir(projectWorkingDir: string): string {
    return process.env.WORKTREE_BASE_DIR
        ?? resolve(dirname(projectWorkingDir), '.corvid-worktrees');
}

export interface CreateWorktreeOptions {
    /** The project's working directory (main repo checkout). */
    projectWorkingDir: string;
    /** Branch name to create in the worktree. */
    branchName: string;
    /** Unique identifier used as the worktree subdirectory name. */
    worktreeId: string;
}

export interface CreateWorktreeResult {
    success: boolean;
    worktreeDir: string;
    error?: string;
}

/**
 * Create a git worktree with a new branch, isolated from the main working tree.
 *
 * Handles stale state automatically: prunes dead worktree references, removes
 * leftover directories, and deletes conflicting branches before creation.
 * This prevents `fatal` errors when retrying tasks that previously failed
 * during worktree setup.
 */
export async function createWorktree(options: CreateWorktreeOptions): Promise<CreateWorktreeResult> {
    const { projectWorkingDir, branchName, worktreeId } = options;
    const worktreeBase = getWorktreeBaseDir(projectWorkingDir);
    const worktreeDir = resolve(worktreeBase, worktreeId);

    try {
        // Clean stale worktree state (prune refs, remove dirs, delete branches)
        // before attempting creation. Prevents `fatal` errors on task retry.
        await cleanStaleWorktreeState(projectWorkingDir, worktreeDir, branchName, pruneWorktrees);

        const proc = Bun.spawn(
            ['git', 'worktree', 'add', '-b', branchName, worktreeDir],
            {
                cwd: projectWorkingDir,
                stdout: 'pipe',
                stderr: 'pipe',
            },
        );
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            log.warn('Failed to create worktree', { branchName, worktreeDir, stderr: stderr.trim() });
            return { success: false, worktreeDir, error: `Failed to create worktree: ${stderr.trim()}` };
        }

        log.info('Created worktree', { branchName, worktreeDir });
        return { success: true, worktreeDir };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Error creating worktree', { branchName, worktreeDir, error: message });
        return { success: false, worktreeDir, error: `Failed to create worktree: ${message}` };
    }
}

export interface RemoveWorktreeOptions {
    /**
     * If true, delete the branch after removing the worktree when it has
     * zero commits ahead of main (i.e. the chat session produced no work).
     * Branches with actual commits are kept for PRs/review.
     */
    cleanBranch?: boolean;
}

/**
 * Remove a git worktree. By default the branch is kept (needed for PRs and review).
 * Pass `{ cleanBranch: true }` to auto-delete branches with no commits ahead of main.
 * Idempotent — safe to call if the worktree was already removed.
 */
export async function removeWorktree(
    projectWorkingDir: string,
    worktreeDir: string,
    options?: RemoveWorktreeOptions,
): Promise<void> {
    // Detect the branch name before removing the worktree (needed for cleanBranch)
    let branchName: string | undefined;
    if (options?.cleanBranch) {
        branchName = await detectWorktreeBranch(projectWorkingDir, worktreeDir);
    }

    try {
        const proc = Bun.spawn(
            ['git', 'worktree', 'remove', '--force', worktreeDir],
            {
                cwd: projectWorkingDir,
                stdout: 'pipe',
                stderr: 'pipe',
            },
        );
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            log.warn('Failed to remove worktree', { worktreeDir, stderr: stderr.trim() });
        } else {
            log.info('Removed worktree', { worktreeDir });
        }
    } catch (err) {
        log.warn('Error removing worktree', {
            worktreeDir,
            error: err instanceof Error ? err.message : String(err),
        });
    }

    // Clean up empty branches after worktree removal
    if (branchName) {
        await cleanupEmptyBranch(projectWorkingDir, branchName);
    }
}

/**
 * Detect which branch a worktree is on by parsing `git worktree list --porcelain`.
 */
async function detectWorktreeBranch(projectWorkingDir: string, worktreeDir: string): Promise<string | undefined> {
    try {
        const proc = Bun.spawn(
            ['git', 'worktree', 'list', '--porcelain'],
            { cwd: projectWorkingDir, stdout: 'pipe', stderr: 'pipe' },
        );
        const stdout = await new Response(proc.stdout).text();
        await proc.exited;

        // Porcelain output: blocks separated by blank lines.
        // Each block: "worktree <path>\nHEAD <sha>\nbranch refs/heads/<name>\n"
        const blocks = stdout.split('\n\n');
        for (const block of blocks) {
            if (block.includes(`worktree ${worktreeDir}`)) {
                const branchLine = block.split('\n').find(l => l.startsWith('branch '));
                if (branchLine) {
                    return branchLine.replace('branch refs/heads/', '');
                }
            }
        }
    } catch {
        // Non-fatal — we just won't clean the branch
    }
    return undefined;
}

/**
 * Delete a branch if it has zero commits ahead of main.
 * Branches with actual work are preserved for PRs/review.
 */
async function cleanupEmptyBranch(projectWorkingDir: string, branchName: string): Promise<void> {
    try {
        // Check if the branch has any commits not on main
        const logProc = Bun.spawn(
            ['git', 'log', 'main..' + branchName, '--oneline'],
            { cwd: projectWorkingDir, stdout: 'pipe', stderr: 'pipe' },
        );
        const logOutput = (await new Response(logProc.stdout).text()).trim();
        await logProc.exited;

        if (logOutput.length > 0) {
            log.info('Keeping branch with commits', { branchName, commits: logOutput.split('\n').length });
            return;
        }

        // No commits ahead — safe to delete
        const delProc = Bun.spawn(
            ['git', 'branch', '-D', branchName],
            { cwd: projectWorkingDir, stdout: 'pipe', stderr: 'pipe' },
        );
        await delProc.exited;
        log.info('Deleted empty branch', { branchName });
    } catch (err) {
        log.warn('Failed to clean up branch', {
            branchName,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Generate a branch name for a chat session worktree.
 * Pattern: `chat/{agentSlug}/{sessionId-prefix}`
 */
export function generateChatBranchName(agentName: string, sessionId: string): string {
    const agentSlug = agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const sessionPrefix = sessionId.slice(0, 12);
    return `chat/${agentSlug}/${sessionPrefix}`;
}

/**
 * Run `git worktree prune` to clean up stale worktree references
 * where the directory no longer exists on disk.
 */
export async function pruneWorktrees(projectWorkingDir: string): Promise<void> {
    try {
        const proc = Bun.spawn(
            ['git', 'worktree', 'prune'],
            { cwd: projectWorkingDir, stdout: 'pipe', stderr: 'pipe' },
        );
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            log.warn('Failed to prune worktrees', { stderr: stderr.trim() });
        } else {
            log.info('Pruned stale worktree references');
        }
    } catch (err) {
        log.warn('Error pruning worktrees', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

export interface ResolveAndCreateWorktreeResult {
    success: boolean;
    workDir?: string;
    error?: string;
}

/**
 * Resolve a project's working directory (handling clone_on_demand/ephemeral)
 * then create a worktree from it. This ensures the repo is cloned before
 * attempting to create a worktree — fixing ENOENT errors for clone_on_demand projects.
 */
export async function resolveAndCreateWorktree(
    project: Project,
    agentName: string,
    sessionId: string,
): Promise<ResolveAndCreateWorktreeResult> {
    // Step 1: Resolve the actual working directory (clone if needed)
    const resolved = await resolveProjectDir(project);
    if (resolved.error) {
        return { success: false, error: `Failed to resolve project directory: ${resolved.error}` };
    }

    // Step 2: Create the worktree from the resolved directory
    const branchName = generateChatBranchName(agentName, sessionId);
    const result = await createWorktree({
        projectWorkingDir: resolved.dir,
        branchName,
        worktreeId: `chat-${sessionId.slice(0, 12)}`,
    });

    if (!result.success) {
        return { success: false, error: result.error };
    }

    return { success: true, workDir: result.worktreeDir };
}
