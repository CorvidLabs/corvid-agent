/**
 * SubscriptionService — Marketplace subscription billing with recurring charges.
 *
 * Lifecycle:
 *   1. Subscribe: create subscription, charge first period immediately
 *   2. Renew: scheduler job checks current_period_end <= now, charges next period
 *   3. Insufficient funds: set past_due, 48h grace, then expired
 *   4. Cancel: set cancelled_at, active until current_period_end, then expired
 *   5. Access check: hasActiveSubscription(listingId, tenantId)
 */
import type { Database } from 'bun:sqlite';
import { getBalance } from '../db/credits';
import { recordAudit } from '../db/audit';
import { createLogger } from '../lib/logger';

const log = createLogger('MarketplaceSubscriptions');

// ─── Types ───────────────────────────────────────────────────────────────────

export type BillingCycle = 'daily' | 'weekly' | 'monthly';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'past_due';

export interface MarketplaceSubscription {
    id: string;
    listingId: string;
    subscriberTenantId: string;
    sellerTenantId: string;
    priceCredits: number;
    billingCycle: BillingCycle;
    status: SubscriptionStatus;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelledAt: string | null;
    createdAt: string;
}

interface SubscriptionRecord {
    id: string;
    listing_id: string;
    subscriber_tenant_id: string;
    seller_tenant_id: string;
    price_credits: number;
    billing_cycle: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    cancelled_at: string | null;
    created_at: string;
}

/** Grace period before past_due subscriptions expire (hours). */
const GRACE_PERIOD_HOURS = 48;

// ─── Service ─────────────────────────────────────────────────────────────────

export class SubscriptionService {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Create a new subscription — charges the first billing period immediately.
     * Returns null if the subscriber has insufficient credits.
     */
    subscribe(
        listingId: string,
        subscriberTenantId: string,
        sellerTenantId: string,
        priceCredits: number,
        billingCycle: BillingCycle,
    ): MarketplaceSubscription | null {
        const id = crypto.randomUUID();
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const periodEnd = computePeriodEnd(now, billingCycle);

        const created = this.db.transaction(() => {
            // Atomic debit with balance guard
            const updated = this.db.query(`
                UPDATE credit_ledger
                SET credits = credits - ?,
                    total_consumed = total_consumed + ?,
                    updated_at = datetime('now')
                WHERE wallet_address = ? AND (credits - reserved) >= ?
            `).run(priceCredits, priceCredits, subscriberTenantId, priceCredits);

            if (updated.changes === 0) {
                return false;
            }

            // Record credit transaction
            const newBalance = getBalance(this.db, subscriberTenantId);
            this.db.query(`
                INSERT INTO credit_transactions
                    (wallet_address, type, amount, balance_after, reference)
                VALUES (?, 'deduction', ?, ?, ?)
            `).run(subscriberTenantId, priceCredits, newBalance.credits, `subscription:${id}`);

            // Credit seller
            this.db.query(`
                INSERT OR IGNORE INTO credit_ledger
                    (wallet_address, credits, reserved, total_purchased, total_consumed)
                VALUES (?, 0, 0, 0, 0)
            `).run(sellerTenantId);

            this.db.query(`
                UPDATE credit_ledger
                SET credits = credits + ?,
                    updated_at = datetime('now')
                WHERE wallet_address = ?
            `).run(priceCredits, sellerTenantId);

            const sellerBalance = getBalance(this.db, sellerTenantId);
            this.db.query(`
                INSERT INTO credit_transactions
                    (wallet_address, type, amount, balance_after, reference)
                VALUES (?, 'grant', ?, ?, ?)
            `).run(sellerTenantId, priceCredits, sellerBalance.credits, `subscription_revenue:${id}`);

            // Create subscription record
            this.db.query(`
                INSERT INTO marketplace_subscriptions
                    (id, listing_id, subscriber_tenant_id, seller_tenant_id, price_credits,
                     billing_cycle, status, current_period_start, current_period_end)
                VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
            `).run(id, listingId, subscriberTenantId, sellerTenantId, priceCredits,
                billingCycle, now, periodEnd);

            return true;
        })();

        if (!created) {
            log.warn('Subscription failed: insufficient credits', {
                subscriber: subscriberTenantId,
                required: priceCredits,
            });
            return null;
        }

        recordAudit(this.db, 'credit_deduction', subscriberTenantId, 'marketplace_subscriptions', id,
            `Subscription created: ${priceCredits} credits/${billingCycle} for listing ${listingId}`);

        log.info('Subscription created', { id, listingId, subscriber: subscriberTenantId, priceCredits, billingCycle });
        return this.getSubscription(id)!;
    }

