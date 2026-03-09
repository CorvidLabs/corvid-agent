/**
 * CodebaseHealthCollector — programmatic codebase health metrics via Bun.spawn.
 *
 * Collects TypeScript errors, test results, TODO/FIXME/HACK counts, large files,
 * and outdated dependencies. All sub-collectors are run in parallel and individual
 * failures are non-fatal.
 */

import { createLogger } from '../lib/logger';
import { resolveExecutable } from '../lib/env';

const log = createLogger('HealthCollector');

const SPAWN_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 180_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TscError {
    file: string;
    line: number;
    col: number;
    code: string;
    message: string;
}

export interface LargeFile {
    file: string;
    lines: number;
}

export interface OutdatedDep {
    name: string;
    current: string;
    latest: string;
}

export interface HealthMetrics {
    tscErrors: TscError[];
    tscErrorCount: number;
    tscPassed: boolean;
    testsPassed: boolean;
    testSummary: string;
    testFailureCount: number;
    todoCount: number;
    fixmeCount: number;
    hackCount: number;
    todoSamples: string[];
    largeFiles: LargeFile[];
    outdatedDeps: OutdatedDep[];
    collectedAt: string;
    collectionTimeMs: number;
}

// ─── Spawn Helper ────────────────────────────────────────────────────────────

async function spawnAndCapture(
    cmd: string[],
    cwd: string,
    timeoutMs: number = SPAWN_TIMEOUT_MS,
): Promise<{ stdout: string; exitCode: number }> {
    // Resolve the executable path (Bun.which is broken on Windows)
    const resolvedCmd = [resolveExecutable(cmd[0]), ...cmd.slice(1)];
    const proc = Bun.spawn(resolvedCmd, {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    });

    const timeout = setTimeout(() => {
        try { proc.kill(); } catch { /* already dead */ }
    }, timeoutMs);

    try {
        const stdoutText = await new Response(proc.stdout).text();
        const stderrText = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        return { stdout: stdoutText + stderrText, exitCode };
    } finally {
        clearTimeout(timeout);
    }
}

// ─── TSC Error Parsing ───────────────────────────────────────────────────────

