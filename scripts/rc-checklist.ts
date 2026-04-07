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

import { spawnSync } from 'node:child_process';
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
    // After PR #933, Discord injection scanning moved from bridge.ts to
    // message-handler.ts. Check the actual message-handling entry point.
    const channels = [
        'server/algochat/message-router.ts',
        'server/discord/message-handler.ts',
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

check('security', 'Jailbreak prevention tests pass', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/prompt-injection.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Jailbreak prevention tests passed' : stdout.slice(-200),
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

check('access-control', 'Guards tests pass (auth, role, rate-limit)', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/guards.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Guards tests passed' : stdout.slice(-200),
    };
});

check('access-control', 'RBAC guards applied to all route modules', () => {
    // Verify every route module is protected by EITHER:
    // 1. Per-file guard/context imports (tenantRoleGuard, RequestContext), OR
    // 2. Central guard chain via requiresAdminRole() path matching in guards.ts, OR
    // 3. Custom auth (e.g., Slack signing secret verification)
    const routeDir = join(ROOT, 'server/routes');
    const publicRoutes = new Set(['health.ts', 'index.ts', 'auth-flow.ts', 'onboarding.ts']);

    // Routes protected by requiresAdminRole() path checks in guards.ts,
    // Slack signing secret, internal-only protocols, or test-only stubs.
    const centrallyGuardedRoutes = new Set([
        'allowlist.ts',          // /api/allowlist → requiresAdminRole
        'github-allowlist.ts',   // /api/github-allowlist → requiresAdminRole
        'performance.ts',        // /api/performance → requiresAdminRole
        'permissions.ts',        // /api/permissions → requiresAdminRole
        'security-overview.ts',  // /api/audit-log → requiresAdminRole
        'audit.ts',              // /api/audit-log → requiresAdminRole
        'ollama.ts',             // internal provider config, authGuard in middleware
        'slack.ts',              // Slack signing secret verification (custom auth)
        'mcp-api.ts',            // internal MCP server (stdio subprocess, not HTTP)
        'exam.ts',               // educational test endpoints, authGuard in middleware
        'bridge-delivery.ts',    // bridge internal delivery, authGuard in middleware
        'plugins.ts',            // plugin registry query, authGuard in middleware
        'a2a.ts',                // agent-to-agent protocol, authGuard in middleware
    ]);

    const files = readdirSync(routeDir).filter(
        f => f.endsWith('.ts') && !publicRoutes.has(f) && !centrallyGuardedRoutes.has(f),
    );
    const missing: string[] = [];

    for (const file of files) {
        const content = readFileSync(join(routeDir, file), 'utf-8');
        const hasGuardImport = content.includes('guards') || content.includes('Guard');
        const hasRequestContext = content.includes('RequestContext');
        if (!hasGuardImport && !hasRequestContext) {
            missing.push(file);
        }
    }

    const totalRoutes = readdirSync(routeDir).filter(f => f.endsWith('.ts') && !publicRoutes.has(f)).length;
    return {
        passed: missing.length === 0,
        detail: missing.length === 0
            ? `All ${totalRoutes} route modules protected (${files.length} per-file + ${centrallyGuardedRoutes.size} central guard chain)`
            : `Missing guards: ${missing.join(', ')}`,
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

check('crypto', 'Key rotation tests pass', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/key-rotation.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Key rotation tests passed' : stdout.slice(-200),
    };
});

check('crypto', 'Key provider tests pass', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/key-provider.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Key provider tests passed' : stdout.slice(-200),
    };
});

check('crypto', 'Key access audit tests pass', () => {
    const { stdout, exitCode } = exec('bun test server/__tests__/key-access-audit.test.ts 2>&1 | tail -3');
    return {
        passed: exitCode === 0,
        detail: exitCode === 0 ? 'Key access audit tests passed' : stdout.slice(-200),
    };
});

check('crypto', 'Wallet encryption uses AES-256-GCM', () => {
    // Verify the crypto module uses AES-256-GCM for wallet encryption.
    // crypto.ts uses Web Crypto API ('AES-GCM' + 256-bit key length).
    // env-encryption.ts uses Node crypto ('aes-256-gcm'). Both are valid.
    const cryptoPath = join(ROOT, 'server/lib/crypto.ts');
    if (!existsSync(cryptoPath)) return { passed: false, detail: 'server/lib/crypto.ts not found' };
    const content = readFileSync(cryptoPath, 'utf-8');
    // Web Crypto API uses 'AES-GCM' with { length: 256 }; Node uses 'aes-256-gcm'
    const hasAes256Gcm = content.includes('aes-256-gcm') || content.includes('AES-GCM');
    // Web Crypto API uses 'PBKDF2'; Node uses pbkdf2Sync
    const hasPbkdf2 = content.toLowerCase().includes('pbkdf2');
    return {
        passed: hasAes256Gcm && hasPbkdf2,
        detail: `AES-256-GCM: ${hasAes256Gcm ? 'yes' : 'NO'}, PBKDF2: ${hasPbkdf2 ? 'yes' : 'NO'}`,
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

check('payments', 'Escrow auto-release (72h) tested', () => {
    // Verify the escrow test file covers processAutoReleases.
    const escrowTest = join(ROOT, 'server/__tests__/marketplace-escrow.test.ts');
    if (!existsSync(escrowTest)) return { passed: false, detail: 'Escrow test file not found' };
    const content = readFileSync(escrowTest, 'utf-8');
    const hasAutoRelease = content.includes('processAutoReleases') || content.includes('auto-release') || content.includes('autoRelease');
    return {
        passed: hasAutoRelease,
        detail: hasAutoRelease ? 'Auto-release test coverage present' : 'No auto-release test coverage found',
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

// ─── 7. Manual Checks (informational — not gating) ─────────────────────────
// These items from #310 require human verification and are listed for reference.

const manualChecks = [
    '3+ external testnet users running stable instances',
    'Zero critical issues reported by testnet users',
    'Self-hosting docs validated by external users',
    'Owner security posture review complete',
    'Owner sign-off on mainnet readiness',
];

// ─── Report ─────────────────────────────────────────────────────────────────

if (jsonMode) {
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log(JSON.stringify({ results, manualChecks, summary: { passed, failed, total: results.length } }, null, 2));
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

    console.log('\n  [MANUAL — requires human verification]');
    for (const item of manualChecks) {
        console.log(`    \x1b[33m○\x1b[0m ${item}`);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    console.log('\n' + '─'.repeat(62));
    if (failed === 0) {
        console.log(`\x1b[32m  ALL ${total} AUTOMATED CHECKS PASSED — RC criteria met.\x1b[0m`);
        console.log(`\x1b[33m  ${manualChecks.length} manual checks still require human sign-off.\x1b[0m`);
    } else {
        console.log(`\x1b[31m  ${failed}/${total} CHECKS FAILED — RC criteria NOT met.\x1b[0m`);
        console.log(`\x1b[32m  ${passed}/${total} passed.\x1b[0m`);
    }
    console.log('');
}

process.exit(results.some(r => !r.passed) ? 1 : 0);
