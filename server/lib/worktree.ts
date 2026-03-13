/**
 * Shared git worktree utilities.
 *
 * Extracted from WorkTaskService so that both work tasks and chat sessions
 * can create isolated worktrees without duplicating logic.
 */

import { resolve, dirname } from 'node:path';
import { createLogger } from './logger';

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
 */
export async function createWorktree(options: CreateWorktreeOptions): Promise<CreateWorktreeResult> {
    const { projectWorkingDir, branchName, worktreeId } = options;
    const worktreeBase = getWorktreeBaseDir(projectWorkingDir);
    const worktreeDir = resolve(worktreeBase, worktreeId);

    try {
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

/**
 * Remove a git worktree. The branch is kept (needed for PRs and review).
 * Idempotent — safe to call if the worktree was already removed.
 */
export async function removeWorktree(projectWorkingDir: string, worktreeDir: string): Promise<void> {
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
