/**
 * Migration 078: Add marketplace_usage_events table for usage metering.
 *
 * Records every listing invocation with buyer, tier, and credits charged.
 * Enables per-listing analytics: usage over time, revenue, unique users.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_usage_events (
            id                TEXT PRIMARY KEY,
            listing_id        TEXT NOT NULL,
            user_tenant_id    TEXT NOT NULL,
            tier_id           TEXT DEFAULT NULL,
            credits_charged   INTEGER NOT NULL DEFAULT 0,
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    db.exec('CREATE INDEX IF NOT EXISTS idx_mue_listing ON marketplace_usage_events(listing_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_mue_user ON marketplace_usage_events(user_tenant_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_mue_created ON marketplace_usage_events(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_mue_listing_created ON marketplace_usage_events(listing_id, created_at)');
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS marketplace_usage_events');
}
