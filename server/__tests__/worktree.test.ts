import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { getWorktreeBaseDir, generateChatBranchName, createWorktree, removeWorktree } from '../lib/worktree';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

describe('worktree utilities', () => {
    // -----------------------------------------------------------------------
    // getWorktreeBaseDir
    // -----------------------------------------------------------------------
    describe('getWorktreeBaseDir', () => {
        const originalEnv = process.env.WORKTREE_BASE_DIR;

        afterEach(() => {
            if (originalEnv !== undefined) {
                process.env.WORKTREE_BASE_DIR = originalEnv;
            } else {
                delete process.env.WORKTREE_BASE_DIR;
            }
        });

        test('defaults to .corvid-worktrees sibling directory', () => {
            delete process.env.WORKTREE_BASE_DIR;
            const projectDir = join(tmpdir(), 'my-project');
            const result = getWorktreeBaseDir(projectDir);
            expect(result).toBe(resolve(dirname(projectDir), '.corvid-worktrees'));
        });

        test('respects WORKTREE_BASE_DIR env override', () => {
            const overrideDir = join(tmpdir(), 'custom-worktrees');
            process.env.WORKTREE_BASE_DIR = overrideDir;
            const result = getWorktreeBaseDir(join(tmpdir(), 'my-project'));
            expect(result).toBe(overrideDir);
        });

        test('handles nested project paths', () => {
            delete process.env.WORKTREE_BASE_DIR;
            const projectDir = join(tmpdir(), 'repos', 'org', 'corvid-agent');
            const result = getWorktreeBaseDir(projectDir);
            expect(result).toBe(resolve(dirname(projectDir), '.corvid-worktrees'));
        });
    });

    // -----------------------------------------------------------------------
    // generateChatBranchName
    // -----------------------------------------------------------------------
    describe('generateChatBranchName', () => {
        test('generates chat/{agentSlug}/{sessionPrefix}', () => {
            const result = generateChatBranchName('Corvid Agent', 'abc123def456-rest');
            expect(result).toBe('chat/corvid-agent/abc123def456');
        });

        test('slugifies agent name with special characters', () => {
            const result = generateChatBranchName('My--Agent!!v2', 'session-id-here');
            expect(result).toBe('chat/my-agent-v2/session-id-h');
        });

        test('handles single word agent names', () => {
            const result = generateChatBranchName('corvid', 'abcdefghijkl');
            expect(result).toBe('chat/corvid/abcdefghijkl');
        });

        test('trims leading/trailing hyphens from agent slug', () => {
            const result = generateChatBranchName('---test---', '123456789012');
            expect(result).toBe('chat/test/123456789012');
        });
    });

    // -----------------------------------------------------------------------
    // createWorktree (integration — requires a real git repo)
    // -----------------------------------------------------------------------
    describe('createWorktree', () => {
        let tempDir: string;
        let originalWorktreeBaseDir: string | undefined;

        beforeEach(() => {
            originalWorktreeBaseDir = process.env.WORKTREE_BASE_DIR;
            tempDir = mkdtempSync(join(tmpdir(), 'worktree-test-'));
            // Set WORKTREE_BASE_DIR to isolate worktrees per test suite
            process.env.WORKTREE_BASE_DIR = join(tempDir, '.worktrees');
            // Initialize a git repo in the temp directory
            Bun.spawnSync(['git', 'init'], { cwd: tempDir });
            Bun.spawnSync(['git', 'config', 'user.email', 'test@test.com'], { cwd: tempDir });
            Bun.spawnSync(['git', 'config', 'user.name', 'Test'], { cwd: tempDir });
            // Need at least one commit for worktree to work
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

        test('creates worktree successfully', async () => {
            const result = await createWorktree({
                projectWorkingDir: tempDir,
                branchName: 'test/branch',
                worktreeId: 'test-session',
            });

            expect(result.success).toBe(true);
            expect(result.worktreeDir).toContain('test-session');
            expect(existsSync(result.worktreeDir)).toBe(true);
        });

        test('returns error for invalid git repo', async () => {
            const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-'));
            try {
                const result = await createWorktree({
                    projectWorkingDir: nonGitDir,
                    branchName: 'test/branch',
                    worktreeId: 'test-session',
                });
                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
            } finally {
                rmSync(nonGitDir, { recursive: true, force: true });
            }
        });

        test('returns error for duplicate branch name', async () => {
            // First creation succeeds
            await createWorktree({
                projectWorkingDir: tempDir,
                branchName: 'dup/branch',
                worktreeId: 'session-1',
            });

            // Second creation with same branch name fails
            const result = await createWorktree({
                projectWorkingDir: tempDir,
                branchName: 'dup/branch',
                worktreeId: 'session-2',
            });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // removeWorktree (integration)
    // -----------------------------------------------------------------------
    describe('removeWorktree', () => {
        let tempDir: string;
        let originalWorktreeBaseDir: string | undefined;

        beforeEach(() => {
            originalWorktreeBaseDir = process.env.WORKTREE_BASE_DIR;
            tempDir = mkdtempSync(join(tmpdir(), 'worktree-rm-test-'));
            process.env.WORKTREE_BASE_DIR = join(tempDir, '.worktrees');
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

        test('removes existing worktree', async () => {
            const created = await createWorktree({
                projectWorkingDir: tempDir,
                branchName: 'rm/test',
                worktreeId: 'to-remove',
            });
            expect(created.success).toBe(true);
            expect(existsSync(created.worktreeDir)).toBe(true);

            await removeWorktree(tempDir, created.worktreeDir);

            expect(existsSync(created.worktreeDir)).toBe(false);
        });

        test('does not throw for non-existent worktree', async () => {
            // Should log a warning but not throw
            await removeWorktree(tempDir, '/nonexistent/worktree/path');
            // If we get here without throwing, the test passes
        });

        test('preserves the branch after removal', async () => {
            const branchName = 'preserve/branch';
            const created = await createWorktree({
                projectWorkingDir: tempDir,
                branchName,
                worktreeId: 'preserve-test',
            });
            expect(created.success).toBe(true);

            await removeWorktree(tempDir, created.worktreeDir);

            // Branch should still exist
            const result = Bun.spawnSync(['git', 'branch', '--list', branchName], { cwd: tempDir });
            const output = new TextDecoder().decode(result.stdout).trim();
            expect(output).toContain(branchName);
        });
    });
});
