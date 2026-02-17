/**
 * BillingService — Usage-based billing metering and subscription management.
 *
 * Tracks credit consumption per tenant, generates usage records for billing
 * periods, and manages subscription lifecycle.
 */
import type { Database } from 'bun:sqlite';
import type {
    Subscription,
    UsageRecord,
    Invoice,
    SubscriptionRecord,
    UsageRecordRow,
    InvoiceRecord,
    SubscriptionStatus,
} from './types';
import { CREDIT_PRICING_TIERS } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('BillingService');

function recordToSubscription(row: SubscriptionRecord): Subscription {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        plan: row.plan,
        status: row.status as SubscriptionStatus,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        cancelAtPeriodEnd: row.cancel_at_period_end === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function recordToUsage(row: UsageRecordRow): UsageRecord {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        creditsUsed: row.credits_used,
        apiCalls: row.api_calls,
        sessionCount: row.session_count,
        storageMb: row.storage_mb,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        reported: row.reported === 1,
        createdAt: row.created_at,
    };
}

function recordToInvoice(row: InvoiceRecord): Invoice {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        stripeInvoiceId: row.stripe_invoice_id,
        amountCents: row.amount_cents,
        currency: row.currency,
        status: row.status as Invoice['status'],
        periodStart: row.period_start,
        periodEnd: row.period_end,
        paidAt: row.paid_at,
        createdAt: row.created_at,
    };
}

export class BillingService {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    // ─── Subscriptions ───────────────────────────────────────────────────────

    createSubscription(
        tenantId: string,
        stripeSubscriptionId: string,
        plan: string,
        periodStart: string,
        periodEnd: string,
    ): Subscription {
        const id = crypto.randomUUID();
        this.db.query(`
            INSERT INTO subscriptions
                (id, tenant_id, stripe_subscription_id, plan, status,
                 current_period_start, current_period_end)
            VALUES (?, ?, ?, ?, 'active', ?, ?)
        `).run(id, tenantId, stripeSubscriptionId, plan, periodStart, periodEnd);

        log.info('Created subscription', { tenantId, plan, stripeSubscriptionId });
        return this.getSubscription(tenantId)!;
    }

    getSubscription(tenantId: string): Subscription | null {
        const row = this.db.query(
            'SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY rowid DESC LIMIT 1',
        ).get(tenantId) as SubscriptionRecord | null;
        return row ? recordToSubscription(row) : null;
    }

    updateSubscriptionStatus(tenantId: string, status: SubscriptionStatus): void {
        this.db.query(`
            UPDATE subscriptions
            SET status = ?, updated_at = datetime('now')
            WHERE tenant_id = ? AND status != 'canceled'
        `).run(status, tenantId);
    }

    cancelSubscription(tenantId: string, atPeriodEnd: boolean = true): void {
        if (atPeriodEnd) {
            this.db.query(`
                UPDATE subscriptions
                SET cancel_at_period_end = 1, updated_at = datetime('now')
                WHERE tenant_id = ? AND status = 'active'
            `).run(tenantId);
        } else {
            this.db.query(`
                UPDATE subscriptions
                SET status = 'canceled', updated_at = datetime('now')
                WHERE tenant_id = ? AND status = 'active'
            `).run(tenantId);
        }
        log.info('Canceled subscription', { tenantId, atPeriodEnd });
    }

    // ─── Usage Tracking ──────────────────────────────────────────────────────

    /**
     * Record credit usage for a tenant.
     * Accumulates into the current billing period's usage record.
     */
    recordUsage(
        tenantId: string,
        credits: number,
        apiCalls: number = 0,
        sessions: number = 0,
    ): void {
        const periodStart = this.getCurrentPeriodStart(tenantId);
        const periodEnd = this.getCurrentPeriodEnd(tenantId);

        // Upsert current period usage
        const existing = this.db.query(`
            SELECT id FROM usage_records
            WHERE tenant_id = ? AND period_start = ?
        `).get(tenantId, periodStart) as { id: string } | null;

        if (existing) {
            this.db.query(`
                UPDATE usage_records
                SET credits_used = credits_used + ?,
                    api_calls = api_calls + ?,
                    session_count = session_count + ?
                WHERE id = ?
            `).run(credits, apiCalls, sessions, existing.id);
        } else {
            const id = crypto.randomUUID();
            this.db.query(`
                INSERT INTO usage_records
                    (id, tenant_id, credits_used, api_calls, session_count,
                     storage_mb, period_start, period_end, reported)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)
            `).run(id, tenantId, credits, apiCalls, sessions, periodStart, periodEnd);
        }
    }

