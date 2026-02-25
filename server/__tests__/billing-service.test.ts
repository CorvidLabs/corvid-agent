/**
 * Tests for BillingService — subscription management, usage tracking,
 * tiered cost calculation, and invoice lifecycle.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { BillingService } from '../billing/service';

let db: Database;
let billing: BillingService;
let tenantId: string;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Seed a tenant
    tenantId = crypto.randomUUID();
    db.query(
        "INSERT INTO tenants (id, name, slug, owner_email) VALUES (?, 'Test Tenant', 'test-tenant', 'test@example.com')",
    ).run(tenantId);

    billing = new BillingService(db);
});

afterEach(() => {
    db.close();
});

// ── Subscriptions ────────────────────────────────────────────────────────

describe('Subscriptions', () => {
    it('creates a subscription', () => {
        const sub = billing.createSubscription(
            tenantId,
            'sub_stripe_123',
            'pro',
            '2024-01-01T00:00:00Z',
            '2024-02-01T00:00:00Z',
        );

        expect(sub.tenantId).toBe(tenantId);
        expect(sub.stripeSubscriptionId).toBe('sub_stripe_123');
        expect(sub.plan).toBe('pro');
        expect(sub.status).toBe('active');
        expect(sub.cancelAtPeriodEnd).toBe(false);
    });

    it('getSubscription returns null for unknown tenant', () => {
        expect(billing.getSubscription('nonexistent')).toBeNull();
    });

    it('getSubscription returns the latest subscription', () => {
        billing.createSubscription(tenantId, 'sub_old', 'basic', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
        billing.createSubscription(tenantId, 'sub_new', 'pro', '2024-02-01T00:00:00Z', '2024-03-01T00:00:00Z');

        const sub = billing.getSubscription(tenantId);
        expect(sub).not.toBeNull();
        expect(sub!.stripeSubscriptionId).toBe('sub_new');
        expect(sub!.plan).toBe('pro');
    });

    it('updateSubscriptionStatus changes status', () => {
        billing.createSubscription(tenantId, 'sub_1', 'pro', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
        billing.updateSubscriptionStatus(tenantId, 'past_due');

        const sub = billing.getSubscription(tenantId);
        expect(sub!.status).toBe('past_due');
    });

    it('cancelSubscription at period end sets flag', () => {
        billing.createSubscription(tenantId, 'sub_cancel', 'pro', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
        billing.cancelSubscription(tenantId, true);

        const sub = billing.getSubscription(tenantId);
        expect(sub!.cancelAtPeriodEnd).toBe(true);
        expect(sub!.status).toBe('active');
    });

    it('cancelSubscription immediately changes status', () => {
        billing.createSubscription(tenantId, 'sub_cancel_now', 'pro', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
        billing.cancelSubscription(tenantId, false);

        const sub = billing.getSubscription(tenantId);
        expect(sub!.status).toBe('canceled');
    });
});

// ── Usage Tracking ──────────────────────────────────────────────────────

describe('Usage Tracking', () => {
    it('records usage for a new period', () => {
        billing.createSubscription(tenantId, 'sub_u', 'pro', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
        billing.recordUsage(tenantId, 100, 5, 2);

        const usage = billing.getCurrentUsage(tenantId);
        expect(usage).not.toBeNull();
        expect(usage!.creditsUsed).toBe(100);
        expect(usage!.apiCalls).toBe(5);
        expect(usage!.sessionCount).toBe(2);
    });

    it('accumulates usage within the same period', () => {
        billing.createSubscription(tenantId, 'sub_acc', 'pro', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
        billing.recordUsage(tenantId, 50, 3, 1);
        billing.recordUsage(tenantId, 75, 2, 1);

        const usage = billing.getCurrentUsage(tenantId);
        expect(usage!.creditsUsed).toBe(125);
        expect(usage!.apiCalls).toBe(5);
        expect(usage!.sessionCount).toBe(2);
    });

    it('getCurrentUsage returns null when no usage recorded', () => {
        billing.createSubscription(tenantId, 'sub_empty', 'pro', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
        expect(billing.getCurrentUsage(tenantId)).toBeNull();
    });

    it('getUsageHistory returns records ordered by period', () => {
        // Without subscription, uses default monthly periods
        billing.recordUsage(tenantId, 50);
        billing.recordUsage(tenantId, 75);

        const history = billing.getUsageHistory(tenantId);
        expect(history.length).toBeGreaterThanOrEqual(1);
        expect(history[0].creditsUsed).toBe(125);
    });

    it('getUsageHistory respects limit', () => {
        billing.recordUsage(tenantId, 100);

        const limited = billing.getUsageHistory(tenantId, 1);
        expect(limited.length).toBeLessThanOrEqual(1);
    });
});

// ── Cost Calculation ────────────────────────────────────────────────────

describe('Cost Calculation', () => {
    it('calculates cost for tier 1 (first 10K credits)', () => {
        // 5000 credits at $1.00 per 1K = $5.00 = 500 cents
        const cost = billing.calculateCost(5000);
        expect(cost).toBe(500);
    });

    it('calculates cost for tier 1 boundary', () => {
        // 10000 credits at $1.00 per 1K = $10.00 = 1000 cents
        const cost = billing.calculateCost(10000);
        expect(cost).toBe(1000);
    });

    it('calculates cost spanning tier 1 and tier 2', () => {
        // 15000 credits:
        //   First 10K: 10 * 100 = 1000 cents
        //   Next 5K: 5 * 80 = 400 cents
        //   Total: 1400 cents
        const cost = billing.calculateCost(15000);
        expect(cost).toBe(1400);
    });

    it('calculates cost spanning all tiers', () => {
        // 150000 credits:
        //   First 10K: 10 * 100 = 1000 cents
        //   Next 90K: 90 * 80 = 7200 cents
        //   Remaining 50K: 50 * 50 = 2500 cents
        //   Total: 10700 cents
        const cost = billing.calculateCost(150000);
        expect(cost).toBe(10700);
    });

    it('calculates zero cost for zero credits', () => {
        expect(billing.calculateCost(0)).toBe(0);
    });

    it('handles small amounts (less than 1K)', () => {
        // 500 credits: ceil(500/1000) = 1 unit * 100 cents = 100 cents
        const cost = billing.calculateCost(500);
        expect(cost).toBe(100);
    });
});

// ── Invoices ────────────────────────────────────────────────────────────

describe('Invoices', () => {
    it('creates an invoice', () => {
        const invoice = billing.createInvoice(
            tenantId,
            'inv_stripe_123',
            1500,
            '2024-01-01T00:00:00Z',
            '2024-02-01T00:00:00Z',
        );

        expect(invoice.tenantId).toBe(tenantId);
        expect(invoice.stripeInvoiceId).toBe('inv_stripe_123');
        expect(invoice.amountCents).toBe(1500);
        expect(invoice.currency).toBe('usd');
        expect(invoice.status).toBe('open');
        expect(invoice.paidAt).toBeNull();
    });

    it('getInvoice returns null for unknown ID', () => {
        expect(billing.getInvoice('nonexistent')).toBeNull();
    });

    it('getInvoicesForTenant returns invoices ordered by creation', () => {
        billing.createInvoice(tenantId, 'inv_1', 100, '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
        billing.createInvoice(tenantId, 'inv_2', 200, '2024-02-01T00:00:00Z', '2024-03-01T00:00:00Z');

        const invoices = billing.getInvoicesForTenant(tenantId);
        expect(invoices.length).toBe(2);
    });

    it('getInvoicesForTenant respects limit', () => {
        billing.createInvoice(tenantId, 'inv_a', 100, '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
        billing.createInvoice(tenantId, 'inv_b', 200, '2024-02-01T00:00:00Z', '2024-03-01T00:00:00Z');

        const limited = billing.getInvoicesForTenant(tenantId, 1);
        expect(limited.length).toBe(1);
    });

    it('markInvoicePaid updates status and paid_at', () => {
        const invoice = billing.createInvoice(tenantId, 'inv_pay', 500, '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
        billing.markInvoicePaid('inv_pay');

        const updated = billing.getInvoice(invoice.id);
        expect(updated!.status).toBe('paid');
        expect(updated!.paidAt).not.toBeNull();
    });

    it('returns empty array for tenant with no invoices', () => {
        expect(billing.getInvoicesForTenant(tenantId)).toEqual([]);
    });
});
