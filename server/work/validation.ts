import { createLogger } from '../lib/logger';
import { scanDiff, formatScanReport } from '../lib/fetch-detector';
import { scanDiff as scanCodeDiff, formatScanReport as formatCodeScanReport } from '../lib/code-scanner';
import { assessImpact } from '../councils/governance';
import { resolveExecutable } from '../lib/env';

const log = createLogger('WorkValidation');

/**
 * Run `bun install` with frozen lockfile, retrying without it on failure.
 * Uses `--ignore-scripts` to prevent postinstall hooks from bypassing
 * protected-file checks. Non-fatal — callers decide how to handle errors.
 */
export async function runBunInstall(cwd: string): Promise<void> {
    const installProc = Bun.spawn([resolveExecutable('bun'), 'install', '--frozen-lockfile', '--ignore-scripts'], {
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
        const retryProc = Bun.spawn([resolveExecutable('bun'), 'install', '--ignore-scripts'], {
            cwd,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        await new Response(retryProc.stdout).text();
        await retryProc.exited;
    }
}

/**
 * Run the full validation pipeline on a working directory:
 * 1. `bun install` (ensure deps)
 * 2. `tsc --noEmit --skipLibCheck`
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

    // Run TypeScript check
    try {
        const tscProc = Bun.spawn([resolveExecutable('bun'), 'x', 'tsc', '--noEmit', '--skipLibCheck'], {
            cwd: workingDir,
            stdout: 'pipe',
            stderr: 'pipe',
        });
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

    // Run tests
    try {
        const testProc = Bun.spawn([resolveExecutable('bun'), 'test'], {
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
        const diffProc = Bun.spawn([resolveExecutable('git'), 'diff', 'main...HEAD'], {
            cwd: workingDir,
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const diffOutput = await new Response(diffProc.stdout).text();
        await diffProc.exited;

        if (diffOutput.trim()) {
            // Governance tier check — block changes to Layer 0/1 paths in automated workflows
            const changedFiles = diffOutput
                .split('\n')
                .filter((line) => line.startsWith('diff --git'))
                .map((line) => {
                    const match = line.match(/b\/(.+)$/);
                    return match?.[1] ?? '';
                })
                .filter(Boolean);

            if (changedFiles.length > 0) {
                const impact = assessImpact(changedFiles);
                if (impact.blockedFromAutomation) {
                    passed = false;
                    const blockedList = impact.affectedPaths
                        .filter((p) => p.tier < 2)
                        .map((p) => `  - ${p.path} (Layer ${p.tier})`)
                        .join('\n');
                    outputs.push(
                        `=== Governance Tier Violation ===\n` +
                        `Work task attempted to modify ${impact.tierLabel} (Layer ${impact.tier}) paths.\n` +
                        `Automated workflows cannot modify Layer 0 or Layer 1 paths.\n\n` +
                        `Blocked paths:\n${blockedList}`,
                    );
                    log.warn('Work task blocked by governance tier', {
                        tier: impact.tier,
                        tierLabel: impact.tierLabel,
                        blockedPaths: impact.affectedPaths.filter((p) => p.tier < 2).map((p) => p.path),
                    });
                }
            }

            // Fetch detector
            const fetchResult = scanDiff(diffOutput);
            if (fetchResult.hasUnapprovedFetches) {
                passed = false;
                outputs.push(formatScanReport(fetchResult));
                log.warn('Security scan detected unapproved fetch calls', {
                    findings: fetchResult.findings.map((f) => `${f.domain} (${f.pattern})`),
                });
            }

            // Code pattern scanner
            const codeResult = scanCodeDiff(diffOutput);
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
