/**
 * Migration 053: Per-agent spending caps, persistent rate limits,
 * identity verification tiers, and marketplace escrow.
 *
 * NOTE: File-based migrations must use version numbers > 52 because
 * the legacy inline migration system (server/db/schema.ts) occupies
 * versions 1–52.
 *
 * This migration mirrors ALL of inline migration 53 in schema.ts.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    // ─── Per-agent spending caps ──────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_spending_caps (
            agent_id              TEXT PRIMARY KEY,
            daily_limit_microalgos INTEGER NOT NULL DEFAULT 5000000,
            daily_limit_usdc      INTEGER NOT NULL DEFAULT 0,
            created_at            TEXT DEFAULT (datetime('now')),
            updated_at            TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_daily_spending (
            agent_id   TEXT    NOT NULL,
            date       TEXT    NOT NULL,
            algo_micro INTEGER NOT NULL DEFAULT 0,
            usdc_micro INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (agent_id, date),
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_daily_spending_date ON agent_daily_spending(date)`);

    // ─── Persistent rate limits ───────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS rate_limit_state (
            key           TEXT    NOT NULL,
            bucket        TEXT    NOT NULL,
            window_start  INTEGER NOT NULL,
            request_count INTEGER NOT NULL DEFAULT 1,
            updated_at    TEXT    DEFAULT (datetime('now')),
            PRIMARY KEY (key, bucket, window_start)
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_state(window_start)`);

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
    db.exec('DROP TABLE IF EXISTS rate_limit_state');
    db.exec('DROP TABLE IF EXISTS agent_daily_spending');
    db.exec('DROP TABLE IF EXISTS agent_spending_caps');
}
