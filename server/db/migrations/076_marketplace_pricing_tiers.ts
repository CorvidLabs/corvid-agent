/**
 * Migration 076: Add marketplace_pricing_tiers table for tiered pricing plans.
 *
 * Each listing can have 1-5 pricing tiers with different rates, billing cycles,
 * and rate limits. Supports both per-use (one_time) and subscription billing.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_pricing_tiers (
            id              TEXT PRIMARY KEY,
            listing_id      TEXT NOT NULL,
            name            TEXT NOT NULL,
            description     TEXT NOT NULL DEFAULT '',
            price_credits   INTEGER NOT NULL DEFAULT 0,
            billing_cycle   TEXT NOT NULL DEFAULT 'one_time' CHECK (billing_cycle IN ('one_time', 'daily', 'weekly', 'monthly')),
            rate_limit      INTEGER NOT NULL DEFAULT 0,
            features        TEXT NOT NULL DEFAULT '[]',
            sort_order      INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_pricing_tiers_listing ON marketplace_pricing_tiers(listing_id)');
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS marketplace_pricing_tiers');
}
