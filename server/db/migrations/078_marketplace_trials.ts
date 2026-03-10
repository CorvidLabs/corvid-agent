/**
 * Migration 078: Add trial support for marketplace listings.
 *
 * Adds trial_uses and trial_days columns to marketplace_listings,
 * and creates the marketplace_trials table for tracking active trials.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec('ALTER TABLE marketplace_listings ADD COLUMN trial_uses INTEGER DEFAULT NULL');
    db.exec('ALTER TABLE marketplace_listings ADD COLUMN trial_days INTEGER DEFAULT NULL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_trials (
            id              TEXT PRIMARY KEY,
            listing_id      TEXT NOT NULL,
            tenant_id       TEXT NOT NULL,
            uses_remaining  INTEGER DEFAULT NULL,
            expires_at      TEXT DEFAULT NULL,
            status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted')),
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_trials_listing ON marketplace_trials(listing_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_marketplace_trials_tenant ON marketplace_trials(tenant_id)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_trials_listing_tenant ON marketplace_trials(listing_id, tenant_id)');
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS marketplace_trials');
}