const TSC_ERROR_RE = /^(.+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;

export function parseTscOutput(output: string): TscError[] {
    const errors: TscError[] = [];
    for (const line of output.split('\n')) {
        const match = TSC_ERROR_RE.exec(line.trim());
        if (match) {
            errors.push({
                file: match[1],
                line: parseInt(match[2], 10),
                col: parseInt(match[3], 10),
                code: match[4],
                message: match[5],
            });
        }
    }
    return errors;
}

// ─── Test Output Parsing ─────────────────────────────────────────────────────

export function parseTestOutput(output: string, exitCode: number): { passed: boolean; summary: string; failureCount: number } {
    const lines = output.split('\n');
    const last50 = lines.slice(-50).join('\n');

    // Search entire output for bun test summary line (stdout may not be at the end
    // when stderr is appended after it)
    const failMatch = output.match(/^\s*(\d+)\s+fail\b/im);
    const passMatch = output.match(/^\s*(\d+)\s+pass\b/im);
    const failureCount = failMatch ? parseInt(failMatch[1], 10) : 0;

    // When the test runner produces a clear "X pass / Y fail" summary, trust it
    // over the exit code. Non-zero exit codes can occur on some platforms due to
    // stderr output or signal handling even when all tests pass.
    const hasTestSummary = failMatch !== null && passMatch !== null;

    return {
        passed: hasTestSummary
            ? failureCount === 0
            : exitCode === 0 && failureCount === 0,
        summary: last50.trim(),
        failureCount: hasTestSummary
            ? failureCount
            : (exitCode !== 0 ? Math.max(failureCount, 1) : failureCount),
    };
}

// ─── TODO/FIXME/HACK Counting ────────────────────────────────────────────────

export function parseTodoOutput(output: string): { todoCount: number; fixmeCount: number; hackCount: number; samples: string[] } {
    // grep output is file:line:content — extract the content portion for analysis
    const lines = output.split('\n').filter((l) => l.trim().length > 0);
    let todoCount = 0;
    let fixmeCount = 0;
    let hackCount = 0;
    const samples: string[] = [];

    // Match TODO/FIXME/HACK only when they appear as comment markers, not inside
    // strings that reference the feature (e.g. 'TODO collection failed' or
    // `if (/TODO/i.test(line))`). We look for the keyword preceded by comment
    // syntax or at the start of the content after the grep file:line: prefix.
    const COMMENT_TODO  = /(?:\/\/|\/\*|\*)\s*TODO\b/i;
    const COMMENT_FIXME = /(?:\/\/|\/\*|\*)\s*FIXME\b/i;
    const COMMENT_HACK  = /(?:\/\/|\/\*|\*)\s*HACK\b/i;

    for (const line of lines) {
        // Extract the content portion after the grep prefix (file:linenum:)
        const content = line.replace(/^[^:]+:\d+:/, '');
        const isTodo  = COMMENT_TODO.test(content);
        const isFixme = COMMENT_FIXME.test(content);
        const isHack  = COMMENT_HACK.test(content);

        if (isTodo)  todoCount++;
        if (isFixme) fixmeCount++;
        if (isHack)  hackCount++;
        if ((isTodo || isFixme || isHack) && samples.length < 10) {
            samples.push(line.trim().slice(0, 200));
        }
    }

    return { todoCount, fixmeCount, hackCount, samples };
}

// ─── Large File Detection ────────────────────────────────────────────────────

export function parseLargeFiles(output: string, threshold: number = 500): LargeFile[] {
    const files: LargeFile[] = [];
    for (const line of output.split('\n')) {
        const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
        if (match) {
            const lineCount = parseInt(match[1], 10);
            const filePath = match[2].trim();
            if (lineCount > threshold && filePath.endsWith('.ts')) {
                files.push({ file: filePath, lines: lineCount });
            }
        }
    }
    return files.sort((a, b) => b.lines - a.lines);
}

// ─── Outdated Dependency Parsing ─────────────────────────────────────────────

export function parseOutdatedOutput(output: string): OutdatedDep[] {
    const deps: OutdatedDep[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
        // bun outdated output format: "package  current  latest"
        // Various whitespace-separated columns
        const parts = line.trim().split(/\s{2,}|\t+/);
        if (parts.length >= 3) {
            const name = parts[0];
            const current = parts[1];
            const latest = parts[parts.length - 1];
            // Validate: name looks like a package, current and latest look like versions
            if (
                name &&
                !name.startsWith('─') &&
                !name.startsWith('Package') &&
                /^\d+\./.test(current) &&
                /^\d+\./.test(latest) &&
                current !== latest
            ) {
                deps.push({ name, current, latest });
            }
        }
    }

    return deps;
}

// ─── Collector ───────────────────────────────────────────────────────────────

export class CodebaseHealthCollector {
    async collect(workingDir: string): Promise<HealthMetrics> {
        const start = Date.now();

        const [tscResult, testResult, todoResult, filesResult, outdatedResult] = await Promise.all([
            this.runTsc(workingDir).catch((err) => {
                log.warn('TSC collection failed', { error: err instanceof Error ? err.message : String(err) });
                return { errors: [] as TscError[], passed: false };
            }),
            this.runTests(workingDir).catch((err) => {
                log.warn('Test collection failed', { error: err instanceof Error ? err.message : String(err) });
                return { passed: false, summary: 'Collection failed', failureCount: 0 };
            }),
            this.countTodos(workingDir).catch((err) => {
                log.warn('TODO collection failed', { error: err instanceof Error ? err.message : String(err) });
                return { todoCount: 0, fixmeCount: 0, hackCount: 0, samples: [] as string[] };
            }),
            this.findLargeFiles(workingDir).catch((err) => {
                log.warn('Large file detection failed', { error: err instanceof Error ? err.message : String(err) });
                return [] as LargeFile[];
            }),
            this.checkOutdated(workingDir).catch((err) => {
                log.warn('Outdated dep check failed', { error: err instanceof Error ? err.message : String(err) });
                return [] as OutdatedDep[];
            }),
        ]);

        return {
            tscErrors: tscResult.errors,
            tscErrorCount: tscResult.errors.length,
            tscPassed: tscResult.passed,
            testsPassed: testResult.passed,
            testSummary: testResult.summary,
            testFailureCount: testResult.failureCount,
            todoCount: todoResult.todoCount,
            fixmeCount: todoResult.fixmeCount,
            hackCount: todoResult.hackCount,
            todoSamples: todoResult.samples,
            largeFiles: filesResult,
            outdatedDeps: outdatedResult,
            collectedAt: new Date().toISOString(),
            collectionTimeMs: Date.now() - start,
        };
    }

    private async runTsc(cwd: string): Promise<{ errors: TscError[]; passed: boolean }> {
        const { stdout, exitCode } = await spawnAndCapture(
            ['bun', 'x', 'tsc', '--noEmit', '--skipLibCheck'],
            cwd,
        );
        const errors = parseTscOutput(stdout);
        return { errors, passed: exitCode === 0 };
    }

    private async runTests(cwd: string): Promise<{ passed: boolean; summary: string; failureCount: number }> {
        const { stdout, exitCode } = await spawnAndCapture(
            ['bun', 'test'],
            cwd,
            TEST_TIMEOUT_MS,
        );
        return parseTestOutput(stdout, exitCode);
    }

    private async countTodos(cwd: string): Promise<{ todoCount: number; fixmeCount: number; hackCount: number; samples: string[] }> {
        const { stdout } = await spawnAndCapture(
            ['grep', '-rn', '--exclude-dir=node_modules', '--exclude-dir=__tests__', 'TODO\\|FIXME\\|HACK', '--include=*.ts', 'server/', 'client/', 'shared/'],
            cwd,
        );
        return parseTodoOutput(stdout);
    }

    private async findLargeFiles(cwd: string): Promise<LargeFile[]> {
        // Use Bun's Glob API instead of `find` + `wc` (cross-platform)
        const { join } = require('node:path');
        const { readFileSync } = require('node:fs');
        const glob = new Bun.Glob('{server,client,shared}/**/*.ts');
        const files: LargeFile[] = [];
        const THRESHOLD = 500;

        for await (const match of glob.scan({ cwd, dot: false, followSymlinks: false })) {
            // Skip files inside node_modules or other dependency directories
            if (match.includes('node_modules') || match.includes('.angular')) continue;
            try {
                const content = readFileSync(join(cwd, match), 'utf-8');
                const lineCount = content.split('\n').length;
                if (lineCount > THRESHOLD) {
                    files.push({ file: match, lines: lineCount });
                }
            } catch {
                // Skip unreadable files
            }
        }

        return files.sort((a, b) => b.lines - a.lines);
    }

    private async checkOutdated(cwd: string): Promise<OutdatedDep[]> {
        const { stdout } = await spawnAndCapture(
            ['bun', 'outdated'],
            cwd,
        );
        return parseOutdatedOutput(stdout);
    }
}
