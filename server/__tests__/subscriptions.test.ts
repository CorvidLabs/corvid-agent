/**
 * Tests for marketplace/subscriptions.ts — subscription billing lifecycle:
 * subscribe, cancel, renewal, past_due, expiry, and access checks.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { SubscriptionService, GRACE_PERIOD_HOURS } from '../marketplace/subscriptions';
import { grantCredits, getBalance } from '../db/credits';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;
let svc: SubscriptionService;

const SUBSCRIBER = 'subscriber-tenant';
const SELLER = 'seller-tenant';
const LISTING = 'listing-1';

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);
    return d;
}

function fundSubscriber(credits: number): void {
    grantCredits(db, SUBSCRIBER, credits, 'test_setup');
}

// ─── Subscribe ──────────────────────────────────────────────────────────────

describe('SubscriptionService.subscribe', () => {
    beforeEach(() => {
        db = setupDb();
        svc = new SubscriptionService(db);
    });

    test('creates subscription and charges first period', () => {
        fundSubscriber(1000);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 100, 'monthly');

        expect(sub).not.toBeNull();
        expect(sub!.listingId).toBe(LISTING);
        expect(sub!.subscriberTenantId).toBe(SUBSCRIBER);
        expect(sub!.sellerTenantId).toBe(SELLER);
        expect(sub!.priceCredits).toBe(100);
        expect(sub!.billingCycle).toBe('monthly');
        expect(sub!.status).toBe('active');
        expect(sub!.cancelledAt).toBeNull();

        // Subscriber debited
        const subBal = getBalance(db, SUBSCRIBER);
        expect(subBal.credits).toBe(900);

        // Seller credited
        const sellerBal = getBalance(db, SELLER);
        expect(sellerBal.credits).toBe(100);
    });

    test('returns null when subscriber has insufficient credits', () => {
        fundSubscriber(50);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 100, 'monthly');
        expect(sub).toBeNull();

        // Balance unchanged
        const bal = getBalance(db, SUBSCRIBER);
        expect(bal.credits).toBe(50);
    });

    test('creates daily subscription with correct period end', () => {
        fundSubscriber(100);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 10, 'daily');
        expect(sub).not.toBeNull();

        const start = new Date(sub!.currentPeriodStart.replace(' ', 'T') + 'Z');
        const end = new Date(sub!.currentPeriodEnd.replace(' ', 'T') + 'Z');
        const diffMs = end.getTime() - start.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        expect(diffDays).toBeCloseTo(1, 0);
    });

    test('creates weekly subscription with correct period end', () => {
        fundSubscriber(100);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 10, 'weekly');
        expect(sub).not.toBeNull();

        const start = new Date(sub!.currentPeriodStart.replace(' ', 'T') + 'Z');
        const end = new Date(sub!.currentPeriodEnd.replace(' ', 'T') + 'Z');
        const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        expect(diffDays).toBeCloseTo(7, 0);
    });

    test('records credit transactions for both subscriber and seller', () => {
        fundSubscriber(500);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'monthly');
        expect(sub).not.toBeNull();

        // Subscriber deduction transaction
        const subTxns = db.query(
            "SELECT * FROM credit_transactions WHERE wallet_address = ? AND type = 'deduction'",
        ).all(SUBSCRIBER) as { amount: number; reference: string }[];
        expect(subTxns.length).toBe(1);
        expect(subTxns[0].amount).toBe(50);

        // Seller grant transaction
        const sellerTxns = db.query(
            "SELECT * FROM credit_transactions WHERE wallet_address = ? AND type = 'grant'",
        ).all(SELLER) as { amount: number; reference: string }[];
        expect(sellerTxns.length).toBe(1);
        expect(sellerTxns[0].amount).toBe(50);
    });

    test('records audit entry on subscribe', () => {
        fundSubscriber(500);
        svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'monthly');

        const audits = db.query(
            "SELECT * FROM audit_log WHERE action = 'credit_deduction' AND actor = ?",
        ).all(SUBSCRIBER) as { detail: string }[];
        expect(audits.length).toBe(1);
        expect(audits[0].detail).toContain('Subscription created');
    });
});

// ─── Cancel ─────────────────────────────────────────────────────────────────

describe('SubscriptionService.cancel', () => {
    beforeEach(() => {
        db = setupDb();
        svc = new SubscriptionService(db);
    });

    test('sets status to cancelled with cancelledAt timestamp', () => {
        fundSubscriber(500);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'monthly')!;
        const cancelled = svc.cancel(sub.id, SUBSCRIBER);

        expect(cancelled).not.toBeNull();
        expect(cancelled!.status).toBe('cancelled');
        expect(cancelled!.cancelledAt).not.toBeNull();
    });

    test('returns null for non-existent subscription', () => {
        expect(svc.cancel('nonexistent', SUBSCRIBER)).toBeNull();
    });

    test('returns null when wrong tenant tries to cancel', () => {
        fundSubscriber(500);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'monthly')!;
        expect(svc.cancel(sub.id, 'wrong-tenant')).toBeNull();
    });

    test('returns null when cancelling already expired subscription', () => {
        fundSubscriber(500);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'monthly')!;

        // Force expire
        db.query("UPDATE marketplace_subscriptions SET status = 'expired' WHERE id = ?").run(sub.id);
        expect(svc.cancel(sub.id, SUBSCRIBER)).toBeNull();
    });
});

// ─── hasActiveSubscription ──────────────────────────────────────────────────

describe('SubscriptionService.hasActiveSubscription', () => {
    beforeEach(() => {
        db = setupDb();
        svc = new SubscriptionService(db);
    });

    test('returns true for active subscription within period', () => {
        fundSubscriber(500);
        svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'monthly');
        expect(svc.hasActiveSubscription(LISTING, SUBSCRIBER)).toBe(true);
    });

    test('returns true for cancelled subscription still within period', () => {
        fundSubscriber(500);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'monthly')!;
        svc.cancel(sub.id, SUBSCRIBER);
        // Still within current period
        expect(svc.hasActiveSubscription(LISTING, SUBSCRIBER)).toBe(true);
    });

    test('returns false when no subscription exists', () => {
        expect(svc.hasActiveSubscription(LISTING, SUBSCRIBER)).toBe(false);
    });

    test('returns false for expired subscription', () => {
        fundSubscriber(500);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'monthly')!;
        db.query("UPDATE marketplace_subscriptions SET status = 'expired' WHERE id = ?").run(sub.id);
        expect(svc.hasActiveSubscription(LISTING, SUBSCRIBER)).toBe(false);
    });
});

// ─── processRenewals ────────────────────────────────────────────────────────

describe('SubscriptionService.processRenewals', () => {
    beforeEach(() => {
        db = setupDb();
        svc = new SubscriptionService(db);
    });

    test('returns zeros when nothing is due', () => {
        fundSubscriber(500);
        svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'monthly');
        const result = svc.processRenewals();
        expect(result).toEqual({ renewed: 0, pastDue: 0, expired: 0 });
    });

    test('renews active subscription whose period has ended', () => {
        fundSubscriber(1000);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'daily')!;

        // Backdate period to past
        db.query(`
            UPDATE marketplace_subscriptions
            SET current_period_start = datetime('now', '-2 days'),
                current_period_end = datetime('now', '-1 day')
            WHERE id = ?
        `).run(sub.id);

        const result = svc.processRenewals();
        expect(result.renewed).toBe(1);
        expect(result.pastDue).toBe(0);

        // Subscriber debited again
        const bal = getBalance(db, SUBSCRIBER);
        expect(bal.credits).toBe(900); // 1000 - 50 (subscribe) - 50 (renewal)

        // Period advanced
        const renewed = svc.getSubscription(sub.id)!;
        expect(renewed.status).toBe('active');
    });

    test('marks subscription past_due when insufficient credits for renewal', () => {
        fundSubscriber(50); // Just enough for first period
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'daily')!;

        // Backdate period
        db.query(`
            UPDATE marketplace_subscriptions
            SET current_period_start = datetime('now', '-2 days'),
                current_period_end = datetime('now', '-1 day')
            WHERE id = ?
        `).run(sub.id);

        const result = svc.processRenewals();
        expect(result.pastDue).toBe(1);
        expect(result.renewed).toBe(0);

        const updated = svc.getSubscription(sub.id)!;
        expect(updated.status).toBe('past_due');
    });

    test('expires cancelled subscriptions past their period end', () => {
        fundSubscriber(500);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'daily')!;
        svc.cancel(sub.id, SUBSCRIBER);

        // Backdate to past period end
        db.query(`
            UPDATE marketplace_subscriptions
            SET current_period_start = datetime('now', '-2 days'),
                current_period_end = datetime('now', '-1 day')
            WHERE id = ?
        `).run(sub.id);

        const result = svc.processRenewals();
        expect(result.expired).toBe(1);

        const expired = svc.getSubscription(sub.id)!;
        expect(expired.status).toBe('expired');
    });

    test('expires past_due subscriptions after grace period', () => {
        fundSubscriber(50);
        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'daily')!;

        // Set to past_due and backdate beyond grace period
        db.query(`
            UPDATE marketplace_subscriptions
            SET status = 'past_due',
                current_period_start = datetime('now', '-4 days'),
                current_period_end = datetime('now', '-3 days')
            WHERE id = ?
        `).run(sub.id);

        const result = svc.processRenewals();
        expect(result.expired).toBe(1);

        const expired = svc.getSubscription(sub.id)!;
        expect(expired.status).toBe('expired');
    });
});

// ─── Query Methods ──────────────────────────────────────────────────────────

describe('SubscriptionService queries', () => {
    beforeEach(() => {
        db = setupDb();
        svc = new SubscriptionService(db);
    });

    test('getSubscription returns null for non-existent', () => {
        expect(svc.getSubscription('nonexistent')).toBeNull();
    });

    test('getBySubscriber returns all subscriptions for tenant', () => {
        fundSubscriber(1000);
        svc.subscribe('listing-a', SUBSCRIBER, SELLER, 10, 'daily');
        svc.subscribe('listing-b', SUBSCRIBER, SELLER, 20, 'weekly');

        const subs = svc.getBySubscriber(SUBSCRIBER);
        expect(subs.length).toBe(2);
    });

    test('getBySubscriber filters by status', () => {
        fundSubscriber(1000);
        const sub = svc.subscribe('listing-a', SUBSCRIBER, SELLER, 10, 'daily')!;
        svc.subscribe('listing-b', SUBSCRIBER, SELLER, 20, 'weekly');
        svc.cancel(sub.id, SUBSCRIBER);

        const active = svc.getBySubscriber(SUBSCRIBER, 'active');
        expect(active.length).toBe(1);

        const cancelled = svc.getBySubscriber(SUBSCRIBER, 'cancelled');
        expect(cancelled.length).toBe(1);
    });

    test('getSubscribers returns subscriptions for a listing', () => {
        fundSubscriber(1000);
        grantCredits(db, 'tenant-2', 500, 'test');
        svc.subscribe(LISTING, SUBSCRIBER, SELLER, 10, 'daily');
        svc.subscribe(LISTING, 'tenant-2', SELLER, 10, 'daily');

        const subs = svc.getSubscribers(LISTING);
        expect(subs.length).toBe(2);
    });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('SubscriptionService edge cases', () => {
    beforeEach(() => {
        db = setupDb();
        svc = new SubscriptionService(db);
    });

    test('GRACE_PERIOD_HOURS is 48', () => {
        expect(GRACE_PERIOD_HOURS).toBe(48);
    });

    test('seller gets ledger created on first subscription revenue', () => {
        fundSubscriber(500);
        // Seller has no ledger entry yet
        const beforeBal = getBalance(db, SELLER);
        expect(beforeBal.credits).toBe(0);

        svc.subscribe(LISTING, SUBSCRIBER, SELLER, 50, 'monthly');

        const afterBal = getBalance(db, SELLER);
        expect(afterBal.credits).toBe(50);
    });

    test('subscribe with zero price succeeds even without credits', () => {
        // Subscriber has no credits but price is 0, so the UPDATE WHERE credits >= 0 should match
        // We need subscriber in credit_ledger first
        grantCredits(db, SUBSCRIBER, 1, 'init');
        // Now set credits to 0 manually
        db.query("UPDATE credit_ledger SET credits = 0 WHERE wallet_address = ?").run(SUBSCRIBER);

        const sub = svc.subscribe(LISTING, SUBSCRIBER, SELLER, 0, 'monthly');
        expect(sub).not.toBeNull();
        expect(sub!.priceCredits).toBe(0);
    });
});
