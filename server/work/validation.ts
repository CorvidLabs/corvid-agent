import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLogger } from '../lib/logger';
import { scanDiff, formatScanReport } from '../lib/fetch-detector';
import { scanDiff as scanCodeDiff, formatScanReport as formatCodeScanReport } from '../lib/code-scanner';
import { assessImpact, LAYER_0_BASENAMES } from '../councils/governance';

const log = createLogger('WorkValidation');

/**
 * Run `bun install` with frozen lockfile, retrying without it on failure.
 * Uses `--ignore-scripts` to prevent postinstall hooks from bypassing
 * protected-file checks. Non-fatal — callers decide how to handle errors.
 */
export async function runBunInstall(cwd: string): Promise<void> {
    const installProc = Bun.spawn(['bun', 'install', '--frozen-lockfile', '--ignore-scripts'], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    await new Response(installProc.stdout).text();
    const installStderr = await new Response(installProc.stderr).text();
    const installExit = await installProc.exited;

    if (installExit !== 0) {
        log.warn('bun install --frozen-lockfile failed, retrying without', {
            cwd,
            stderr: installStderr.trim(),
        });
        const retryProc = Bun.spawn(['bun', 'install', '--ignore-scripts'], {
            cwd,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        await new Response(retryProc.stdout).text();
        await retryProc.exited;
    }
}

/**
 * Detect the default branch of a git repository (usually 'main' or 'master').
 * Falls back to 'main' if detection fails.
 *
 * Prefers `origin/<branch>` over the local branch ref — in long-lived worktrees
 * the local `main` may lag behind the remote, causing the diff to include commits
 * already merged to origin and producing spurious governance violations for files
 * touched in those earlier merges.
 */
async function detectDefaultBranch(cwd: string): Promise<string> {
    // Try origin refs first for an accurate baseline
    for (const ref of ['origin/main', 'origin/master']) {
        try {
            const proc = Bun.spawn(['git', 'rev-parse', '--verify', ref], {
                cwd,
                stdout: 'pipe',
                stderr: 'pipe',
            });
            await new Response(proc.stdout).text();
            const exitCode = await proc.exited;
            if (exitCode === 0) return ref;
        } catch {
            // continue
        }
    }
    // Fall back to local refs when no origin remote is available
    try {
        const proc = Bun.spawn(['git', 'rev-parse', '--verify', 'main'], {
            cwd,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        if (exitCode === 0) return 'main';

        const masterProc = Bun.spawn(['git', 'rev-parse', '--verify', 'master'], {
            cwd,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        await new Response(masterProc.stdout).text();
        const masterExit = await masterProc.exited;
        if (masterExit === 0) return 'master';
    } catch {
        // Fall through to default
    }
    return 'main';
}

/**
 * Run the full validation pipeline on a working directory:
 * 1. `bun install` (ensure deps)
 * 2. `tsc --noEmit --skipLibCheck` (if tsconfig.json exists)
 * 3. `bun test`
 * 4. Security/governance scans on git diff
 *
 * Returns `{ passed, output }` — pure function of the working directory,
 * no instance state required.
 */
export async function runValidation(workingDir: string): Promise<{ passed: boolean; output: string }> {
    const outputs: string[] = [];
    let passed = true;

    // Ensure dependencies are installed before validation.
    try {
        await runBunInstall(workingDir);
    } catch (_err) {
        // Non-fatal — if install fails, tsc/tests will report the real errors
    }

    // Run TypeScript check — only if the project has a tsconfig.json.
    // Without one, tsc prints help text and exits non-zero, which would
    // incorrectly fail validation for non-TypeScript projects (#1767).
    const tsconfigPath = resolve(workingDir, 'tsconfig.json');
    if (existsSync(tsconfigPath)) {
        try {
            const tscProc = Bun.spawn(
                ['bun', 'x', 'tsc', '--noEmit', '--skipLibCheck', '--project', tsconfigPath],
                {
                    cwd: workingDir,
                    stdout: 'pipe',
                    stderr: 'pipe',
                },
            );
            const tscStdout = await new Response(tscProc.stdout).text();
            const tscStderr = await new Response(tscProc.stderr).text();
            const tscExit = await tscProc.exited;

            const tscOutput = (tscStdout + tscStderr).trim();
            if (tscExit !== 0) {
                passed = false;
                outputs.push(`=== TypeScript Check Failed (exit ${tscExit}) ===\n${tscOutput}`);
            } else {
                outputs.push('=== TypeScript Check Passed ===');
            }
        } catch (err) {
            passed = false;
            outputs.push(`=== TypeScript Check Error ===\n${err instanceof Error ? err.message : String(err)}`);
        }
    } else {
        log.info('Skipping TypeScript check — no tsconfig.json found', { workingDir });
        outputs.push('=== TypeScript Check Skipped (no tsconfig.json) ===');
    }

    // Run tests
    try {
        const testProc = Bun.spawn(['bun', 'test'], {
            cwd: workingDir,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const testStdout = await new Response(testProc.stdout).text();
        const testStderr = await new Response(testProc.stderr).text();
        const testExit = await testProc.exited;

        const testOutput = (testStdout + testStderr).trim();
        if (testExit !== 0) {
            passed = false;
            outputs.push(`=== Tests Failed (exit ${testExit}) ===\n${testOutput}`);
        } else {
            outputs.push('=== Tests Passed ===');
        }
    } catch (err) {
        passed = false;
        outputs.push(`=== Test Runner Error ===\n${err instanceof Error ? err.message : String(err)}`);
    }

    // Security scan: check git diff for unapproved external fetch calls and malicious patterns
    try {
        // Detect the default branch — not all projects use 'main' (#1767)
        const defaultBranch = await detectDefaultBranch(workingDir);
        const diffProc = Bun.spawn(['git', 'diff', `${defaultBranch}...HEAD`], {
            cwd: workingDir,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const diffOutput = await new Response(diffProc.stdout).text();
        await diffProc.exited;

        if (diffOutput.trim()) {
            // Governance tier check — block modifications to existing Layer 0/1 files.
            // Only blocks changes that delete lines from existing protected files (real logic
            // changes). New files added to Layer 0/1 directories and pure-additive changes
            // (e.g. adding re-exports to a barrel file) are allowed: they add new security
            // infrastructure without weakening existing guarantees.
            const diffBlocks = diffOutput.split(/(?=^diff --git )/m).filter((b) => b.trim());
            const governanceBlockedPaths: string[] = [];

            for (const block of diffBlocks) {
                const pathMatch = block.match(/^diff --git .* b\/(.+)$/m);
                if (!pathMatch) continue;
                const filePath = pathMatch[1];
                const tier = assessImpact([filePath]).tier;
                if (tier >= 2) continue; // operational — not blocked

                const basename = filePath.split('/').pop() ?? '';
                const isProtectedByName = LAYER_0_BASENAMES.has(basename);
                const isNewFile = /^new file mode /m.test(block);
                const hasDeletions = /^-(?!--)/m.test(block);

                // Block if:
                //   - File basename is explicitly listed in LAYER_0_BASENAMES (always protected
                //     by name, even when added as a new file — these are named critical files)
                //   - File is an existing Layer 0/1 path that has logic changes (deletions)
                // Allow:
                //   - New files in Layer 0 directories that aren't in LAYER_0_BASENAMES
                //     (e.g. adding new security infrastructure modules to server/permissions/)
                //   - Pure additions to existing Layer 0/1 files with no removed lines
                //     (e.g. adding re-exports to a barrel index.ts)
                //   - package.json changes where every deleted line is a version-constraint
                //     string ("pkg": ">=x.y.z") — security CVE fixes that raise minimum
                //     versions in the overrides section without adding or removing packages.

                if (basename === 'package.json' && !isNewFile && hasDeletions) {
                    const deletedLines = block.match(/^-(?!--).+/gm) ?? [];
                    const allVersionBumps = deletedLines.every((line) =>
                        /^-\s+"[^"]+"\s*:\s*"[><=^~\d][^"]*",?\s*$/.test(line)
                    );
                    if (allVersionBumps && deletedLines.length > 0) continue;
                }

                if (isProtectedByName || (!isNewFile && hasDeletions)) {
                    governanceBlockedPaths.push(filePath);
                }
            }

            if (governanceBlockedPaths.length > 0) {
                passed = false;
                const tierInfo = assessImpact(governanceBlockedPaths);
                const blockedList = governanceBlockedPaths
                    .map((p) => `  - ${p} (Layer ${assessImpact([p]).tier})`)
                    .join('\n');
                outputs.push(
                    `=== Governance Tier Violation ===\n` +
                    `Work task attempted to modify ${tierInfo.tierLabel} (Layer ${tierInfo.tier}) paths.\n` +
                    `Automated workflows cannot modify Layer 0 or Layer 1 paths.\n\n` +
                    `Blocked paths:\n${blockedList}`,
                );
                log.warn('Work task blocked by governance tier', {
                    tier: tierInfo.tier,
                    tierLabel: tierInfo.tierLabel,
                    blockedPaths: governanceBlockedPaths,
                });
            }

            /**
             * Strip test and spec file sections from the diff before security scanning.
             * Test files legitimately contain mock URLs, eval patterns, and HTTP clients
             * as test fixtures — these are not real security risks and must not be flagged.
             */
            function stripTestSections(diff: string): string {
                const lines = diff.split('\n');
                const result: string[] = [];
                let skip = false;
                for (const line of lines) {
                    if (line.startsWith('diff --git')) {
                        skip =
                            /\b__tests__\//.test(line) ||
                            /\.test\.ts\b/.test(line) ||
                            /\bspecs\//.test(line) ||
                            /\.spec\.(md|ts)\b/.test(line);
                    }
                    if (!skip) result.push(line);
                }
                return result.join('\n');
            }

            const filteredDiff = stripTestSections(diffOutput);

            // Fetch detector
            const fetchResult = scanDiff(filteredDiff);
            if (fetchResult.hasUnapprovedFetches) {
                passed = false;
                outputs.push(formatScanReport(fetchResult));
                log.warn('Security scan detected unapproved fetch calls', {
                    findings: fetchResult.findings.map((f) => `${f.domain} (${f.pattern})`),
                });
            }

            // Code pattern scanner
            const codeResult = scanCodeDiff(filteredDiff);
            if (codeResult.hasCriticalFindings) {
                passed = false;
                outputs.push(formatCodeScanReport(codeResult));
                log.warn('Code scanner detected critical findings', {
                    findings: codeResult.findings
                        .filter((f) => f.severity === 'critical')
                        .map((f) => `${f.category}: ${f.pattern}`),
                });
            } else if (codeResult.hasWarnings) {
                const report = formatCodeScanReport(codeResult);
                if (report) outputs.push(report);
                log.info('Code scanner warnings (non-blocking)', {
                    findings: codeResult.findings.map((f) => `${f.category}: ${f.pattern}`),
                });
            }

            if (!fetchResult.hasUnapprovedFetches && !codeResult.hasCriticalFindings) {
                outputs.push('=== Security Scan Passed ===');
            }
        }
    } catch (err) {
        // Non-fatal: log but don't block — prefer false negatives over broken validation
        log.warn('Security scan error', {
            error: err instanceof Error ? err.message : String(err),
        });
    }

    return { passed, output: outputs.join('\n\n') };
}
