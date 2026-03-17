/**
 * Unit tests for governance permission tier enforcement (Issue #1038, Layer 0).
 *
 * Covers:
 *   - PermissionTier enum ordering
 *   - resolveCallerTier — all resolution paths
 *   - requirePermissionTier guard — allow/deny behavior
 *   - Unknown caller defaults to Guest
 *   - DB grant-based tier lookup
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    PermissionTier,
    PERMISSION_TIER_NAMES,
    GOVERNANCE_ROUTE_TIERS,
    resolveCallerTier,
    requirePermissionTier,
} from '../permissions/governance-tier';
import type { RequestContext } from '../middleware/guards';
import { DEFAULT_TENANT_ID } from '../tenant/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal RequestContext for testing. */
function makeContext(overrides: Partial<RequestContext> = {}): RequestContext {
    return {
        authenticated: false,
        tenantId: DEFAULT_TENANT_ID,
        ...overrides,
    };
}

/** Build a minimal Request for guard tests. */
function makeRequest(method = 'GET', path = '/api/councils'): Request {
    return new Request(`http://localhost${path}`, { method });
}

/** Build a URL object for guard tests. */
function makeUrl(path = '/api/councils'): URL {
    return new URL(`http://localhost${path}`);
}

// ─── PermissionTier enum ──────────────────────────────────────────────────────

describe('PermissionTier enum', () => {
    test('tiers are ordered Guest < Agent < Operator < Owner', () => {
        expect(PermissionTier.Guest).toBeLessThan(PermissionTier.Agent);
        expect(PermissionTier.Agent).toBeLessThan(PermissionTier.Operator);
        expect(PermissionTier.Operator).toBeLessThan(PermissionTier.Owner);
    });

    test('PERMISSION_TIER_NAMES covers all tiers', () => {
        expect(PERMISSION_TIER_NAMES[PermissionTier.Guest]).toBe('Guest');
        expect(PERMISSION_TIER_NAMES[PermissionTier.Agent]).toBe('Agent');
        expect(PERMISSION_TIER_NAMES[PermissionTier.Operator]).toBe('Operator');
        expect(PERMISSION_TIER_NAMES[PermissionTier.Owner]).toBe('Owner');
    });
});

// ─── GOVERNANCE_ROUTE_TIERS ───────────────────────────────────────────────────

describe('GOVERNANCE_ROUTE_TIERS annotations', () => {
    test('read endpoints require at least Agent tier', () => {
        const reads = Object.entries(GOVERNANCE_ROUTE_TIERS).filter(([k]) => k.startsWith('GET'));
        expect(reads.length).toBeGreaterThan(0);
        for (const [, tier] of reads) {
            expect(tier).toBeGreaterThanOrEqual(PermissionTier.Agent);
        }
    });

    test('vote/approve requires Owner tier', () => {
        expect(GOVERNANCE_ROUTE_TIERS['POST /api/council-launches/:id/vote/approve']).toBe(PermissionTier.Owner);
    });

    test('write operations require at least Operator tier', () => {
        const writes = Object.entries(GOVERNANCE_ROUTE_TIERS).filter(([k]) => !k.startsWith('GET'));
        expect(writes.length).toBeGreaterThan(0);
        for (const [, tier] of writes) {
            expect(tier).toBeGreaterThanOrEqual(PermissionTier.Operator);
        }
    });
});

// ─── resolveCallerTier ────────────────────────────────────────────────────────

