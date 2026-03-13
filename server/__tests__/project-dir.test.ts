import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveProjectDir, cleanupEphemeralDir, type ResolvedDir } from '../lib/project-dir';
import type { Project } from '../../shared/types';

const TEST_BASE = mkdtempSync(resolve(tmpdir(), 'corvid-test-project-dir-'));
const FAKE_REPO = resolve(TEST_BASE, 'fake-repo');

function makeTestProject(overrides: Partial<Project> = {}): Project {
    return {
        id: 'test-project-id',
        name: 'TestProject',
        description: '',
        workingDir: FAKE_REPO,
        claudeMd: '',
        envVars: {},
        gitUrl: null,
        dirStrategy: 'persistent',
        baseClonePath: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

beforeEach(() => {
    mkdirSync(TEST_BASE, { recursive: true });
    // Create a minimal git repo for testing
    mkdirSync(FAKE_REPO, { recursive: true });
});

afterEach(() => {
    rmSync(TEST_BASE, { recursive: true, force: true });
});

// ── persistent strategy ──────────────────────────────────────────────

describe('persistent strategy', () => {
    test('returns workingDir as-is', async () => {
        const project = makeTestProject();
        const result = await resolveProjectDir(project);
        expect(result.dir).toBe(FAKE_REPO);
        expect(result.ephemeral).toBe(false);
        expect(result.error).toBeUndefined();
    });

    test('fallback for unknown strategy', async () => {
        const project = makeTestProject({ dirStrategy: 'unknown' as any });
        const result = await resolveProjectDir(project);
        expect(result.dir).toBe(FAKE_REPO);
        expect(result.ephemeral).toBe(false);
    });
});

// ── worktree strategy ────────────────────────────────────────────────

describe('worktree strategy', () => {
    test('returns workingDir (worktree creation is at session level)', async () => {
        const project = makeTestProject({ dirStrategy: 'worktree' });
        const result = await resolveProjectDir(project);
        expect(result.dir).toBe(FAKE_REPO);
        expect(result.ephemeral).toBe(false);
    });
});

// ── clone_on_demand strategy ─────────────────────────────────────────

describe('clone_on_demand strategy', () => {
    test('returns error when gitUrl is missing', async () => {
        const project = makeTestProject({ dirStrategy: 'clone_on_demand', gitUrl: null });
        const result = await resolveProjectDir(project);
        expect(result.error).toContain('gitUrl is required');
        expect(result.dir).toBe(FAKE_REPO); // falls back to workingDir
        expect(result.ephemeral).toBe(false);
    });

    test('returns error on failed clone', async () => {
        const project = makeTestProject({
            dirStrategy: 'clone_on_demand',
            gitUrl: 'https://example.com/nonexistent/repo.git',
            baseClonePath: resolve(TEST_BASE, 'clones'),
        });
        const result = await resolveProjectDir(project);
        expect(result.error).toBeTruthy();
        expect(result.ephemeral).toBe(false);
    });

    test('reuses existing clone if .git exists', async () => {
        const cloneBase = resolve(TEST_BASE, 'clones');
        const cloneDir = resolve(cloneBase, 'testproject');
        mkdirSync(resolve(cloneDir, '.git'), { recursive: true });

        const project = makeTestProject({
            dirStrategy: 'clone_on_demand',
            gitUrl: 'https://example.com/test/repo.git',
            baseClonePath: cloneBase,
        });

        // git pull will fail since it's not a real repo, but the reuse path is taken
        const result = await resolveProjectDir(project);
        // Even if pull fails, the directory is returned (it's existing)
        expect(result.dir).toBe(cloneDir);
        expect(result.ephemeral).toBe(false);
    });
});

// ── ephemeral strategy ───────────────────────────────────────────────

describe('ephemeral strategy', () => {
    test('returns error when gitUrl is missing', async () => {
        const project = makeTestProject({ dirStrategy: 'ephemeral', gitUrl: null });
        const result = await resolveProjectDir(project);
        expect(result.error).toContain('gitUrl is required');
        expect(result.dir).toBe(FAKE_REPO);
        expect(result.ephemeral).toBe(false);
    });

    test('returns error on failed clone', async () => {
        const project = makeTestProject({
            dirStrategy: 'ephemeral',
            gitUrl: 'https://example.com/nonexistent/repo.git',
        });
        const result = await resolveProjectDir(project);
        expect(result.error).toBeTruthy();
        expect(result.ephemeral).toBe(false);
    });
});

// ── cleanupEphemeralDir ──────────────────────────────────────────────

describe('cleanupEphemeralDir', () => {
    test('removes ephemeral directory', async () => {
        const tempDir = resolve(TEST_BASE, 'ephemeral-test');
        mkdirSync(tempDir, { recursive: true });
        writeFileSync(resolve(tempDir, 'test.txt'), 'content');

        const resolved: ResolvedDir = { dir: tempDir, ephemeral: true };
        await cleanupEphemeralDir(resolved);
        expect(existsSync(tempDir)).toBe(false);
    });

    test('no-op for non-ephemeral', async () => {
        const tempDir = resolve(TEST_BASE, 'persistent-test');
        mkdirSync(tempDir, { recursive: true });

        const resolved: ResolvedDir = { dir: tempDir, ephemeral: false };
        await cleanupEphemeralDir(resolved);
        expect(existsSync(tempDir)).toBe(true);
    });

    test('handles already-deleted directory gracefully', async () => {
        const resolved: ResolvedDir = { dir: '/nonexistent/path/abc', ephemeral: true };
        // Should not throw
        await cleanupEphemeralDir(resolved);
    });
});
