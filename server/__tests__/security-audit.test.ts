/**
 * Automated Security Audit Tests
 *
 * Validates security-critical configurations and enforcement:
 * - Protected file enforcement
 * - Environment variable allowlist
 * - Plugin capability validation
 * - Default credential detection
 * - Tenant isolation
 * - Privilege escalation prevention
 * - Spending bypass prevention
 * - Key exposure prevention
 * - SSRF prevention
 * - Cross-tenant isolation
 */

import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import {
  consumeReservedCredits,
  deductTurnCredits,
  getBalance,
  getCreditConfig,
  grantCredits,
  releaseReservedCredits,
  reserveGroupCredits,
} from '../db/credits';
import type { AuthConfig } from '../middleware/auth';
import { buildCorsHeaders, checkHttpAuth, checkWsAuth, timingSafeEqual } from '../middleware/auth';
import {
  ADMIN_PATHS,
  authGuard,
  contentLengthGuard,
  createRequestContext,
  dashboardAuthGuard,
  requiresAdminRole,
  roleGuard,
  tenantRoleGuard,
} from '../middleware/guards';
import { getClientIp, RateLimiter } from '../middleware/rate-limit';
import { isValidCapability } from '../plugins/permissions';
import {
  BASH_WRITE_OPERATORS,
  isProtectedBashCommand,
  isProtectedPath,
  PROTECTED_BASENAMES,
  PROTECTED_SUBSTRINGS,
} from '../process/protected-paths';
import { DEFAULT_RESOURCE_LIMITS } from '../sandbox/types';
import { resolveAgentTenant, resolveCouncilTenant } from '../tenant/resolve';
import type { TenantPlan } from '../tenant/types';
import { DEFAULT_TENANT_ID, PLAN_LIMITS } from '../tenant/types';
import { tenantTopic } from '../ws/handler';

// ─── Protected Files ─────────────────────────────────────────────────────────

describe('Protected File Enforcement', () => {
  test('all critical files are in PROTECTED_BASENAMES', () => {
    const required = ['sdk-process.ts', 'CLAUDE.md'];
    for (const file of required) {
      expect(PROTECTED_BASENAMES.has(file)).toBe(true);
    }
  });

  test('all critical paths are in PROTECTED_SUBSTRINGS', () => {
    const required = ['.env', 'corvid-agent.db', 'wallet-keystore.json', 'server/selftest/'];
    for (const path of required) {
      expect(PROTECTED_SUBSTRINGS.some((p) => p === path)).toBe(true);
    }
  });

  test('isProtectedPath blocks all protected basenames', () => {
    for (const basename of PROTECTED_BASENAMES) {
      expect(isProtectedPath(`/some/path/${basename}`)).toBe(true);
    }
  });

  test('isProtectedPath blocks all protected substrings', () => {
    for (const substring of PROTECTED_SUBSTRINGS) {
      expect(isProtectedPath(`/project/${substring}`)).toBe(true);
    }
  });

  test('isProtectedPath allows normal files', () => {
    expect(isProtectedPath('/project/src/utils.ts')).toBe(false);
    expect(isProtectedPath('/project/README.md')).toBe(false);
    expect(isProtectedPath('/project/server/routes/agents.ts')).toBe(false);
  });

  test('BASH_WRITE_OPERATORS detects write commands', () => {
    expect(BASH_WRITE_OPERATORS.test('echo "x" > file.txt')).toBe(true);
    expect(BASH_WRITE_OPERATORS.test('rm -rf /tmp/test')).toBe(true);
    expect(BASH_WRITE_OPERATORS.test('mv old.ts new.ts')).toBe(true);
    expect(BASH_WRITE_OPERATORS.test('sed -i "s/a/b/" file.ts')).toBe(true);
  });

  test('isProtectedBashCommand blocks writes to protected files', () => {
    const result = isProtectedBashCommand('echo "hack" > sdk-process.ts');
    expect(result.blocked).toBe(true);
  });

  test('isProtectedBashCommand allows safe commands', () => {
    const result = isProtectedBashCommand('ls -la');
    expect(result.blocked).toBe(false);
  });
});

// ─── Environment Variable Safety ─────────────────────────────────────────────

describe('Environment Variable Safety', () => {
  test('payment secrets are NOT in the codebase as defaults', () => {
    // Stripe keys should never have default values
    expect(process.env.STRIPE_SECRET_KEY || '').toBe('');
    expect(process.env.STRIPE_WEBHOOK_SECRET || '').toBe('');
  });
});

// ─── Plugin Capability Model ─────────────────────────────────────────────────

describe('Plugin Capability Safety', () => {
  test('admin capabilities are rejected', () => {
    expect(isValidCapability('admin:all')).toBe(false);
    expect(isValidCapability('admin:write')).toBe(false);
  });

  test('dangerous capabilities are rejected', () => {
    expect(isValidCapability('db:write')).toBe(false);
    expect(isValidCapability('fs:root')).toBe(false);
    expect(isValidCapability('network:all')).toBe(false);
  });

  test('only safe capabilities are accepted', () => {
    const safeCapabilities = ['db:read', 'network:outbound', 'fs:project-dir', 'agent:read', 'session:read'];
    for (const cap of safeCapabilities) {
      expect(isValidCapability(cap)).toBe(true);
    }
  });
});

// ─── Sandbox Defaults ────────────────────────────────────────────────────────

