/**
 * Project directory resolver.
 *
 * Handles multiple directory strategies for projects:
 * - persistent: use the existing workingDir as-is (default, current behavior)
 * - clone_on_demand: auto-clone from gitUrl if workingDir doesn't exist, reuse + pull if it does
 * - ephemeral: fresh clone to a temp directory every time, cleaned up after session ends
 * - worktree: always create a git worktree from the base clone
 */

import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createLogger } from './logger';
import type { Project, DirStrategy } from '../../shared/types';

const log = createLogger('ProjectDir');

/** Default base path for on-demand clones. */
const DEFAULT_CLONE_BASE = resolve(tmpdir(), 'corvid-projects');

export interface ResolvedDir {
    /** The resolved working directory path to use for this session. */
    dir: string;
    /** Whether this directory is ephemeral and should be cleaned up after use. */
    ephemeral: boolean;
    /** Error message if resolution failed. */
    error?: string;
}

/**
 * Resolve the effective working directory for a project based on its dir_strategy.
 *
 * For 'persistent' projects, returns workingDir as-is (existing behavior).
 * For 'clone_on_demand', clones from gitUrl if needed, then returns the clone path.
 * For 'ephemeral', always creates a fresh temp clone.
 * For 'worktree', delegates to the worktree system (returns workingDir; worktree created at session level).
 */
export async function resolveProjectDir(project: Project): Promise<ResolvedDir> {
    const strategy: DirStrategy = project.dirStrategy ?? 'persistent';

    switch (strategy) {
        case 'persistent':
            return resolvePersistent(project);
        case 'clone_on_demand':
            return resolveCloneOnDemand(project);
        case 'ephemeral':
            return resolveEphemeral(project);
        case 'worktree':
            // Worktree creation is handled at the session level (message-handler / work service).
            // Here we just ensure the base repo exists.
            return resolvePersistent(project);
        default:
            return resolvePersistent(project);
    }
}

/** Clean up an ephemeral directory. Safe to call on non-ephemeral dirs (no-op). */
export async function cleanupEphemeralDir(resolved: ResolvedDir): Promise<void> {
    if (!resolved.ephemeral) return;
    try {
        await rm(resolved.dir, { recursive: true, force: true });
        log.info('Cleaned up ephemeral directory', { dir: resolved.dir });
    } catch (err) {
        log.warn('Failed to clean up ephemeral directory', {
            dir: resolved.dir,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

// ─── Strategy implementations ────────────────────────────────────────────────

function resolvePersistent(project: Project): ResolvedDir {
    return { dir: project.workingDir, ephemeral: false };
}

async function resolveCloneOnDemand(project: Project): Promise<ResolvedDir> {
    if (!project.gitUrl) {
        log.warn('clone_on_demand strategy requires gitUrl', { projectId: project.id });
        return { dir: project.workingDir, ephemeral: false, error: 'gitUrl is required for clone_on_demand strategy' };
    }

    const cloneBase = project.baseClonePath ?? DEFAULT_CLONE_BASE;
    const cloneDir = resolve(cloneBase, sanitizeDirName(project.name));

    // Ensure base directory exists
    mkdirSync(cloneBase, { recursive: true });

    if (existsSync(resolve(cloneDir, '.git'))) {
        // Existing clone — pull latest
        log.info('Reusing existing clone, pulling latest', { cloneDir });
        await gitPull(cloneDir);
        return { dir: cloneDir, ephemeral: false };
    }

    // Fresh clone
    log.info('Cloning repository on demand', { gitUrl: project.gitUrl, cloneDir });
    const result = await gitClone(project.gitUrl, cloneDir);
    if (!result.success) {
        return { dir: project.workingDir, ephemeral: false, error: result.error };
    }

    return { dir: cloneDir, ephemeral: false };
}

async function resolveEphemeral(project: Project): Promise<ResolvedDir> {
    if (!project.gitUrl) {
        log.warn('ephemeral strategy requires gitUrl', { projectId: project.id });
        return { dir: project.workingDir, ephemeral: false, error: 'gitUrl is required for ephemeral strategy' };
    }

    const tempDir = await mkdtemp(resolve(tmpdir(), `corvid-ephemeral-${sanitizeDirName(project.name)}-`));

    log.info('Creating ephemeral clone', { gitUrl: project.gitUrl, tempDir });
    const result = await gitClone(project.gitUrl, tempDir, { depth: 1 });
    if (!result.success) {
        // Clean up the empty temp dir
        await rm(tempDir, { recursive: true, force: true }).catch((err) => {
            log.warn('Failed to clean up temp dir', { tempDir, error: err instanceof Error ? err.message : String(err) });
        });
        return { dir: project.workingDir, ephemeral: false, error: result.error };
    }

    return { dir: tempDir, ephemeral: true };
}

// ─── Git helpers ─────────────────────────────────────────────────────────────

interface GitResult {
    success: boolean;
    error?: string;
}

async function gitClone(url: string, targetDir: string, options?: { depth?: number }): Promise<GitResult> {
    const args = ['git', 'clone'];
    if (options?.depth) {
        args.push('--depth', String(options.depth));
    }
    args.push(url, targetDir);

    try {
        const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            log.warn('git clone failed', { url, targetDir, stderr: stderr.trim() });
            return { success: false, error: `git clone failed: ${stderr.trim()}` };
        }

        log.info('git clone succeeded', { url, targetDir });
        return { success: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('git clone error', { url, targetDir, error: message });
        return { success: false, error: `git clone error: ${message}` };
    }
}

async function gitPull(cwd: string): Promise<GitResult> {
    try {
        const proc = Bun.spawn(['git', 'pull', '--ff-only'], { cwd, stdout: 'pipe', stderr: 'pipe' });
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            log.warn('git pull failed', { cwd, stderr: stderr.trim() });
            return { success: false, error: `git pull failed: ${stderr.trim()}` };
        }

        return { success: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('git pull error', { cwd, error: message });
        return { success: false, error: `git pull error: ${message}` };
    }
}

/** Sanitize a project name for use as a directory name. */
function sanitizeDirName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}
