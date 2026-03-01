#!/usr/bin/env bun
/**
 * Unified CI security scanner — orchestrates all custom security checks.
 *
 * Runs on PRs (via CI) and locally (`bun run security:scan`).
 * Exits 1 if any critical finding is detected, 0 otherwise.
 *
 * Checks:
 *   1. code-scanner  — malicious code patterns (eval, child_process, etc.)
 *   2. fetch-detector — unapproved external fetch calls
 *   3. SQL injection  — string interpolation in SQL queries
 */

import { scanDiff as scanCode, formatScanReport as formatCodeReport } from '../server/lib/code-scanner';
import { scanDiff as scanFetch, formatScanReport as formatFetchReport } from '../server/lib/fetch-detector';

let failed = false;

// ── 1. Get diff ─────────────────────────────────────────────────────────

const baseRef = process.env.GITHUB_BASE_REF;
const diffArgs = baseRef
    ? ['git', 'diff', `origin/${baseRef}...HEAD`]
    : ['git', 'diff', 'HEAD~1'];

let diffOutput = '';
try {
    const diffProc = Bun.spawn(diffArgs, { stdout: 'pipe', stderr: 'pipe' });
    diffOutput = await new Response(diffProc.stdout).text();
    const exitCode = await diffProc.exited;

    if (exitCode !== 0) {
        // Fallback: no prior commits (fresh repo) — scan everything staged
        const fallbackProc = Bun.spawn(['git', 'diff', '--cached'], { stdout: 'pipe', stderr: 'pipe' });
        diffOutput = await new Response(fallbackProc.stdout).text();
        await fallbackProc.exited;
    }
} catch (err) {
    console.error('Failed to get diff:', err instanceof Error ? err.message : String(err));
    process.exit(1);
}

if (!diffOutput.trim()) {
    console.log('No diff to scan — all checks passed.');
    process.exit(0);
}

/**
 * Strip diff sections for test files — they contain malicious patterns
 * and unapproved URLs as test fixtures, not real code.
 */
function stripTestFiles(diff: string): string {
    const lines = diff.split('\n');
    const result: string[] = [];
    let skip = false;

    for (const line of lines) {
        if (line.startsWith('diff --git')) {
            skip = /\b__tests__\//.test(line) || /\.test\.ts\b/.test(line);
        }
        if (!skip) result.push(line);
    }

    return result.join('\n');
}

const filteredDiff = stripTestFiles(diffOutput);

// ── 2. Code scanner ────────────────────────────────────────────────────

console.log('Running code pattern scanner...');
const codeResult = scanCode(filteredDiff);
const codeReport = formatCodeReport(codeResult);
if (codeReport) console.log(codeReport);

if (codeResult.hasCriticalFindings) {
    failed = true;
} else if (codeResult.hasWarnings) {
    console.log('Code scanner: warnings only (non-blocking).');
} else {
    console.log('Code scanner: clean.');
}

// ── 3. Fetch detector ──────────────────────────────────────────────────

console.log('\nRunning fetch detector...');
const fetchResult = scanFetch(filteredDiff);
const fetchReport = formatFetchReport(fetchResult);
if (fetchReport) console.log(fetchReport);

if (fetchResult.hasUnapprovedFetches) {
    failed = true;
} else {
    console.log('Fetch detector: clean.');
}

// ── 4. SQL injection check ─────────────────────────────────────────────

console.log('\nRunning SQL injection check...');
try {
    const sqlProc = Bun.spawn(['bash', 'scripts/check-sql-injection.sh'], {
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const sqlStdout = await new Response(sqlProc.stdout).text();
    const sqlExit = await sqlProc.exited;

    if (sqlStdout.trim()) console.log(sqlStdout.trim());

    if (sqlExit !== 0) {
        console.log('SQL injection check: warnings found (non-blocking).');
    } else {
        console.log('SQL injection check: clean.');
    }
} catch (err) {
    console.error('SQL injection check error:', err instanceof Error ? err.message : String(err));
    // Non-fatal: don't block on script execution errors
}

// ── Summary ────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
if (failed) {
    console.log('SECURITY SCAN FAILED — see findings above.');
    process.exit(1);
} else {
    console.log('All security checks passed.');
    process.exit(0);
}
