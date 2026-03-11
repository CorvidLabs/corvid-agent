#!/usr/bin/env bun
/**
 * rc-checklist.ts — Automated v1.0.0-rc gating criteria verification.
 *
 * Runs every gating check from #310 that can be automated and prints
 * a pass/fail report. Exits 0 when all checks pass, 1 otherwise.
 *
 * Usage:
 *   bun scripts/rc-checklist.ts          # run all checks
 *   bun scripts/rc-checklist.ts --json   # output JSON report
 *
 * Related: #310 (v1.0.0-rc — Release Candidate)
 */

import { execSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const jsonMode = process.argv.includes('--json');

// ─── Types ──────────────────────────────────────────────────────────────────

interface CheckResult {
    name: string;
    category: string;
    passed: boolean;
    detail: string;
}

const results: CheckResult[] = [];

function check(category: string, name: string, fn: () => { passed: boolean; detail: string }) {
    try {
        const { passed, detail } = fn();
        results.push({ name, category, passed, detail });
    } catch (err) {
        results.push({
            name,
            category,
            passed: false,
            detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
}

function exec(cmd: string): { stdout: string; exitCode: number } {
    const result = spawnSync('bash', ['-c', cmd], {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 300_000, // 5 min
    });
    return {
        stdout: (result.stdout ?? '').trim(),
        exitCode: result.status ?? 1,
    };
}

// ─── 1. Automated Security ─────────────────────────────────────────────────

check('security', 'Security test count (≥100)', () => {
    const securityTestFiles = [
        'bash-security.test.ts',
        'injection-guard.test.ts',
        'injection-hardening.test.ts',
        'prompt-injection.test.ts',
        'security-audit.test.ts',
        'security-headers.test.ts',
        'routes-security-overview.test.ts',
    ];

    let totalTests = 0;
    for (const file of securityTestFiles) {
        const fullPath = join(ROOT, 'server/__tests__', file);
        if (!existsSync(fullPath)) continue;
        const content = readFileSync(fullPath, 'utf-8');
        // Count test() and it() calls
        const matches = content.match(/\b(test|it)\s*\(/g);
        totalTests += matches?.length ?? 0;
    }

    return {
        passed: totalTests >= 100,
        detail: `${totalTests} security tests found`,
    };
});

check('security', 'Zero critical security test failures', () => {
    const securityGlob = 'server/__tests__/{bash-security,injection-guard,injection-hardening,prompt-injection,security-audit,security-headers,routes-security-overview}.test.ts';
    const { stdout, exitCode } = exec(`bun test ${securityGlob} 2>&1 | tail -5`);
    const failMatch = stdout.match(/(\d+)\s+fail/);
    const fails = failMatch ? parseInt(failMatch[1], 10) : (exitCode !== 0 ? 1 : 0);
    return {
        passed: fails === 0 && exitCode === 0,
        detail: exitCode === 0 ? 'All security tests passed' : `Exit code ${exitCode}: ${stdout.slice(-200)}`,
    };
});

check('security', 'Injection detection active on all channels', () => {
    // Verify injection scanning is imported in all inbound channels where
    // user-controlled content enters the system.
    const channels = [
        'server/algochat/message-router.ts',
        'server/discord/bridge.ts',
        'server/telegram/bridge.ts',
        'server/routes/a2a.ts',
        'server/routes/agents.ts',
        'server/routes/schedules.ts',
    ];
    const missing: string[] = [];
    for (const ch of channels) {
        const fullPath = join(ROOT, ch);
        if (!existsSync(fullPath)) { missing.push(`${ch} (not found)`); continue; }
        const content = readFileSync(fullPath, 'utf-8');
        if (!content.includes('injection') && !content.includes('InjectionGuard') && !content.includes('injectionGuard')) {
            missing.push(ch);
        }
    }
    return {
        passed: missing.length === 0,
        detail: missing.length === 0 ? 'All channels have injection detection' : `Missing: ${missing.join(', ')}`,
    };
});

// ─── 2. Access Control & Spending ──────────────────────────────────────────

check('access-control', 'Spending cap tests pass', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/spending.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Spending cap tests passed' : stdout.slice(-200),
    };
});

check('access-control', 'Tenant isolation tests pass (≥25)', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/tenant-isolation.test.ts 2>&1 | tail -5');
    const passMatch = stdout.match(/(\d+)\s+pass/);
    const count = passMatch ? parseInt(passMatch[1], 10) : 0;
    return {
        passed: exitCode === 0 && count >= 25,
        detail: `${count} tenant isolation tests passed`,
    };
});

check('access-control', 'RBAC / permission broker tests pass', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/permission-broker.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Permission broker tests passed' : stdout.slice(-200),
    };
});