describe('resolveCallerTier', () => {
    test('unauthenticated caller defaults to Guest', () => {
        const ctx = makeContext({ authenticated: false });
        expect(resolveCallerTier(ctx)).toBe(PermissionTier.Guest);
    });

    test('unknown caller with no signals defaults to Guest', () => {
        const ctx = makeContext();
        expect(resolveCallerTier(ctx)).toBe(PermissionTier.Guest);
    });

    test('authenticated caller with no role resolves to Agent', () => {
        const ctx = makeContext({ authenticated: true });
        expect(resolveCallerTier(ctx)).toBe(PermissionTier.Agent);
    });

    test('admin API key resolves to Owner', () => {
        const ctx = makeContext({ authenticated: true, role: 'admin' });
        expect(resolveCallerTier(ctx)).toBe(PermissionTier.Owner);
    });

    test('tenantRole=owner resolves to Owner', () => {
        const ctx = makeContext({ authenticated: true, tenantRole: 'owner' });
        expect(resolveCallerTier(ctx)).toBe(PermissionTier.Owner);
    });

    test('tenantRole=operator resolves to Operator', () => {
        const ctx = makeContext({ authenticated: true, tenantRole: 'operator' });
        expect(resolveCallerTier(ctx)).toBe(PermissionTier.Operator);
    });

    test('tenantRole=viewer resolves to Agent', () => {
        const ctx = makeContext({ authenticated: true, tenantRole: 'viewer' });
        expect(resolveCallerTier(ctx)).toBe(PermissionTier.Agent);
    });

    test('authenticated user role without tenantRole resolves to Agent', () => {
        // Covers developer/communicator role template holders and plain authenticated callers
        const ctx = makeContext({ authenticated: true, role: 'user' });
        expect(resolveCallerTier(ctx)).toBe(PermissionTier.Agent);
    });

    test('admin role takes priority over tenantRole', () => {
        const ctx = makeContext({ authenticated: true, role: 'admin', tenantRole: 'viewer' });
        expect(resolveCallerTier(ctx)).toBe(PermissionTier.Owner);
    });

    test('unknown tenantRole falls back to Agent when authenticated', () => {
        const ctx = makeContext({ authenticated: true, tenantRole: 'mystery-role' as any });
        expect(resolveCallerTier(ctx)).toBe(PermissionTier.Agent);
    });
});

// ─── resolveCallerTier with DB grant lookup ───────────────────────────────────

describe('resolveCallerTier — DB grant lookup', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
    });

    async function insertGrant(agentId: string, action: string): Promise<void> {
        const createdAt = new Date().toISOString();
        // Insert a grant (no HMAC check needed for tier lookup tests)
        db.query(`
            INSERT INTO permission_grants (agent_id, action, granted_by, reason, signature, expires_at, tenant_id, created_at)
            VALUES (?, ?, 'test', '', 'fakesig', NULL, 'default', ?)
        `).run(agentId, action, createdAt);
    }

    test('wallet with superuser grant (*) resolves to Owner', async () => {
        await insertGrant('WALLET1', '*');
        const ctx = makeContext({ authenticated: true, walletAddress: 'WALLET1' });
        expect(resolveCallerTier(ctx, db)).toBe(PermissionTier.Owner);
    });

    test('wallet with council:* grant resolves to Operator', async () => {
        await insertGrant('WALLET2', 'council:*');
        const ctx = makeContext({ authenticated: true, walletAddress: 'WALLET2' });
        expect(resolveCallerTier(ctx, db)).toBe(PermissionTier.Operator);
    });

    test('wallet with council:manage grant resolves to Operator', async () => {
        await insertGrant('WALLET3', 'council:manage');
        const ctx = makeContext({ authenticated: true, walletAddress: 'WALLET3' });
        expect(resolveCallerTier(ctx, db)).toBe(PermissionTier.Operator);
    });

    test('wallet with no governance grant falls back to Agent when authenticated', async () => {
        await insertGrant('WALLET4', 'git:read');
        const ctx = makeContext({ authenticated: true, walletAddress: 'WALLET4' });
        expect(resolveCallerTier(ctx, db)).toBe(PermissionTier.Agent);
    });

    test('unknown wallet address resolves to Agent (authenticated fallback)', async () => {
        const ctx = makeContext({ authenticated: true, walletAddress: 'UNKNOWN_WALLET' });
        expect(resolveCallerTier(ctx, db)).toBe(PermissionTier.Agent);
    });

    test('revoked grant does not elevate tier', async () => {
        const createdAt = new Date().toISOString();
        const revokedAt = new Date().toISOString();
        db.query(`
            INSERT INTO permission_grants (agent_id, action, granted_by, reason, signature, expires_at, revoked_at, tenant_id, created_at)
            VALUES (?, '*', 'test', '', 'fakesig', NULL, ?, 'default', ?)
        `).run('REVOKED_WALLET', revokedAt, createdAt);

        const ctx = makeContext({ authenticated: true, walletAddress: 'REVOKED_WALLET' });
        expect(resolveCallerTier(ctx, db)).toBe(PermissionTier.Agent);
    });

    test('expired grant does not elevate tier', async () => {
        const createdAt = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
        const expiresAt = new Date(Date.now() - 3600000).toISOString();  // expired 1h ago
        db.query(`
            INSERT INTO permission_grants (agent_id, action, granted_by, reason, signature, expires_at, tenant_id, created_at)
            VALUES (?, '*', 'test', '', 'fakesig', ?, 'default', ?)
        `).run('EXPIRED_WALLET', expiresAt, createdAt);

        const ctx = makeContext({ authenticated: true, walletAddress: 'EXPIRED_WALLET' });
        expect(resolveCallerTier(ctx, db)).toBe(PermissionTier.Agent);
    });
});

