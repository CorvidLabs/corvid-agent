/**
 * Tests for Multi-Tenant Isolation and Billing Service.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { TenantService } from '../tenant/context';
import { BillingService } from '../billing/service';
import { withTenantFilter, validateTenantOwnership, TENANT_SCOPED_TABLES } from '../tenant/db-filter';
import { registerApiKey, revokeApiKey } from '../tenant/middleware';
import { DEFAULT_TENANT_ID, PLAN_LIMITS } from '../tenant/types';
import { CREDIT_PRICING_TIERS } from '../billing/types';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);

    // Tenant tables
    d.exec(`
        CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            owner_email TEXT NOT NULL,
            stripe_customer_id TEXT DEFAULT NULL,
            plan TEXT DEFAULT 'free',
            max_agents INTEGER DEFAULT 3,
            max_concurrent_sessions INTEGER DEFAULT 2,
            sandbox_enabled INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    d.exec(`
        CREATE TABLE IF NOT EXISTS api_keys (
            key_hash TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            label TEXT DEFAULT 'default',
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Billing tables
    d.exec(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            stripe_subscription_id TEXT NOT NULL,
            plan TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            current_period_start TEXT NOT NULL,
            current_period_end TEXT NOT NULL,
            cancel_at_period_end INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    d.exec(`
        CREATE TABLE IF NOT EXISTS usage_records (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            credits_used INTEGER DEFAULT 0,
            api_calls INTEGER DEFAULT 0,
            session_count INTEGER DEFAULT 0,
            storage_mb REAL DEFAULT 0,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            reported INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    d.exec(`
        CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            stripe_invoice_id TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            currency TEXT DEFAULT 'usd',
            status TEXT DEFAULT 'open',
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            paid_at TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    return d;
}

// ─── Tenant Service Tests ────────────────────────────────────────────────────

describe('TenantService', () => {
    let svc: TenantService;

    beforeEach(() => {
        db = setupDb();
        svc = new TenantService(db, true); // multi-tenant mode
    });

    test('isMultiTenant returns configured mode', () => {
        expect(svc.isMultiTenant()).toBe(true);

        const single = new TenantService(db, false);
        expect(single.isMultiTenant()).toBe(false);
    });

    test('single-tenant resolveContext returns enterprise defaults', () => {
        const single = new TenantService(db, false);
        const ctx = single.resolveContext();
        expect(ctx.tenantId).toBe(DEFAULT_TENANT_ID);
        expect(ctx.plan).toBe('enterprise');
    });

    test('createTenant creates with free plan by default', () => {
        const tenant = svc.createTenant({
            name: 'Test Corp',
            slug: 'test-corp',
            ownerEmail: 'admin@test.com',
        });

        expect(tenant.id).toBeTruthy();
        expect(tenant.name).toBe('Test Corp');
        expect(tenant.slug).toBe('test-corp');
        expect(tenant.plan).toBe('free');
        expect(tenant.maxAgents).toBe(PLAN_LIMITS.free.maxAgents);
        expect(tenant.status).toBe('active');
    });

    test('createTenant with specified plan', () => {
        const tenant = svc.createTenant({
            name: 'Pro Corp',
            slug: 'pro-corp',
            ownerEmail: 'admin@pro.com',
            plan: 'pro',
        });

        expect(tenant.plan).toBe('pro');
        expect(tenant.maxAgents).toBe(PLAN_LIMITS.pro.maxAgents);
    });

    test('getTenant returns null for non-existent', () => {
        expect(svc.getTenant('nonexistent')).toBeNull();
    });

    test('getTenantBySlug works', () => {
        svc.createTenant({ name: 'Sluggy', slug: 'sluggy', ownerEmail: 'a@b.com' });
        const found = svc.getTenantBySlug('sluggy');
        expect(found).not.toBeNull();
        expect(found!.name).toBe('Sluggy');
    });

    test('listTenants returns all tenants', () => {
        svc.createTenant({ name: 'A', slug: 'a', ownerEmail: 'a@b.com' });
        svc.createTenant({ name: 'B', slug: 'b', ownerEmail: 'b@b.com' });

        const list = svc.listTenants();
        expect(list.length).toBe(2);
    });

    test('updatePlan changes plan and limits', () => {
        const tenant = svc.createTenant({ name: 'Upgrade', slug: 'upgrade', ownerEmail: 'a@b.com' });
        expect(tenant.plan).toBe('free');

        const updated = svc.updatePlan(tenant.id, 'pro');
        expect(updated!.plan).toBe('pro');
        expect(updated!.maxAgents).toBe(PLAN_LIMITS.pro.maxAgents);
    });

    test('setStripeCustomerId stores customer ID', () => {
        const tenant = svc.createTenant({ name: 'Stripe', slug: 'stripe', ownerEmail: 'a@b.com' });
        svc.setStripeCustomerId(tenant.id, 'cus_abc123');

        const fetched = svc.getTenant(tenant.id);
        expect(fetched!.stripeCustomerId).toBe('cus_abc123');
    });

    test('suspendTenant changes status', () => {
        const tenant = svc.createTenant({ name: 'Bad', slug: 'bad', ownerEmail: 'a@b.com' });
        svc.suspendTenant(tenant.id);

        const fetched = svc.getTenant(tenant.id);
        expect(fetched!.status).toBe('suspended');
    });

    test('resolveContext returns correct plan limits', () => {
        const tenant = svc.createTenant({ name: 'Ctx', slug: 'ctx', ownerEmail: 'a@b.com', plan: 'starter' });
        const ctx = svc.resolveContext(tenant.id);

        expect(ctx.tenantId).toBe(tenant.id);
        expect(ctx.plan).toBe('starter');
        expect(ctx.limits).toEqual(PLAN_LIMITS.starter);
    });
});

// ─── DB Filter Tests ─────────────────────────────────────────────────────────

describe('Tenant DB Filter', () => {
    test('withTenantFilter is no-op for default tenant', () => {
        const result = withTenantFilter('SELECT * FROM agents', DEFAULT_TENANT_ID);
        expect(result.query).toBe('SELECT * FROM agents');
        expect(result.bindings.length).toBe(0);
    });

    test('withTenantFilter adds WHERE for custom tenant', () => {
        const result = withTenantFilter('SELECT * FROM agents', 'tenant-1');
        expect(result.query).toContain('WHERE tenant_id = ?');
        expect(result.bindings).toEqual(['tenant-1']);
    });

    test('withTenantFilter injects into existing WHERE', () => {
        const result = withTenantFilter("SELECT * FROM agents WHERE status = 'active'", 'tenant-1');
        expect(result.query).toContain("WHERE status = 'active' AND tenant_id = ?");
        expect(result.bindings).toEqual(['tenant-1']);
    });

    test('withTenantFilter inserts before ORDER BY', () => {
        const result = withTenantFilter('SELECT * FROM agents ORDER BY name', 'tenant-1');
        expect(result.query).toContain('WHERE tenant_id = ?');
        expect(result.query).toContain('ORDER BY name');
    });

    test('validateTenantOwnership returns true for default tenant', () => {
        expect(validateTenantOwnership(db, 'tenants', 'any-id', DEFAULT_TENANT_ID)).toBe(true);
    });

    test('TENANT_SCOPED_TABLES includes key tables', () => {
        expect(TENANT_SCOPED_TABLES).toContain('projects');
        expect(TENANT_SCOPED_TABLES).toContain('agents');
        expect(TENANT_SCOPED_TABLES).toContain('sessions');
    });
});

// ─── API Key Management Tests ────────────────────────────────────────────────

describe('API Key Management', () => {
    beforeEach(() => {
        db = setupDb();
    });

    test('registerApiKey creates key mapping', () => {
        registerApiKey(db, 'tenant-1', 'test-api-key-12345', 'test');

        const row = db.query('SELECT * FROM api_keys WHERE tenant_id = ?').get('tenant-1');
        expect(row).not.toBeNull();
    });

    test('revokeApiKey removes key', () => {
        registerApiKey(db, 'tenant-1', 'revoke-me-key', 'temp');
        expect(revokeApiKey(db, 'revoke-me-key')).toBe(true);

        const row = db.query('SELECT * FROM api_keys WHERE tenant_id = ?').get('tenant-1');
        expect(row).toBeNull();
    });

    test('revokeApiKey returns false for non-existent', () => {
        expect(revokeApiKey(db, 'nonexistent-key')).toBe(false);
    });
});

// ─── Billing Service Tests ───────────────────────────────────────────────────

describe('BillingService', () => {
    let billing: BillingService;

    beforeEach(() => {
        db = setupDb();
        billing = new BillingService(db);
    });

    test('createSubscription creates active subscription', () => {
        const sub = billing.createSubscription(
            'tenant-1',
            'sub_abc123',
            'pro',
            '2026-02-01T00:00:00Z',
            '2026-03-01T00:00:00Z',
        );

        expect(sub.tenantId).toBe('tenant-1');
        expect(sub.plan).toBe('pro');
        expect(sub.status).toBe('active');
        expect(sub.stripeSubscriptionId).toBe('sub_abc123');
    });

    test('getSubscription returns latest subscription', () => {
        billing.createSubscription('tenant-1', 'sub_1', 'free', '2026-01-01', '2026-02-01');
        billing.createSubscription('tenant-1', 'sub_2', 'pro', '2026-02-01', '2026-03-01');

        const sub = billing.getSubscription('tenant-1');
        expect(sub!.stripeSubscriptionId).toBe('sub_2');
    });

    test('getSubscription returns null for unknown tenant', () => {
        expect(billing.getSubscription('nonexistent')).toBeNull();
    });

    test('cancelSubscription marks cancel_at_period_end', () => {
        billing.createSubscription('tenant-1', 'sub_1', 'pro', '2026-02-01', '2026-03-01');
        billing.cancelSubscription('tenant-1', true);

        const sub = billing.getSubscription('tenant-1');
        expect(sub!.cancelAtPeriodEnd).toBe(true);
        expect(sub!.status).toBe('active'); // Still active until period end
    });

    test('cancelSubscription immediate sets canceled status', () => {
        billing.createSubscription('tenant-1', 'sub_1', 'pro', '2026-02-01', '2026-03-01');
        billing.cancelSubscription('tenant-1', false);

        const sub = billing.getSubscription('tenant-1');
        expect(sub!.status).toBe('canceled');
    });

    // ─── Usage Tracking ──────────────────────────────────────────────────

    test('recordUsage accumulates credits', () => {
        billing.createSubscription('tenant-1', 'sub_1', 'pro', '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z');

        billing.recordUsage('tenant-1', 100, 5, 1);
        billing.recordUsage('tenant-1', 50, 3, 0);

        const usage = billing.getCurrentUsage('tenant-1');
        expect(usage).not.toBeNull();
        expect(usage!.creditsUsed).toBe(150);
        expect(usage!.apiCalls).toBe(8);
        expect(usage!.sessionCount).toBe(1);
    });

    test('getCurrentUsage returns null for no usage', () => {
        expect(billing.getCurrentUsage('tenant-no-usage')).toBeNull();
    });

    test('getUsageHistory returns records', () => {
        billing.recordUsage('tenant-1', 100);
        const history = billing.getUsageHistory('tenant-1');
        expect(history.length).toBeGreaterThan(0);
    });

    // ─── Cost Calculation ────────────────────────────────────────────────

    test('calculateCost uses tiered pricing', () => {
        // First tier: $1.00 per 1K credits
        const cost1k = billing.calculateCost(1_000);
        expect(cost1k).toBe(100); // 100 cents = $1.00

        const cost5k = billing.calculateCost(5_000);
        expect(cost5k).toBe(500); // 500 cents = $5.00
    });

    test('calculateCost returns 0 for 0 credits', () => {
        expect(billing.calculateCost(0)).toBe(0);
    });

    test('CREDIT_PRICING_TIERS has escalating thresholds', () => {
        let lastMax = 0;
        for (const tier of CREDIT_PRICING_TIERS) {
            if (tier.upTo !== null) {
                expect(tier.upTo).toBeGreaterThan(lastMax);
                lastMax = tier.upTo;
            }
        }
    });

    test('last tier has null upTo (unlimited)', () => {
        const lastTier = CREDIT_PRICING_TIERS[CREDIT_PRICING_TIERS.length - 1];
        expect(lastTier.upTo).toBeNull();
    });

    // ─── Invoices ────────────────────────────────────────────────────────

    test('createInvoice stores invoice', () => {
        const invoice = billing.createInvoice(
            'tenant-1', 'inv_abc', 5000, '2026-02-01', '2026-03-01',
        );

        expect(invoice.tenantId).toBe('tenant-1');
        expect(invoice.amountCents).toBe(5000);
        expect(invoice.status).toBe('open');
    });

    test('markInvoicePaid updates status', () => {
        billing.createInvoice('tenant-1', 'inv_pay', 1000, '2026-02-01', '2026-03-01');
        billing.markInvoicePaid('inv_pay');

        const invoices = billing.getInvoicesForTenant('tenant-1');
        expect(invoices[0].status).toBe('paid');
        expect(invoices[0].paidAt).not.toBeNull();
    });

    test('getInvoicesForTenant returns empty for unknown tenant', () => {
        expect(billing.getInvoicesForTenant('nonexistent')).toEqual([]);
    });
});
