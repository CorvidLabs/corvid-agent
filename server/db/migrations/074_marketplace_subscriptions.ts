/**
 * Migration 074: Add marketplace_subscriptions table for recurring billing.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            subscriber_tenant_id TEXT NOT NULL,
            seller_tenant_id TEXT NOT NULL,
            price_credits INTEGER NOT NULL,
            billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('daily', 'weekly', 'monthly')),
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
            current_period_start TEXT NOT NULL,
            current_period_end TEXT NOT NULL,
            cancelled_at TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_listing ON marketplace_subscriptions(listing_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_subscriber ON marketplace_subscriptions(subscriber_tenant_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_seller ON marketplace_subscriptions(seller_tenant_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_status ON marketplace_subscriptions(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_period_end ON marketplace_subscriptions(current_period_end)');
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS marketplace_subscriptions');
}
