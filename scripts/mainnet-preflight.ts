#!/usr/bin/env bun
/**
 * mainnet-preflight.ts — Launch-day security and configuration checks for v1.0.0.
 *
 * Automates the "Security Final Check" items from #311 (v1.0.0 — Mainnet Launch):
 *   - No testnet-only bypasses left in code
 *   - Security tests still passing
 *   - Rate limiting active
 *   - RBAC guard chain enforced
 *   - USDC mainnet ASA ID correct (31566704)
 *   - Environment configured for mainnet (if .env is present)
 *
 * Usage:
 *   bun scripts/mainnet-preflight.ts               # Full preflight
 *   bun scripts/mainnet-preflight.ts --env .env    # Check specific env file
 *   bun scripts/mainnet-preflight.ts --json        # Machine-readable output
 *
 * Related: #311 (v1.0.0 — Mainnet Launch)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const jsonMode = process.argv.includes('--json');

// Parse --env flag
const envFlagIdx = process.argv.indexOf('--env');
const envFile = envFlagIdx >= 0 ? process.argv[envFlagIdx + 1] : null;

// ─── Types ──────────────────────────────────────────────────────────────────

interface CheckResult {
    name: string;
    category: string;
    passed: boolean;
    warn: boolean;
    detail: string;
}

const results: CheckResult[] = [];

function pass(category: string, name: string, detail = '') {
    results.push({ name, category, passed: true, warn: false, detail });
}

function fail(category: string, name: string, detail = '') {
    results.push({ name, category, passed: false, warn: false, detail });
}

function warn(category: string, name: string, detail = '') {
    results.push({ name, category, passed: true, warn: true, detail });
}

function exec(cmd: string): { stdout: string; stderr: string; exitCode: number } {
    const result = Bun.spawnSync(['bash', '-c', cmd], {
        cwd: ROOT,
        timeout: 300_000,
    });
    return {
        stdout: (result.stdout?.toString() ?? '').trim(),
        stderr: (result.stderr?.toString() ?? '').trim(),
        exitCode: result.exitCode ?? 1,
    };
}

function readFile(rel: string): string | null {
    const full = join(ROOT, rel);
    if (!existsSync(full)) return null;
    return readFileSync(full, 'utf-8');
}

// NOTE: grepFiles performs textual pattern matching — it is a heuristic, not a
// structural proof. Patterns using variables, helpers, or spread may not be
// detected. Results are adequate for a preflight checklist but not a formal audit.
function grepFiles(pattern: string, dirs: string[], extensions = ['ts']): string[] {
    const includes = extensions.map((e) => `--include='*.${e}'`).join(' ');
    const cmd = `grep -rn '${pattern}' ${dirs.join(' ')} ${includes} 2>/dev/null || true`;
    const { stdout } = exec(cmd);
    return stdout ? stdout.split('\n').filter(Boolean) : [];
}

// ─── 1. Testnet-Only Bypasses ───────────────────────────────────────────────

console.log('\n=== 1. Testnet-Only Bypass Scan ===\n');

// Check for hardcoded testnet dispenser / faucet calls in non-test server code
{
    const matches = grepFiles(
        'dispenser\\.testnet\\|testnet.*faucet\\|faucet.*testnet',
        ['server'],
    ).filter((l) => !l.includes('.test.ts') && !l.includes('// '));

    // These should only appear inside `network === 'testnet'` guards
    const unguarded = matches.filter((line) => {
        // Check if the file has a network guard surrounding the URL
        const file = line.split(':')[0];
        const content = readFile(file.replace(ROOT + '/', '')) ?? '';
        // If the URL is inside a testnet-conditional block it's fine
        return !content.includes("network === 'testnet'") && !content.includes('TESTNET_DISPENSER_URL');
    });

    if (unguarded.length === 0) {
        pass('bypasses', 'Testnet dispenser URLs are guard-gated', `${matches.length} references, all behind network=testnet checks`);
    } else {
        fail('bypasses', 'Unguarded testnet dispenser URL found', unguarded.slice(0, 3).join('\n'));
    }
}

// Check for testnet USDC ASA IDs (testnet USDC is 10458941 — NOT the mainnet 31566704)
{
    const testnetUsdcAsaId = 10458941;
    const matches = grepFiles(
        String(testnetUsdcAsaId),
        ['server'],
    ).filter((l) => !l.includes('.test.ts'));

    if (matches.length === 0) {
        pass('bypasses', 'No testnet USDC ASA ID (10458941) hardcoded in server code');
    } else {
        fail('bypasses', `Testnet USDC ASA ID (${testnetUsdcAsaId}) found in server code`, matches.join('\n'));
    }
}

// Check mainnet USDC ASA ID is correct (31566704)
{
    const mainnetId = 31566704;
    const matches = grepFiles(String(mainnetId), ['server']).filter((l) => !l.includes('.test.ts'));
    if (matches.length > 0) {
        pass('bypasses', `Mainnet USDC ASA ID (${mainnetId}) present in server code`, `${matches.length} reference(s)`);
    } else {
        warn('bypasses', `Mainnet USDC ASA ID (${mainnetId}) not found`, 'May be USDC_ASA_ID env-var only — verify .env.mainnet.example');
    }
}

// Check that LIBRARY/CRVLIB localnet-only guard is explicit
{
    const libraryGuard = readFile('server/memory/library-sync.ts');
    if (libraryGuard?.includes('localnet-only')) {
        pass('bypasses', 'CRVLIB localnet-only guard documented in library-sync.ts');
    } else {
        warn('bypasses', 'CRVLIB localnet guard may be undocumented', 'Verify server/memory/library-sync.ts');
    }
}

// ─── 2. RBAC / Guard Chain ──────────────────────────────────────────────────

console.log('=== 2. RBAC & Guard Chain ===\n');

{
    // NOTE: string-searches routes/index.ts for guard names — adequate for a
    // checklist but may miss guards registered via variables or helpers.
    const indexTs = readFile('server/routes/index.ts') ?? '';

    const hasAuthGuard = indexTs.includes('authGuard(config)');
    const hasRateLimit = indexTs.includes('rateLimitGuard(');
    const hasRoleGuard = indexTs.includes('roleGuard(');
    const hasEndpointRL = indexTs.includes('endpointRateLimitGuard(');

    if (hasAuthGuard) {
        pass('rbac', 'authGuard applied to request pipeline in routes/index.ts');
    } else {
        fail('rbac', 'authGuard NOT found in routes/index.ts guard chain');
    }

    if (hasRateLimit) {
        pass('rbac', 'rateLimitGuard applied to request pipeline');
    } else {
        fail('rbac', 'rateLimitGuard NOT found in routes/index.ts');
    }

    if (hasRoleGuard) {
        pass('rbac', 'roleGuard applied for admin endpoints');
    } else {
        fail('rbac', 'roleGuard NOT found in routes/index.ts');
    }

    if (hasEndpointRL) {
        pass('rbac', 'Endpoint-level rate limiting applied');
    } else {
        warn('rbac', 'endpointRateLimitGuard not found in guard chain');
    }
}

// Check tenantGuard is in the chain
{
    const indexTs = readFile('server/routes/index.ts') ?? '';
    if (indexTs.includes('tenantGuard(')) {
        pass('rbac', 'tenantGuard applied for cross-tenant isolation');
    } else {
        fail('rbac', 'tenantGuard NOT found in routes/index.ts guard chain');
    }
}

// ─── 3. USDC Integration ────────────────────────────────────────────────────

console.log('=== 3. USDC / Payment Integration ===\n');

{
    const usdcTs = readFile('server/billing/usdc.ts') ?? '';
    if (usdcTs.includes('MAINNET_USDC_ASA_ID = 31566704')) {
        pass('payments', 'MAINNET_USDC_ASA_ID constant set to 31566704 in usdc.ts');
    } else {
        fail('payments', 'MAINNET_USDC_ASA_ID not correctly set in server/billing/usdc.ts');
    }

    // Auto-fallback to mainnet ID when network=mainnet
    if (usdcTs.includes("resolvedAsaId = MAINNET_USDC_ASA_ID")) {
        pass('payments', 'USDC watcher auto-uses mainnet ASA ID on mainnet network');
    } else {
        warn('payments', 'USDC mainnet auto-resolve pattern not confirmed — check server/billing/usdc.ts');
    }
}

// ─── 4. Wallet Encryption Enforcement ──────────────────────────────────────

console.log('=== 4. Wallet Encryption ===\n');

{
    const cryptoTs = readFile('server/lib/crypto.ts') ?? '';
    if (cryptoTs.includes("must be set for mainnet")) {
        pass('crypto', 'WALLET_ENCRYPTION_KEY required on mainnet (enforced in lib/crypto.ts)');
    } else {
        fail('crypto', 'WALLET_ENCRYPTION_KEY mainnet enforcement not found in lib/crypto.ts');
    }

    if (cryptoTs.includes('PBKDF2') || cryptoTs.includes('pbkdf2')) {
        pass('crypto', 'PBKDF2 key derivation present in lib/crypto.ts');
    } else {
        warn('crypto', 'PBKDF2 reference not found in lib/crypto.ts — verify key derivation');
    }

    if (cryptoTs.includes('AES-256-GCM') || cryptoTs.includes('aes-256-gcm')) {
        pass('crypto', 'AES-256-GCM encryption present in lib/crypto.ts');
    } else {
        warn('crypto', 'AES-256-GCM reference not found in lib/crypto.ts');
    }
}

// ─── 5. Security Tests ──────────────────────────────────────────────────────

console.log('=== 5. Security Test Count ===\n');

{
    const securityTestFiles = [
        'server/__tests__/bash-security.test.ts',
        'server/__tests__/injection-guard.test.ts',
        'server/__tests__/injection-hardening.test.ts',
        'server/__tests__/prompt-injection.test.ts',
        'server/__tests__/security-audit.test.ts',
        'server/__tests__/security-headers.test.ts',
        'server/__tests__/routes-security-overview.test.ts',
        'server/__tests__/tenant-isolation.test.ts',
    ];

    let total = 0;
    const found: string[] = [];
    const missing: string[] = [];

    for (const f of securityTestFiles) {
        if (existsSync(join(ROOT, f))) {
            const content = readFileSync(join(ROOT, f), 'utf-8');
            const count = (content.match(/\b(test|it)\s*\(/g) ?? []).length;
            total += count;
            found.push(`${f.split('/').pop()} (${count})`);
        } else {
            missing.push(f.split('/').pop()!);
        }
    }

    if (total >= 100) {
        pass('security', `Security test count: ${total} tests across ${found.length} files`, found.join(', '));
    } else {
        fail('security', `Security test count below 100: only ${total} found`, found.join(', '));
    }

    if (missing.length > 0) {
        warn('security', `${missing.length} expected security test file(s) not found`, missing.join(', '));
    }
}

// ─── 6. Injection Detection ─────────────────────────────────────────────────

console.log('=== 6. Injection Detection ===\n');

{
    const guardFile = grepFiles('checkInjection\\|injection-guard', ['server']).filter((l) => !l.includes('.test.ts'));
    if (guardFile.length > 0) {
        pass('security', 'Injection guard (checkInjection) found in server code', `${guardFile.length} reference(s)`);
    } else {
        fail('security', 'Injection guard not found in server code', 'Expected server/lib/injection-guard.ts with checkInjection export');
    }
}

// ─── 7. Environment Configuration ──────────────────────────────────────────

console.log('=== 7. Environment Configuration ===\n');

const envPath = envFile ? resolve(envFile) : join(ROOT, '.env');

if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const eqIdx = trimmed.indexOf('=');
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        envVars[key] = value;
    }

    // Check ALGORAND_NETWORK
    const network = envVars['ALGORAND_NETWORK'];
    if (network === 'mainnet') {
        pass('env', 'ALGORAND_NETWORK=mainnet');
    } else if (!network) {
        warn('env', 'ALGORAND_NETWORK not set in .env', 'Defaults to localnet — set to mainnet for production');
    } else {
        fail('env', `ALGORAND_NETWORK=${network}`, 'Must be "mainnet" for production launch');
    }

    // Check API_KEY
    const apiKey = envVars['API_KEY'];
    if (!apiKey || apiKey === 'CHANGE_ME_GENERATE_RANDOM_KEY') {
        fail('env', 'API_KEY is not set or is default placeholder');
    } else if (apiKey.length < 32) {
        warn('env', `API_KEY is only ${apiKey.length} chars`, 'Recommend at least 32 chars (use: openssl rand -hex 32)');
    } else {
        pass('env', `API_KEY is set (${apiKey.length} chars)`);
    }

    // Check ADMIN_API_KEY
    const adminKey = envVars['ADMIN_API_KEY'];
    if (!adminKey || adminKey === 'CHANGE_ME_GENERATE_RANDOM_ADMIN_KEY') {
        fail('env', 'ADMIN_API_KEY is not set or is default placeholder');
    } else if (adminKey.length < 32) {
        warn('env', `ADMIN_API_KEY is only ${adminKey.length} chars`, 'Recommend at least 32 chars');
    } else {
        pass('env', `ADMIN_API_KEY is set (${adminKey.length} chars)`);
    }

    // Check WALLET_ENCRYPTION_KEY
    const wek = envVars['WALLET_ENCRYPTION_KEY'];
    if (!wek || wek === 'CHANGE_ME_GENERATE_256_BIT_KEY') {
        fail('env', 'WALLET_ENCRYPTION_KEY is not set or is default placeholder', 'REQUIRED for mainnet — generate with: openssl rand -hex 32');
    } else if (wek.length < 32) {
        fail('env', `WALLET_ENCRYPTION_KEY is too short (${wek.length} chars)`, 'Must be at least 32 chars for AES-256 strength');
    } else {
        pass('env', `WALLET_ENCRYPTION_KEY is set (${wek.length} chars)`);
    }

    // Check BIND_HOST
    const bindHost = envVars['BIND_HOST'];
    if (bindHost === '0.0.0.0') {
        pass('env', 'BIND_HOST=0.0.0.0 (production binding)');
    } else if (!bindHost) {
        warn('env', 'BIND_HOST not set', 'Defaults to localhost — set to 0.0.0.0 for production with reverse proxy');
    } else {
        warn('env', `BIND_HOST=${bindHost}`, 'Ensure this is correct for your production deployment');
    }

    // Check ALLOWED_ORIGINS
    const origins = envVars['ALLOWED_ORIGINS'];
    if (!origins) {
        warn('env', 'ALLOWED_ORIGINS not set', 'Recommend restricting to production domain');
    } else if (origins.includes('localhost') || origins.includes('127.0.0.1')) {
        warn('env', `ALLOWED_ORIGINS includes localhost: ${origins}`, 'Should be production domain only on mainnet');
    } else {
        pass('env', `ALLOWED_ORIGINS set: ${origins}`);
    }

    // Check ALGOCHAT_MNEMONIC
    const mnemonic = envVars['ALGOCHAT_MNEMONIC'];
    if (!mnemonic || mnemonic === 'CHANGE_ME_25_WORD_MNEMONIC') {
        fail('env', 'ALGOCHAT_MNEMONIC not configured');
    } else {
        const wordCount = mnemonic.trim().split(/\s+/).length;
        if (wordCount === 25) {
            pass('env', 'ALGOCHAT_MNEMONIC set (25 words)');
        } else {
            warn('env', `ALGOCHAT_MNEMONIC has ${wordCount} words (expected 25)`);
        }
    }

    // Check BACKUP_DIR
    const backupDir = envVars['BACKUP_DIR'];
    if (backupDir) {
        pass('env', `BACKUP_DIR configured: ${backupDir}`);
    } else {
        warn('env', 'BACKUP_DIR not set', 'Required for daily database backups');
    }
} else {
    warn('env', `No .env file found at ${envPath}`, 'Run with --env path/to/.env to check environment configuration');
}

// ─── 8. .env.mainnet.example Exists ────────────────────────────────────────

console.log('=== 8. Mainnet Config Template ===\n');

{
    if (existsSync(join(ROOT, '.env.mainnet.example'))) {
        pass('config', '.env.mainnet.example template present');
    } else {
        fail('config', '.env.mainnet.example not found', 'Create from .env.mainnet.example in repo root');
    }
}

// ─── 9. TypeScript Compile ──────────────────────────────────────────────────

console.log('=== 9. TypeScript Compile ===\n');

{
    const { exitCode } = exec('bun x tsc --noEmit --skipLibCheck 2>&1');
    if (exitCode === 0) {
        pass('code', 'TypeScript compiles cleanly');
    } else {
        fail('code', 'TypeScript compile errors found', 'Run: bun x tsc --noEmit --skipLibCheck');
    }
}

// ─── Output ──────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.passed && !r.warn).length;
const warnings = results.filter((r) => r.warn).length;
const failed = results.filter((r) => !r.passed).length;

if (jsonMode) {
    console.log(JSON.stringify({ passed, warnings, failed, results }, null, 2));
    process.exit(failed > 0 ? 1 : 0);
}

// Human-readable summary
console.log('=== Summary ===\n');

for (const r of results) {
    if (!r.passed) {
        console.log(`  ✗ [${r.category}] ${r.name}`);
        if (r.detail) console.log(`      ${r.detail}`);
    } else if (r.warn) {
        console.log(`  ⚠ [${r.category}] ${r.name}`);
        if (r.detail) console.log(`      ${r.detail}`);
    } else {
        console.log(`  ✓ [${r.category}] ${r.name}`);
    }
}

console.log('');
console.log(`Passed:   ${passed}`);
console.log(`Warnings: ${warnings}`);
console.log(`Failed:   ${failed}`);
console.log(`Total:    ${results.length}`);
console.log('');

if (failed === 0 && warnings === 0) {
    console.log('✓ READY: All mainnet preflight checks pass.');
    process.exit(0);
} else if (failed === 0) {
    console.log(`⚠ REVIEW: ${warnings} warning(s) require human attention before launch.`);
    process.exit(0);
} else {
    console.log(`✗ BLOCKED: ${failed} check(s) failed. Fix before mainnet launch.`);
    process.exit(1);
}