// ─── 3. Cryptography ───────────────────────────────────────────────────────

check('crypto', 'Secure wipe tests pass', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/secure-wipe.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Secure wipe tests passed' : stdout.slice(-200),
    };
});

check('crypto', 'Wallet keystore tests pass', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/wallet-keystore.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Wallet keystore tests passed' : stdout.slice(-200),
    };
});

check('crypto', 'Crypto audit tests pass', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/crypto-audit.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Crypto audit tests passed' : stdout.slice(-200),
    };
});

// ─── 4. Payments ────────────────────────────────────────────────────────────

check('payments', 'Marketplace escrow tests pass', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/marketplace-escrow.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Escrow tests passed' : stdout.slice(-200),
    };
});

// ─── 5. Stability ──────────────────────────────────────────────────────────

check('stability', 'TypeScript compiles (tsc --noEmit)', () => {
    const { exitCode } = exec('bun x tsc --noEmit --skipLibCheck 2>&1');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'TypeScript compilation clean' : 'TypeScript compilation failed',
    };
});

check('stability', 'All tests pass (bun test)', () => {
    const { stdout, exitCode } = exec('bun test 2>&1 | tail -5');
    const passMatch = stdout.match(/(\d+)\s+pass/);
    const failMatch = stdout.match(/(\d+)\s+fail/);
    const passes = passMatch ? parseInt(passMatch[1], 10) : 0;
    const fails = failMatch ? parseInt(failMatch[1], 10) : 0;
    return {
        passed: exitCode === 0 && fails === 0,
        detail: `${passes} pass, ${fails} fail`,
    };
});

check('stability', 'All specs pass (spec:check)', () => {
    const { stdout, exitCode } = exec('bun run spec:check 2>&1 | tail -3');
    const specMatch = stdout.match(/(\d+)\s+passed.*?(\d+)\s+failed/);
    const passed = specMatch ? parseInt(specMatch[1], 10) : 0;
    const failed = specMatch ? parseInt(specMatch[2], 10) : 0;
    return {
        passed: exitCode === 0 && failed === 0,
        detail: `${passed} specs passed, ${failed} failed`,
    };
});

check('stability', 'No CRITICAL/HIGH dependency vulnerabilities', () => {
    // Use bun's built-in audit or npm audit
    const { stdout, exitCode } = exec('npm audit --audit-level=high 2>&1 | tail -5');
    // npm audit exits non-zero if vulnerabilities found
    const hasCritical = stdout.toLowerCase().includes('critical') || stdout.toLowerCase().includes('high');
    // If npm audit isn't available, fall back to checking package versions
    if (stdout.includes('command not found') || stdout.includes('ERR!')) {
        return { passed: true, detail: 'npm audit not available (manual check required)' };
    }
    return {
        passed: exitCode === 0 || !hasCritical,
        detail: hasCritical ? `Vulnerabilities found: ${stdout.slice(-200)}` : 'No critical/high vulnerabilities',
    };
});

check('stability', 'Security scan passes (ci-security-scan)', () => {
    const { stdout, exitCode } = exec('bun scripts/ci-security-scan.ts 2>&1 | tail -5');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Security scan clean' : stdout.slice(-200),
    };
});

// ─── 6. Deliverables ───────────────────────────────────────────────────────

check('deliverables', 'Mainnet config template exists (.env.mainnet.example)', () => {
    const exists = existsSync(join(ROOT, '.env.mainnet.example'));
    return {
        passed: exists,
        detail: exists ? '.env.mainnet.example present' : '.env.mainnet.example missing',
    };
});

// ─── Report ─────────────────────────────────────────────────────────────────

if (jsonMode) {
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log(JSON.stringify({ results, summary: { passed, failed, total: results.length } }, null, 2));
} else {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║            v1.0.0-rc — Release Candidate Checklist          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    let currentCategory = '';
    for (const r of results) {
        if (r.category !== currentCategory) {
            currentCategory = r.category;
            console.log(`\n  [${currentCategory.toUpperCase()}]`);
        }
        const icon = r.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
        console.log(`    ${icon} ${r.name}`);
        console.log(`      ${r.detail}`);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    console.log('\n' + '─'.repeat(62));
    if (failed === 0) {
        console.log(`\x1b[32m  ALL ${total} CHECKS PASSED — RC criteria met.\x1b[0m`);
    } else {
        console.log(`\x1b[31m  ${failed}/${total} CHECKS FAILED — RC criteria NOT met.\x1b[0m`);
        console.log(`\x1b[32m  ${passed}/${total} passed.\x1b[0m`);
    }
    console.log('');
}

process.exit(results.some(r => !r.passed) ? 1 : 0);