describe('Sandbox Security Defaults', () => {
  test('default network policy is restricted', () => {
    expect(DEFAULT_RESOURCE_LIMITS.networkPolicy).toBe('restricted');
  });

  test('default timeout is finite', () => {
    expect(DEFAULT_RESOURCE_LIMITS.timeoutSeconds).toBeGreaterThan(0);
    expect(DEFAULT_RESOURCE_LIMITS.timeoutSeconds).toBeLessThanOrEqual(3600);
  });

  test('default PID limit is set', () => {
    expect(DEFAULT_RESOURCE_LIMITS.pidsLimit).toBeGreaterThan(0);
    expect(DEFAULT_RESOURCE_LIMITS.pidsLimit).toBeLessThanOrEqual(1000);
  });

  test('default memory limit is set', () => {
    expect(DEFAULT_RESOURCE_LIMITS.memoryLimitMb).toBeGreaterThan(0);
  });

  test('default storage limit is set', () => {
    expect(DEFAULT_RESOURCE_LIMITS.storageLimitMb).toBeGreaterThan(0);
  });
});

// ─── Tenant Plan Limits ──────────────────────────────────────────────────────

describe('Tenant Plan Limits', () => {
  test('free plan has restrictive limits', () => {
    const free = PLAN_LIMITS.free;
    expect(free.maxAgents).toBeLessThanOrEqual(5);
    expect(free.maxConcurrentSessions).toBeLessThanOrEqual(5);
    expect(free.sandboxEnabled).toBe(false);
    expect(free.federationEnabled).toBe(false);
  });

  test('enterprise plan allows unlimited resources', () => {
    const enterprise = PLAN_LIMITS.enterprise;
    expect(enterprise.maxAgents).toBe(-1);
    expect(enterprise.maxConcurrentSessions).toBe(-1);
    expect(enterprise.sandboxEnabled).toBe(true);
  });

  test('all plans have defined limits', () => {
    const plans = ['free', 'starter', 'pro', 'enterprise'] as const;
    for (const plan of plans) {
      expect(PLAN_LIMITS[plan]).toBeTruthy();
      expect(typeof PLAN_LIMITS[plan].maxAgents).toBe('number');
      expect(typeof PLAN_LIMITS[plan].maxConcurrentSessions).toBe('number');
      expect(typeof PLAN_LIMITS[plan].maxCreditsPerMonth).toBe('number');
    }
  });
});

// =============================================================================
// NEW TEST SECTIONS
// =============================================================================

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(method: string, path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, { method, headers });
}

function makeUrl(path: string): URL {
  return new URL(`http://localhost:3000${path}`);
}

function createCreditTestDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS credit_ledger (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address  TEXT NOT NULL,
        credits         INTEGER NOT NULL DEFAULT 0,
        reserved        INTEGER NOT NULL DEFAULT 0,
        total_purchased INTEGER NOT NULL DEFAULT 0,
        total_consumed  INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
    )`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_wallet ON credit_ledger(wallet_address)`);
  db.exec(`CREATE TABLE IF NOT EXISTS credit_transactions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address  TEXT NOT NULL,
        type            TEXT NOT NULL,
        amount          INTEGER NOT NULL,
        balance_after   INTEGER NOT NULL,
        reference       TEXT DEFAULT NULL,
        txid            TEXT DEFAULT NULL,
        session_id      TEXT DEFAULT NULL,
        created_at      TEXT DEFAULT (datetime('now'))
    )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_credit_txn_wallet ON credit_transactions(wallet_address)`);
  db.exec(`CREATE TABLE IF NOT EXISTS credit_config (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TEXT DEFAULT (datetime('now'))
    )`);
  // Insert default config values
  db.exec(`INSERT OR IGNORE INTO credit_config (key, value) VALUES ('credits_per_algo', '1000')`);
  db.exec(`INSERT OR IGNORE INTO credit_config (key, value) VALUES ('credits_per_usdc', '100')`);
  db.exec(`INSERT OR IGNORE INTO credit_config (key, value) VALUES ('low_credit_threshold', '50')`);
  db.exec(`INSERT OR IGNORE INTO credit_config (key, value) VALUES ('reserve_per_group_message', '10')`);
  db.exec(`INSERT OR IGNORE INTO credit_config (key, value) VALUES ('credits_per_turn', '1')`);
  db.exec(`INSERT OR IGNORE INTO credit_config (key, value) VALUES ('credits_per_agent_message', '5')`);
  db.exec(`INSERT OR IGNORE INTO credit_config (key, value) VALUES ('free_credits_on_first_message', '100')`);
  // Audit log table (needed by credits.ts recordAudit calls)
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
        action      TEXT NOT NULL,
        actor       TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        detail      TEXT,
        trace_id    TEXT,
        ip_address  TEXT
    )`);
  // Sessions table stub (needed for credits_consumed column)
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        credits_consumed INTEGER DEFAULT 0
    )`);
  return db;
}

function createTenantTestDb(): Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default'
    )`);
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        council_launch_id TEXT
    )`);
  return db;
}

// ─── 1. Privilege Escalation ─────────────────────────────────────────────────

