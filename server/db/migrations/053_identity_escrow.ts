/**
 * Migration 053: Identity verification tiers and marketplace escrow.
 *
 * NOTE: File-based migrations must use version numbers > 52 because
 * the legacy inline migration system (server/db/schema.ts) occupies
 * versions 1–52.
 *
 * Adds agent_identity table for verification tiers and
 * escrow_transactions table for marketplace escrow flow.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    // ─── Agent Identity Verification ─────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_identity (
            agent_id               TEXT PRIMARY KEY,
            tier                   TEXT NOT NULL DEFAULT 'UNVERIFIED',
            verified_at            TEXT DEFAULT NULL,
            verification_data_hash TEXT DEFAULT NULL,
            updated_at             TEXT DEFAULT (datetime('now'))
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_identity_tier ON agent_identity(tier)`);

    // ─── Marketplace Escrow ──────────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS escrow_transactions (
            id                TEXT PRIMARY KEY,
            listing_id        TEXT NOT NULL,
            buyer_tenant_id   TEXT NOT NULL,
            seller_tenant_id  TEXT NOT NULL,
            amount_credits    INTEGER NOT NULL,
            state             TEXT NOT NULL DEFAULT 'FUNDED',
            created_at        TEXT DEFAULT (datetime('now')),
            delivered_at      TEXT DEFAULT NULL,
            released_at       TEXT DEFAULT NULL,
            disputed_at       TEXT DEFAULT NULL,
            resolved_at       TEXT DEFAULT NULL
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_escrow_state ON escrow_transactions(state)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_escrow_buyer ON escrow_transactions(buyer_tenant_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_escrow_seller ON escrow_transactions(seller_tenant_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_escrow_listing ON escrow_transactions(listing_id)`);
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS escrow_transactions');
    db.exec('DROP TABLE IF EXISTS agent_identity');
}
