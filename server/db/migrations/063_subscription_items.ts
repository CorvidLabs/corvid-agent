/**
 * Migration 063: Add subscription_items table.
 *
 * Links Stripe subscription item IDs to local subscriptions,
 * enabling the UsageMeter to report metered usage to Stripe.
 * Previously, reportAll() failed because this table was missing.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`CREATE TABLE IF NOT EXISTS subscription_items (
        id TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        stripe_item_id TEXT NOT NULL,
        stripe_price_id TEXT DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_subscription_items_sub ON subscription_items(subscription_id)`);
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS subscription_items');
}