// ─── requirePermissionTier guard ─────────────────────────────────────────────

describe('requirePermissionTier guard', () => {
    test('Owner can act on Owner-only routes', () => {
        const ctx = makeContext({ authenticated: true, role: 'admin' });
        const guard = requirePermissionTier(PermissionTier.Owner);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).toBeNull(); // null = allowed
    });

    test('Owner can act on Operator-level routes', () => {
        const ctx = makeContext({ authenticated: true, role: 'admin' });
        const guard = requirePermissionTier(PermissionTier.Operator);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).toBeNull();
    });

    test('Owner can act on Agent-level routes', () => {
        const ctx = makeContext({ authenticated: true, role: 'admin' });
        const guard = requirePermissionTier(PermissionTier.Agent);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).toBeNull();
    });

    test('Operator can act on Operator-level routes', () => {
        const ctx = makeContext({ authenticated: true, tenantRole: 'operator' });
        const guard = requirePermissionTier(PermissionTier.Operator);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).toBeNull();
    });

    test('Operator is rejected on Owner-only routes', () => {
        const ctx = makeContext({ authenticated: true, tenantRole: 'operator' });
        const guard = requirePermissionTier(PermissionTier.Owner);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    test('Agent is rejected on Operator-only routes', () => {
        const ctx = makeContext({ authenticated: true });
        const guard = requirePermissionTier(PermissionTier.Operator);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    test('Agent is rejected on Owner-only routes', () => {
        const ctx = makeContext({ authenticated: true });
        const guard = requirePermissionTier(PermissionTier.Owner);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    test('Guest is rejected on Agent-only routes', () => {
        const ctx = makeContext({ authenticated: false });
        const guard = requirePermissionTier(PermissionTier.Agent);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    test('Guest is rejected on Operator-only routes', () => {
        const ctx = makeContext({ authenticated: false });
        const guard = requirePermissionTier(PermissionTier.Operator);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    test('Guest is rejected on Owner-only routes', () => {
        const ctx = makeContext({ authenticated: false });
        const guard = requirePermissionTier(PermissionTier.Owner);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    test('denial response uses generic error code (no tier info)', async () => {
        const ctx = makeContext({ authenticated: false });
        const guard = requirePermissionTier(PermissionTier.Agent);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).not.toBeNull();

        const body = await result!.json() as { error: string; code: string };
        expect(body.error).toBe('ERR_INSUFFICIENT_TIER');
        expect(body.code).toBe('GOVERNANCE_TIER_403');
        // Must not contain tier names in the response
        expect(JSON.stringify(body)).not.toMatch(/Guest|Agent|Operator|Owner/);
    });

    test('denial is JSON with correct Content-Type', () => {
        const ctx = makeContext({ authenticated: false });
        const guard = requirePermissionTier(PermissionTier.Operator);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result!.headers.get('Content-Type')).toBe('application/json');
    });

    test('Guest caller allowed on Guest-level routes (tier=0)', () => {
        const ctx = makeContext({ authenticated: false });
        const guard = requirePermissionTier(PermissionTier.Guest);
        const result = guard(makeRequest(), makeUrl(), ctx);
        expect(result).toBeNull();
    });
});

// ─── Integration: guard + DB ──────────────────────────────────────────────────

describe('requirePermissionTier with DB grant lookup', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
    });

    test('wallet with council:* grant passes Operator-level guard', () => {
        const createdAt = new Date().toISOString();
        db.query(`
            INSERT INTO permission_grants (agent_id, action, granted_by, reason, signature, expires_at, tenant_id, created_at)
            VALUES ('WALLET_OP', 'council:*', 'test', '', 'fakesig', NULL, 'default', ?)
        `).run(createdAt);

        const ctx = makeContext({ authenticated: true, walletAddress: 'WALLET_OP' });
        const guard = requirePermissionTier(PermissionTier.Operator, db);
        const result = guard(makeRequest('POST', '/api/councils'), makeUrl('/api/councils'), ctx);
        expect(result).toBeNull(); // allowed
    });

    test('wallet with no grants is rejected on Operator-level guard', () => {
        const ctx = makeContext({ authenticated: true, walletAddress: 'WALLET_NONE' });
        const guard = requirePermissionTier(PermissionTier.Operator, db);
        const result = guard(makeRequest('POST', '/api/councils'), makeUrl('/api/councils'), ctx);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });
});