    /**
     * Cancel a subscription. Remains active until current_period_end, then expires.
     */
    cancel(subscriptionId: string, subscriberTenantId: string): MarketplaceSubscription | null {
        const sub = this.getSubscription(subscriptionId);
        if (!sub) return null;
        if (sub.subscriberTenantId !== subscriberTenantId) return null;
        if (sub.status === 'expired') return null;

        this.db.query(`
            UPDATE marketplace_subscriptions
            SET status = 'cancelled', cancelled_at = datetime('now')
            WHERE id = ?
        `).run(subscriptionId);

        recordAudit(this.db, 'subscription_cancel', subscriberTenantId, 'marketplace_subscriptions', subscriptionId,
            `Subscription cancelled for listing ${sub.listingId}`);

        log.info('Subscription cancelled', { id: subscriptionId, subscriber: subscriberTenantId });
        return this.getSubscription(subscriptionId);
    }

    /**
     * Check if a tenant has an active subscription to a listing.
     */
    hasActiveSubscription(listingId: string, tenantId: string): boolean {
        const row = this.db.query(`
            SELECT 1 FROM marketplace_subscriptions
            WHERE listing_id = ? AND subscriber_tenant_id = ?
              AND status IN ('active', 'cancelled')
              AND current_period_end > datetime('now')
            LIMIT 1
        `).get(listingId, tenantId);

        return row !== null;
    }

    /**
     * Process renewals — called by the scheduler hourly.
     * Charges next period for active subscriptions whose current_period_end <= now.
     */
    processRenewals(): { renewed: number; pastDue: number; expired: number } {
        let renewed = 0;
        let pastDue = 0;
        let expired = 0;

        // 1. Expire cancelled subscriptions past their period end
        const expiredCancelled = this.db.query(`
            UPDATE marketplace_subscriptions
            SET status = 'expired'
            WHERE status = 'cancelled'
              AND current_period_end <= datetime('now')
        `).run();
        expired += expiredCancelled.changes;

        // 2. Expire past_due subscriptions past grace period
        const expiredPastDue = this.db.query(`
            UPDATE marketplace_subscriptions
            SET status = 'expired'
            WHERE status = 'past_due'
              AND datetime(current_period_end, '+' || ? || ' hours') <= datetime('now')
        `).run(GRACE_PERIOD_HOURS);
        expired += expiredPastDue.changes;

        // 3. Renew active subscriptions whose period has ended
        const dueForRenewal = this.db.query(`
            SELECT * FROM marketplace_subscriptions
            WHERE status = 'active'
              AND current_period_end <= datetime('now')
        `).all() as SubscriptionRecord[];

        for (const row of dueForRenewal) {
            const success = this.chargeRenewal(row);
            if (success) {
                renewed++;
            } else {
                pastDue++;
            }
        }

        if (renewed > 0 || pastDue > 0 || expired > 0) {
            log.info('Subscription renewals processed', { renewed, pastDue, expired });
        }

        return { renewed, pastDue, expired };
    }

    /**
     * Get a single subscription by ID.
     */
    getSubscription(id: string): MarketplaceSubscription | null {
        const row = this.db.query(
            'SELECT * FROM marketplace_subscriptions WHERE id = ?',
        ).get(id) as SubscriptionRecord | null;

        return row ? recordToSubscription(row) : null;
    }

    /**
     * List subscriptions for a subscriber tenant.
     */
    getBySubscriber(subscriberTenantId: string, status?: SubscriptionStatus): MarketplaceSubscription[] {
        let sql = 'SELECT * FROM marketplace_subscriptions WHERE subscriber_tenant_id = ?';
        const params: string[] = [subscriberTenantId];

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }

        sql += ' ORDER BY created_at DESC';