    /**
     * Get current period usage for a tenant.
     */
    getCurrentUsage(tenantId: string): UsageRecord | null {
        const periodStart = this.getCurrentPeriodStart(tenantId);
        const row = this.db.query(`
            SELECT * FROM usage_records
            WHERE tenant_id = ? AND period_start = ?
        `).get(tenantId, periodStart) as UsageRecordRow | null;
        return row ? recordToUsage(row) : null;
    }

    /**
     * Get usage history for a tenant.
     */
    getUsageHistory(tenantId: string, limit: number = 12): UsageRecord[] {
        const rows = this.db.query(`
            SELECT * FROM usage_records
            WHERE tenant_id = ?
            ORDER BY period_start DESC
            LIMIT ?
        `).all(tenantId, limit) as UsageRecordRow[];
        return rows.map(recordToUsage);
    }

    // ─── Cost Calculation ────────────────────────────────────────────────────

    /**
     * Calculate the cost in cents for a given number of credits.
     * Uses tiered pricing.
     */
    calculateCost(credits: number): number {
        let remaining = credits;
        let totalCents = 0;
        let previousTierMax = 0;

        for (const tier of CREDIT_PRICING_TIERS) {
            const tierMax = tier.upTo ?? Infinity;
            const tierCredits = Math.min(remaining, tierMax - previousTierMax);

            if (tierCredits <= 0) break;

            totalCents += Math.ceil(tierCredits / 1000) * tier.pricePerThousandCents;
            remaining -= tierCredits;
            previousTierMax = tierMax;

            if (remaining <= 0) break;
        }

        return totalCents;
    }

    // ─── Invoices ────────────────────────────────────────────────────────────

    createInvoice(
        tenantId: string,
        stripeInvoiceId: string,
        amountCents: number,
        periodStart: string,
        periodEnd: string,
    ): Invoice {
        const id = crypto.randomUUID();
        this.db.query(`
            INSERT INTO invoices
                (id, tenant_id, stripe_invoice_id, amount_cents, currency,
                 status, period_start, period_end)
            VALUES (?, ?, ?, ?, 'usd', 'open', ?, ?)
        `).run(id, tenantId, stripeInvoiceId, amountCents, periodStart, periodEnd);

        return this.getInvoice(id)!;
    }

    getInvoice(id: string): Invoice | null {
        const row = this.db.query(
            'SELECT * FROM invoices WHERE id = ?',
        ).get(id) as InvoiceRecord | null;
        return row ? recordToInvoice(row) : null;
    }

    getInvoicesForTenant(tenantId: string, limit: number = 12): Invoice[] {
        const rows = this.db.query(`
            SELECT * FROM invoices
            WHERE tenant_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(tenantId, limit) as InvoiceRecord[];
        return rows.map(recordToInvoice);
    }

    markInvoicePaid(stripeInvoiceId: string): void {
        this.db.query(`
            UPDATE invoices
            SET status = 'paid', paid_at = datetime('now')
            WHERE stripe_invoice_id = ?
        `).run(stripeInvoiceId);
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private getCurrentPeriodStart(tenantId: string): string {
        const sub = this.getSubscription(tenantId);
        if (sub) return sub.currentPeriodStart;
        // Default: first of current month
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }

    private getCurrentPeriodEnd(tenantId: string): string {
        const sub = this.getSubscription(tenantId);
        if (sub) return sub.currentPeriodEnd;
        // Default: first of next month
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    }
}