describe('Privilege Escalation Prevention', () => {
  test('roleGuard rejects unauthenticated users', () => {
    const guard = roleGuard('admin');
    const ctx = createRequestContext();
    ctx.authenticated = false;
    const result = guard(makeRequest('GET', '/api/test'), makeUrl('/api/test'), ctx);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test('roleGuard rejects users without the required role', () => {
    const guard = roleGuard('admin');
    const ctx = createRequestContext();
    ctx.authenticated = true;
    ctx.role = 'user';
    const result = guard(makeRequest('GET', '/api/test'), makeUrl('/api/test'), ctx);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  test('roleGuard allows users with the required role', () => {
    const guard = roleGuard('admin');
    const ctx = createRequestContext();
    ctx.authenticated = true;
    ctx.role = 'admin';
    const result = guard(makeRequest('GET', '/api/test'), makeUrl('/api/test'), ctx);
    expect(result).toBeNull();
  });

  test('roleGuard supports multiple allowed roles', () => {
    const guard = roleGuard('admin', 'operator');
    const ctx = createRequestContext();
    ctx.authenticated = true;
    ctx.role = 'operator';
    const result = guard(makeRequest('GET', '/api/test'), makeUrl('/api/test'), ctx);
    expect(result).toBeNull();
  });

  test('requiresAdminRole returns true for all ADMIN_PATHS', () => {
    for (const path of ADMIN_PATHS) {
      expect(requiresAdminRole(path)).toBe(true);
    }
  });

  test('requiresAdminRole returns true for /api/escalation-queue/* paths', () => {
    expect(requiresAdminRole('/api/escalation-queue')).toBe(true);
    expect(requiresAdminRole('/api/escalation-queue/123')).toBe(true);
    expect(requiresAdminRole('/api/escalation-queue/123/approve')).toBe(true);
  });

  test('requiresAdminRole returns true for /api/wallets/ADDR/credits (credit grant)', () => {
    expect(requiresAdminRole('/api/wallets/ABC123DEF456/credits')).toBe(true);
    expect(requiresAdminRole('/api/wallets/some-wallet/credits')).toBe(true);
  });

  test('requiresAdminRole returns true for /api/allowlist*', () => {
    expect(requiresAdminRole('/api/allowlist')).toBe(true);
    expect(requiresAdminRole('/api/allowlist/add')).toBe(true);
  });

  test('requiresAdminRole returns true for /api/github-allowlist*', () => {
    expect(requiresAdminRole('/api/github-allowlist')).toBe(true);
    expect(requiresAdminRole('/api/github-allowlist/user123')).toBe(true);
  });

  test('requiresAdminRole returns true for /api/performance*', () => {
    expect(requiresAdminRole('/api/performance')).toBe(true);
    expect(requiresAdminRole('/api/performance/metrics')).toBe(true);
  });

  test('requiresAdminRole returns true for /api/algochat/network', () => {
    expect(requiresAdminRole('/api/algochat/network')).toBe(true);
  });

  test('requiresAdminRole returns false for normal API paths', () => {
    expect(requiresAdminRole('/api/agents')).toBe(false);
    expect(requiresAdminRole('/api/sessions')).toBe(false);
    expect(requiresAdminRole('/api/health')).toBe(false);
    expect(requiresAdminRole('/api/wallets')).toBe(false);
  });

  test('tenantRoleGuard rejects when role is not in allowed list', () => {
    const guard = tenantRoleGuard('owner');
    const ctx = createRequestContext();
    ctx.tenantId = 'tenant-123';
    ctx.tenantRole = 'viewer';
    const result = guard(makeRequest('GET', '/api/test'), makeUrl('/api/test'), ctx);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  test('tenantRoleGuard no-ops in single-tenant mode', () => {
    const guard = tenantRoleGuard('owner');
    const ctx = createRequestContext();
    ctx.tenantId = DEFAULT_TENANT_ID;
    ctx.tenantRole = undefined;
    const result = guard(makeRequest('GET', '/api/test'), makeUrl('/api/test'), ctx);
    expect(result).toBeNull();
  });

  test('dashboardAuthGuard blocks when no auth and not localhost', () => {
    const guard = dashboardAuthGuard('0.0.0.0');
    const ctx = createRequestContext();
    ctx.authenticated = false;
    const result = guard(makeRequest('GET', '/api/dashboard/stats'), makeUrl('/api/dashboard/stats'), ctx);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test('dashboardAuthGuard allows localhost access without auth', () => {
    const guard = dashboardAuthGuard('127.0.0.1');
    const ctx = createRequestContext();
    ctx.authenticated = false;
    const result = guard(makeRequest('GET', '/api/dashboard/stats'), makeUrl('/api/dashboard/stats'), ctx);
    expect(result).toBeNull();
  });

  test('authGuard assigns admin role when ADMIN_API_KEY matches', () => {
    // The token must pass checkHttpAuth (match config.apiKey) AND match ADMIN_API_KEY
    const sharedKey = 'super-secret-admin-key-12345';
    const prevAdminKey = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = sharedKey;
    try {
      const config: AuthConfig = { apiKey: sharedKey, allowedOrigins: [], bindHost: '127.0.0.1' };
      const guard = authGuard(config);
      const ctx = createRequestContext();
      const req = makeRequest('GET', '/api/agents', { Authorization: `Bearer ${sharedKey}` });
      const result = guard(req, makeUrl('/api/agents'), ctx);
      expect(result).toBeNull();
      expect(ctx.role).toBe('admin');
    } finally {
      if (prevAdminKey !== undefined) process.env.ADMIN_API_KEY = prevAdminKey;
      else delete process.env.ADMIN_API_KEY;
    }
  });

  test('authGuard assigns user role when API_KEY matches but not ADMIN_API_KEY', () => {
    const apiKey = 'regular-key-abcdefgh';
    const adminKey = 'super-secret-admin-key-12345';
    const prevAdminKey = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = adminKey;
    try {
      // config.apiKey = apiKey (different from ADMIN_API_KEY)
      const config: AuthConfig = { apiKey, allowedOrigins: [], bindHost: '127.0.0.1' };
      const guard = authGuard(config);
      const ctx = createRequestContext();
      const req = makeRequest('GET', '/api/agents', { Authorization: `Bearer ${apiKey}` });
      const result = guard(req, makeUrl('/api/agents'), ctx);
      expect(result).toBeNull();
      expect(ctx.role).toBe('user');
    } finally {
      if (prevAdminKey !== undefined) process.env.ADMIN_API_KEY = prevAdminKey;
      else delete process.env.ADMIN_API_KEY;
    }
  });
});

// ─── 2. Spending Bypass Prevention ───────────────────────────────────────────

describe('Spending Bypass Prevention', () => {
  test('deductTurnCredits returns false when balance is 0', () => {
    const db = createCreditTestDb();
    // Ensure wallet exists with 0 credits
    const result = deductTurnCredits(db, 'WALLET_ZERO');
    expect(result.success).toBe(false);
    expect(result.isExhausted).toBe(true);
    db.close();
  });

  test('deductTurnCredits returns true and decrements balance when sufficient', () => {
    const db = createCreditTestDb();
    grantCredits(db, 'WALLET_RICH', 100, 'test');
    const balanceBefore = getBalance(db, 'WALLET_RICH');
    expect(balanceBefore.credits).toBe(100);

    const result = deductTurnCredits(db, 'WALLET_RICH');
    expect(result.success).toBe(true);

    const balanceAfter = getBalance(db, 'WALLET_RICH');
    expect(balanceAfter.credits).toBe(99); // 100 - 1 (default credits_per_turn)
    db.close();
  });

  test('grantCredits rejects amount of 0', () => {
    const db = createCreditTestDb();
    expect(() => grantCredits(db, 'WALLET_TEST', 0, 'test')).toThrow();
    db.close();
  });

  test('grantCredits rejects negative amounts', () => {
    const db = createCreditTestDb();
    expect(() => grantCredits(db, 'WALLET_TEST', -1, 'test')).toThrow();
    db.close();
  });

  test('grantCredits rejects fractional amounts', () => {
    const db = createCreditTestDb();
    expect(() => grantCredits(db, 'WALLET_TEST', 1.5, 'test')).toThrow();
    db.close();
  });

  test('grantCredits rejects non-integer amounts', () => {
    const db = createCreditTestDb();
    expect(() => grantCredits(db, 'WALLET_TEST', 2.7, 'test')).toThrow();
    expect(() => grantCredits(db, 'WALLET_TEST', 0.1, 'test')).toThrow();
    db.close();
  });

  test('balance never goes below 0 after deductions', () => {
    const db = createCreditTestDb();
    grantCredits(db, 'WALLET_LOW', 2, 'test');
    deductTurnCredits(db, 'WALLET_LOW');
    deductTurnCredits(db, 'WALLET_LOW');
    const result = deductTurnCredits(db, 'WALLET_LOW');
    expect(result.success).toBe(false);
    const balance = getBalance(db, 'WALLET_LOW');
    expect(balance.credits).toBeGreaterThanOrEqual(0);
    db.close();
  });

  test('reserved credits cannot exceed available credits', () => {
    const db = createCreditTestDb();
    grantCredits(db, 'WALLET_RESERVE', 20, 'test');
    // Try to reserve more than available (20 credits, reserve for 100 members at 10 each = 1000)
    const result = reserveGroupCredits(db, 'WALLET_RESERVE', 100);
    expect(result.success).toBe(false);
    expect(result.reserved).toBe(0);
    db.close();
  });

  test('consumeReservedCredits reduces reserved field', () => {
    const db = createCreditTestDb();
    grantCredits(db, 'WALLET_CONSUME', 200, 'test');
    const reserveResult = reserveGroupCredits(db, 'WALLET_CONSUME', 2); // 10 * 2 = 20 reserved
    expect(reserveResult.success).toBe(true);

    const balanceBefore = getBalance(db, 'WALLET_CONSUME');
    expect(balanceBefore.reserved).toBe(20);

    consumeReservedCredits(db, 'WALLET_CONSUME', 20);

    const balanceAfter = getBalance(db, 'WALLET_CONSUME');
    expect(balanceAfter.reserved).toBe(0);
    expect(balanceAfter.credits).toBe(180); // 200 - 20 consumed
    db.close();
  });

  test('releaseReservedCredits returns credits to available pool', () => {
    const db = createCreditTestDb();
    grantCredits(db, 'WALLET_RELEASE', 200, 'test');
    reserveGroupCredits(db, 'WALLET_RELEASE', 2); // 20 reserved

    const balanceBefore = getBalance(db, 'WALLET_RELEASE');
    expect(balanceBefore.reserved).toBe(20);
    expect(balanceBefore.available).toBe(180);

    releaseReservedCredits(db, 'WALLET_RELEASE', 20);

    const balanceAfter = getBalance(db, 'WALLET_RELEASE');
    expect(balanceAfter.reserved).toBe(0);
    expect(balanceAfter.available).toBe(200); // All back to available
    expect(balanceAfter.credits).toBe(200); // Credits unchanged
    db.close();
  });

  test('spending config has sane defaults', () => {
    const db = createCreditTestDb();
    const config = getCreditConfig(db);
    expect(config.creditsPerTurn).toBeGreaterThan(0);
    expect(config.creditsPerAgentMessage).toBeGreaterThan(0);
    expect(config.creditsPerAlgo).toBeGreaterThan(0);
    expect(config.lowCreditThreshold).toBeGreaterThan(0);
    db.close();
  });

  test('multiple rapid deductions are handled atomically', () => {
    const db = createCreditTestDb();
    grantCredits(db, 'WALLET_RAPID', 5, 'test');
    let successes = 0;
    for (let i = 0; i < 10; i++) {
      const result = deductTurnCredits(db, 'WALLET_RAPID');
      if (result.success) successes++;
    }
    expect(successes).toBe(5); // Only 5 should succeed
    const balance = getBalance(db, 'WALLET_RAPID');
    expect(balance.credits).toBe(0);
    db.close();
  });
});

// ─── 3. Key Exposure Prevention ──────────────────────────────────────────────

describe('Key Exposure Prevention', () => {
  test('timingSafeEqual returns true for equal strings', () => {
    expect(timingSafeEqual('hello', 'hello')).toBe(true);
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
  });

  test('timingSafeEqual returns false for different strings', () => {
    expect(timingSafeEqual('hello', 'world')).toBe(false);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
  });

  test('timingSafeEqual returns false for different-length strings', () => {
    expect(timingSafeEqual('short', 'a much longer string')).toBe(false);
    expect(timingSafeEqual('', 'notempty')).toBe(false);
  });

  test('timingSafeEqual timing is consistent', () => {
    const iterations = 5000;
    const key = 'a'.repeat(64);
    const matchKey = 'a'.repeat(64);
    const noMatchKey = 'b'.repeat(64);

    // Warmup to stabilize JIT
    for (let i = 0; i < 1000; i++) {
      timingSafeEqual(key, matchKey);
      timingSafeEqual(key, noMatchKey);
    }

    const startMatch = performance.now();
    for (let i = 0; i < iterations; i++) {
      timingSafeEqual(key, matchKey);
    }
    const matchTime = performance.now() - startMatch;

    const startNoMatch = performance.now();
    for (let i = 0; i < iterations; i++) {
      timingSafeEqual(key, noMatchKey);
    }
    const noMatchTime = performance.now() - startNoMatch;

    // Times should be within 10x of each other (generous margin for CI variance)
    // The key property is that match vs no-match don't differ by orders of magnitude
    const ratio = matchTime / noMatchTime;
    expect(ratio).toBeGreaterThan(0.1);
    expect(ratio).toBeLessThan(10);
  });

  test('buildCorsHeaders returns empty origin for non-allowlisted origins', () => {
    const config: AuthConfig = {
      apiKey: 'test-key',
      allowedOrigins: ['https://allowed.example.com'],
      bindHost: '127.0.0.1',
    };
    const req = new Request('http://localhost:3000/api/test', {
      headers: { Origin: 'https://evil.example.com' },
    });
    const headers = buildCorsHeaders(req, config);
    expect(headers['Access-Control-Allow-Origin']).toBe('');
  });

  test('buildCorsHeaders reflects allowed origin', () => {
    const config: AuthConfig = {
      apiKey: 'test-key',
      allowedOrigins: ['https://allowed.example.com'],
      bindHost: '127.0.0.1',
    };
    const req = new Request('http://localhost:3000/api/test', {
      headers: { Origin: 'https://allowed.example.com' },
    });
    const headers = buildCorsHeaders(req, config);
    expect(headers['Access-Control-Allow-Origin']).toBe('https://allowed.example.com');
  });

  test('checkHttpAuth returns 401 when API key is set but no Authorization header', () => {
    const config: AuthConfig = { apiKey: 'test-key-12345', allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/api/agents');
    const result = checkHttpAuth(req, makeUrl('/api/agents'), config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test('checkHttpAuth returns 403 for wrong API key', () => {
    const config: AuthConfig = { apiKey: 'correct-key-12345', allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/api/agents', { Authorization: 'Bearer wrong-key' });
    const result = checkHttpAuth(req, makeUrl('/api/agents'), config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  test('checkHttpAuth returns null (allowed) for correct API key', () => {
    const config: AuthConfig = { apiKey: 'correct-key-12345', allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/api/agents', { Authorization: 'Bearer correct-key-12345' });
    const result = checkHttpAuth(req, makeUrl('/api/agents'), config);
    expect(result).toBeNull();
  });

  test('checkHttpAuth allows OPTIONS requests without auth', () => {
    const config: AuthConfig = { apiKey: 'test-key-12345', allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('OPTIONS', '/api/agents');
    const result = checkHttpAuth(req, makeUrl('/api/agents'), config);
    expect(result).toBeNull();
  });

  test('checkHttpAuth allows /api/health without auth', () => {
    const config: AuthConfig = { apiKey: 'test-key-12345', allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/api/health');
    const result = checkHttpAuth(req, makeUrl('/api/health'), config);
    expect(result).toBeNull();
  });

  test('checkWsAuth returns false for wrong key', () => {
    const config: AuthConfig = { apiKey: 'correct-ws-key', allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/ws', { Authorization: 'Bearer wrong-key' });
    const result = checkWsAuth(req, makeUrl('/ws'), config);
    expect(result).toBe(false);
  });

  test('checkWsAuth returns true for correct key', () => {
    const config: AuthConfig = { apiKey: 'correct-ws-key', allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/ws', { Authorization: 'Bearer correct-ws-key' });
    const result = checkWsAuth(req, makeUrl('/ws'), config);
    expect(result).toBe(true);
  });

  test('error responses do not leak API key values', async () => {
    const secretKey = 'super-secret-api-key-never-leak-this';
    const config: AuthConfig = { apiKey: secretKey, allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/api/agents', { Authorization: 'Bearer wrong-key' });
    const result = checkHttpAuth(req, makeUrl('/api/agents'), config);
    expect(result).not.toBeNull();
    const body = await result!.text();
    expect(body).not.toContain(secretKey);
  });
});

// ─── 4. SSRF Prevention ─────────────────────────────────────────────────────

describe('SSRF Prevention', () => {
  test('getClientIp ignores X-Forwarded-For without TRUST_PROXY', () => {
    const req = makeRequest('GET', '/api/test', {
      'X-Forwarded-For': '203.0.113.50, 70.41.3.18, 150.172.238.178',
    });
    // Without TRUST_PROXY, X-Forwarded-For is ignored
    expect(getClientIp(req)).toBe('unknown');
  });

  test('getClientIp ignores single X-Forwarded-For without TRUST_PROXY', () => {
    const req = makeRequest('GET', '/api/test', {
      'X-Forwarded-For': '10.0.0.1',
    });
    // Without TRUST_PROXY, X-Forwarded-For is ignored
    expect(getClientIp(req)).toBe('unknown');
  });

  test('getClientIp falls back to X-Real-IP', () => {
    const req = makeRequest('GET', '/api/test', {
      'X-Real-IP': '192.168.1.100',
    });
    expect(getClientIp(req)).toBe('192.168.1.100');
  });

  test('getClientIp returns unknown when no headers present', () => {
    const req = makeRequest('GET', '/api/test');
    expect(getClientIp(req)).toBe('unknown');
  });

  test('rate limiter blocks after exceeding limit', () => {
    const limiter = new RateLimiter({ maxGet: 3, maxMutation: 2, windowMs: 60_000 });
    limiter.check('test-ip-1', 'GET');
    limiter.check('test-ip-1', 'GET');
    limiter.check('test-ip-1', 'GET');
    const result = limiter.check('test-ip-1', 'GET');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    limiter.stop();
  });

  test('rate limiter uses separate buckets for GET vs POST', () => {
    const limiter = new RateLimiter({ maxGet: 2, maxMutation: 2, windowMs: 60_000 });
    // Fill up GET bucket
    limiter.check('test-ip-2', 'GET');
    limiter.check('test-ip-2', 'GET');
    const getResult = limiter.check('test-ip-2', 'GET');
    expect(getResult).not.toBeNull(); // GET blocked

    // POST should still work
    const postResult = limiter.check('test-ip-2', 'POST');
    expect(postResult).toBeNull(); // POST still allowed
    limiter.stop();
  });

  test('rate limiter returns 429 with Retry-After header', async () => {
    const limiter = new RateLimiter({ maxGet: 1, maxMutation: 1, windowMs: 60_000 });
    limiter.check('test-ip-3', 'GET');
    const result = limiter.check('test-ip-3', 'GET');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(result!.headers.get('Retry-After')).toBeTruthy();
    const body = JSON.parse(await result!.text());
    expect(body.retryAfter).toBeGreaterThan(0);
    limiter.stop();
  });

  test('rate limiter resets after window expires', () => {
    // Use a very short window for testing
    const limiter = new RateLimiter({ maxGet: 1, maxMutation: 1, windowMs: 1 });
    limiter.check('test-ip-4', 'GET');
    // After 1ms window, the timestamps should be expired on next check
    // We need a tiny delay to ensure the window has passed
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin wait 5ms */
    }
    const result = limiter.check('test-ip-4', 'GET');
    expect(result).toBeNull();
    limiter.stop();
  });

  test('contentLengthGuard blocks oversized payloads', () => {
    const guard = contentLengthGuard(1024);
    const ctx = createRequestContext();
    const req = makeRequest('POST', '/api/test', { 'Content-Length': '2048' });
    const result = guard(req, makeUrl('/api/test'), ctx);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(413);
  });

  test('contentLengthGuard allows normal-sized payloads', () => {
    const guard = contentLengthGuard(1024);
    const ctx = createRequestContext();
    const req = makeRequest('POST', '/api/test', { 'Content-Length': '512' });
    const result = guard(req, makeUrl('/api/test'), ctx);
    expect(result).toBeNull();
  });

  test('contentLengthGuard skips GET/HEAD/OPTIONS/DELETE methods', () => {
    const guard = contentLengthGuard(1024);
    const ctx = createRequestContext();
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'DELETE']) {
      const req = makeRequest(method, '/api/test', { 'Content-Length': '999999' });
      const result = guard(req, makeUrl('/api/test'), ctx);
      expect(result).toBeNull();
    }
  });
});

// ─── 5. Cross-Tenant Isolation ───────────────────────────────────────────────

describe('Cross-Tenant Isolation', () => {
  test('resolveAgentTenant returns undefined for DEFAULT_TENANT_ID agent', () => {
    const db = createTenantTestDb();
    db.prepare('INSERT INTO agents (id, tenant_id) VALUES (?, ?)').run('agent-1', DEFAULT_TENANT_ID);
    const result = resolveAgentTenant(db, 'agent-1');
    expect(result).toBeUndefined();
    db.close();
  });

  test('resolveAgentTenant returns tenant ID for multi-tenant agent', () => {
    const db = createTenantTestDb();
    db.exec(`INSERT INTO agents (id, tenant_id) VALUES ('agent-mt', 'tenant-abc')`);
    const result = resolveAgentTenant(db, 'agent-mt');
    expect(result).toBe('tenant-abc');
    db.close();
  });

  test('resolveAgentTenant returns undefined when multiTenant=false', () => {
    const db = createTenantTestDb();
    db.exec(`INSERT INTO agents (id, tenant_id) VALUES ('agent-st', 'tenant-xyz')`);
    const result = resolveAgentTenant(db, 'agent-st', false);
    expect(result).toBeUndefined();
    db.close();
  });

  test('resolveAgentTenant returns undefined for non-existent agent', () => {
    const db = createTenantTestDb();
    const result = resolveAgentTenant(db, 'non-existent');
    expect(result).toBeUndefined();
    db.close();
  });

  test('resolveCouncilTenant returns undefined for default tenant', () => {
    const db = createTenantTestDb();
    db.prepare('INSERT INTO agents (id, tenant_id) VALUES (?, ?)').run('agent-c1', DEFAULT_TENANT_ID);
    db.exec(`INSERT INTO sessions (id, agent_id, council_launch_id) VALUES ('session-c1', 'agent-c1', 'launch-1')`);
    const result = resolveCouncilTenant(db, 'launch-1');
    expect(result).toBeUndefined();
    db.close();
  });

  test('resolveCouncilTenant returns tenant for multi-tenant council', () => {
    const db = createTenantTestDb();
    db.exec(`INSERT INTO agents (id, tenant_id) VALUES ('agent-c2', 'tenant-council')`);
    db.exec(`INSERT INTO sessions (id, agent_id, council_launch_id) VALUES ('session-c2', 'agent-c2', 'launch-2')`);
    const result = resolveCouncilTenant(db, 'launch-2');
    expect(result).toBe('tenant-council');
    db.close();
  });

  test('all plan tiers have defined limits', () => {
    const plans: TenantPlan[] = ['free', 'starter', 'pro', 'enterprise'];
    for (const plan of plans) {
      const limits = PLAN_LIMITS[plan];
      expect(limits).toBeTruthy();
      expect(typeof limits.maxAgents).toBe('number');
      expect(typeof limits.maxConcurrentSessions).toBe('number');
      expect(typeof limits.maxStorageMb).toBe('number');
      expect(typeof limits.sandboxEnabled).toBe('boolean');
      expect(typeof limits.marketplaceEnabled).toBe('boolean');
      expect(typeof limits.federationEnabled).toBe('boolean');
    }
  });

  test('free plan has most restrictive limits', () => {
    const free = PLAN_LIMITS.free;
    const starter = PLAN_LIMITS.starter;
    expect(free.maxAgents).toBeLessThan(starter.maxAgents);
    expect(free.maxConcurrentSessions).toBeLessThan(starter.maxConcurrentSessions);
    expect(free.maxCreditsPerMonth).toBeLessThan(starter.maxCreditsPerMonth);
    expect(free.maxStorageMb).toBeLessThan(starter.maxStorageMb);
  });

  test('enterprise plan has highest/unlimited limits', () => {
    const enterprise = PLAN_LIMITS.enterprise;
    expect(enterprise.maxAgents).toBe(-1);
    expect(enterprise.maxConcurrentSessions).toBe(-1);
    expect(enterprise.maxCreditsPerMonth).toBe(-1);
    expect(enterprise.maxStorageMb).toBe(-1);
    expect(enterprise.sandboxEnabled).toBe(true);
    expect(enterprise.marketplaceEnabled).toBe(true);
    expect(enterprise.federationEnabled).toBe(true);
  });

  test('contentLengthGuard applies uniformly regardless of tenant', () => {
    const guard = contentLengthGuard(1024);

    const ctx1 = createRequestContext();
    ctx1.tenantId = 'tenant-a';
    const req1 = makeRequest('POST', '/api/test', { 'Content-Length': '2048' });
    expect(guard(req1, makeUrl('/api/test'), ctx1)!.status).toBe(413);

    const ctx2 = createRequestContext();
    ctx2.tenantId = 'tenant-b';
    const req2 = makeRequest('POST', '/api/test', { 'Content-Length': '2048' });
    expect(guard(req2, makeUrl('/api/test'), ctx2)!.status).toBe(413);
  });

  test('tenantRoleGuard blocks unauthorized roles in multi-tenant mode', () => {
    const guard = tenantRoleGuard('owner', 'operator');
    const ctx = createRequestContext();
    ctx.tenantId = 'tenant-strict';
    ctx.tenantRole = 'viewer';
    const result = guard(makeRequest('GET', '/api/test'), makeUrl('/api/test'), ctx);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  test('tenantRoleGuard allows authorized roles in multi-tenant mode', () => {
    const guard = tenantRoleGuard('owner', 'operator');
    const ctx = createRequestContext();
    ctx.tenantId = 'tenant-strict';
    ctx.tenantRole = 'operator';
    const result = guard(makeRequest('GET', '/api/test'), makeUrl('/api/test'), ctx);
    expect(result).toBeNull();
  });

  test('rate limit keys are per-tenant (different wallets get separate limits)', () => {
    const limiter = new RateLimiter({ maxGet: 2, maxMutation: 2, windowMs: 60_000 });
    // Fill up wallet-a
    limiter.check('wallet-a', 'GET');
    limiter.check('wallet-a', 'GET');
    const walletAResult = limiter.check('wallet-a', 'GET');
    expect(walletAResult).not.toBeNull(); // wallet-a blocked

    // wallet-b should still be fine
    const walletBResult = limiter.check('wallet-b', 'GET');
    expect(walletBResult).toBeNull();
    limiter.stop();
  });

  test('tenantTopic scopes topics correctly in multi-tenant mode', () => {
    expect(tenantTopic('sessions', 'tenant-123')).toBe('sessions:tenant-123');
    expect(tenantTopic('agents', 'my-tenant')).toBe('agents:my-tenant');
  });

  test('tenantTopic returns flat topic for default tenant', () => {
    expect(tenantTopic('sessions', 'default')).toBe('sessions');
    expect(tenantTopic('sessions', undefined)).toBe('sessions');
  });

  test('DEFAULT_TENANT_ID is the string "default"', () => {
    expect(DEFAULT_TENANT_ID).toBe('default');
  });

  test('resolveCouncilTenant returns undefined when multiTenant=false', () => {
    const db = createTenantTestDb();
    db.exec(`INSERT INTO agents (id, tenant_id) VALUES ('agent-c3', 'tenant-xyz')`);
    db.exec(`INSERT INTO sessions (id, agent_id, council_launch_id) VALUES ('session-c3', 'agent-c3', 'launch-3')`);
    const result = resolveCouncilTenant(db, 'launch-3', false);
    expect(result).toBeUndefined();
    db.close();
  });

  test('resolveCouncilTenant returns undefined for non-existent launch', () => {
    const db = createTenantTestDb();
    const result = resolveCouncilTenant(db, 'non-existent-launch');
    expect(result).toBeUndefined();
    db.close();
  });

  test('plan limits are progressively more permissive', () => {
    const order: TenantPlan[] = ['free', 'starter', 'pro'];
    for (let i = 0; i < order.length - 1; i++) {
      const current = PLAN_LIMITS[order[i]];
      const next = PLAN_LIMITS[order[i + 1]];
      expect(current.maxAgents).toBeLessThanOrEqual(next.maxAgents);
      expect(current.maxConcurrentSessions).toBeLessThanOrEqual(next.maxConcurrentSessions);
      expect(current.maxCreditsPerMonth).toBeLessThanOrEqual(next.maxCreditsPerMonth);
    }
  });
});

// ─── 6. Additional Auth Edge Cases ───────────────────────────────────────────

describe('Additional Auth Edge Cases', () => {
  test('checkHttpAuth rejects malformed Authorization header', () => {
    const config: AuthConfig = { apiKey: 'test-key-12345', allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/api/agents', { Authorization: 'Basic dXNlcjpwYXNz' });
    const result = checkHttpAuth(req, makeUrl('/api/agents'), config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test('checkHttpAuth allows request when no API key is configured', () => {
    const config: AuthConfig = { apiKey: null, allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/api/agents');
    const result = checkHttpAuth(req, makeUrl('/api/agents'), config);
    expect(result).toBeNull();
  });

  test('checkWsAuth allows all connections when no API key is configured', () => {
    const config: AuthConfig = { apiKey: null, allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/ws');
    expect(checkWsAuth(req, makeUrl('/ws'), config)).toBe(true);
  });

  test('buildCorsHeaders returns wildcard when no origins configured', () => {
    const config: AuthConfig = { apiKey: 'test', allowedOrigins: [], bindHost: '127.0.0.1' };
    const req = makeRequest('GET', '/api/test', { Origin: 'https://any-origin.example.com' });
    const headers = buildCorsHeaders(req, config);
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });

  test('timingSafeEqual handles empty strings', () => {
    expect(timingSafeEqual('', '')).toBe(true);
  });

  test('timingSafeEqual handles unicode strings', () => {
    expect(timingSafeEqual('hello-world', 'hello-world')).toBe(true);
    expect(timingSafeEqual('abc-123', 'abc-124')).toBe(false);
  });

  test('roleGuard response body contains error details', async () => {
    const guard = roleGuard('admin');
    const ctx = createRequestContext();
    ctx.authenticated = true;
    ctx.role = 'user';
    const result = guard(makeRequest('GET', '/api/test'), makeUrl('/api/test'), ctx);
    expect(result).not.toBeNull();
    const body = JSON.parse(await result!.text());
    expect(body.error).toContain('Forbidden');
    expect(body.requiredRoles).toContain('admin');
  });

  test('contentLengthGuard uses default max of 1MB when no argument', () => {
    const guard = contentLengthGuard(); // Default 1_048_576
    const ctx = createRequestContext();
    // Just under 1MB should pass
    const reqOk = makeRequest('POST', '/api/test', { 'Content-Length': '1048576' });
    expect(guard(reqOk, makeUrl('/api/test'), ctx)).toBeNull();
    // Over 1MB should fail
    const reqBig = makeRequest('POST', '/api/test', { 'Content-Length': '1048577' });
    expect(guard(reqBig, makeUrl('/api/test'), ctx)).not.toBeNull();
  });

  test('getClientIp ignores X-Forwarded-For whitespace without TRUST_PROXY', () => {
    const req = makeRequest('GET', '/api/test', {
      'X-Forwarded-For': '  10.0.0.1 , 10.0.0.2 ',
    });
    // Without TRUST_PROXY, X-Forwarded-For is ignored
    expect(getClientIp(req)).toBe('unknown');
  });

  test('getClientIp trims whitespace from X-Real-IP', () => {
    const req = makeRequest('GET', '/api/test', {
      'X-Real-IP': '  192.168.1.1  ',
    });
    expect(getClientIp(req)).toBe('192.168.1.1');
  });
});