        const rows = this.db.query(sql).all(...params) as SubscriptionRecord[];
        return rows.map(recordToSubscription);
    }

    /**
     * List subscribers for a listing (seller view).
     */
    getSubscribers(listingId: string): MarketplaceSubscription[] {
        const rows = this.db.query(
            'SELECT * FROM marketplace_subscriptions WHERE listing_id = ? ORDER BY created_at DESC',
        ).all(listingId) as SubscriptionRecord[];

        return rows.map(recordToSubscription);
    }

    // ─── Private ─────────────────────────────────────────────────────────

    private chargeRenewal(row: SubscriptionRecord): boolean {
        const newPeriodStart = row.current_period_end;
        const newPeriodEnd = computePeriodEnd(newPeriodStart, row.billing_cycle as BillingCycle);

        return this.db.transaction(() => {
            // Attempt debit
            const updated = this.db.query(`
                UPDATE credit_ledger
                SET credits = credits - ?,
                    total_consumed = total_consumed + ?,
                    updated_at = datetime('now')
                WHERE wallet_address = ? AND (credits - reserved) >= ?
            `).run(row.price_credits, row.price_credits, row.subscriber_tenant_id, row.price_credits);

            if (updated.changes === 0) {
                // Insufficient funds — mark past_due
                this.db.query(`
                    UPDATE marketplace_subscriptions
                    SET status = 'past_due'
                    WHERE id = ?
                `).run(row.id);

                log.warn('Subscription renewal failed: insufficient credits', {
                    id: row.id,
                    subscriber: row.subscriber_tenant_id,
                    required: row.price_credits,
                });
                return false;
            }

            // Record subscriber debit
            const subBalance = getBalance(this.db, row.subscriber_tenant_id);
            this.db.query(`
                INSERT INTO credit_transactions
                    (wallet_address, type, amount, balance_after, reference)
                VALUES (?, 'deduction', ?, ?, ?)
            `).run(row.subscriber_tenant_id, row.price_credits, subBalance.credits, `subscription_renewal:${row.id}`);

            // Credit seller
            this.db.query(`
                INSERT OR IGNORE INTO credit_ledger
                    (wallet_address, credits, reserved, total_purchased, total_consumed)
                VALUES (?, 0, 0, 0, 0)
            `).run(row.seller_tenant_id);

            this.db.query(`
                UPDATE credit_ledger
                SET credits = credits + ?,
                    updated_at = datetime('now')
                WHERE wallet_address = ?
            `).run(row.price_credits, row.seller_tenant_id);

            const sellerBalance = getBalance(this.db, row.seller_tenant_id);
            this.db.query(`
                INSERT INTO credit_transactions
                    (wallet_address, type, amount, balance_after, reference)
                VALUES (?, 'grant', ?, ?, ?)
            `).run(row.seller_tenant_id, row.price_credits, sellerBalance.credits, `subscription_revenue:${row.id}`);

            // Advance the subscription period
            this.db.query(`
                UPDATE marketplace_subscriptions
                SET current_period_start = ?, current_period_end = ?, status = 'active'
                WHERE id = ?
            `).run(newPeriodStart, newPeriodEnd, row.id);

            return true;
        })();
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computePeriodEnd(startIso: string, cycle: BillingCycle): string {
    const date = new Date(startIso.replace(' ', 'T') + 'Z');

    switch (cycle) {
        case 'daily':
            date.setUTCDate(date.getUTCDate() + 1);
            break;
        case 'weekly':
            date.setUTCDate(date.getUTCDate() + 7);
            break;
        case 'monthly':
            date.setUTCMonth(date.getUTCMonth() + 1);
            break;
    }

    return date.toISOString().replace('T', ' ').slice(0, 19);
}

function recordToSubscription(row: SubscriptionRecord): MarketplaceSubscription {
    return {
        id: row.id,
        listingId: row.listing_id,
        subscriberTenantId: row.subscriber_tenant_id,
        sellerTenantId: row.seller_tenant_id,
        priceCredits: row.price_credits,
        billingCycle: row.billing_cycle as BillingCycle,
        status: row.status as SubscriptionStatus,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        cancelledAt: row.cancelled_at,
        createdAt: row.created_at,
    };
}

export { GRACE_PERIOD_HOURS };
