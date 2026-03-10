/**
 * Migration 077: Add nft_holders table for Nevermore NFT bridge.
 *
 * Tracks verified NFT holders and their credit allocations,
 * enabling Nevermore NFT holders to receive free credits.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS nft_holders (
            id              TEXT PRIMARY KEY,
            wallet_address  TEXT NOT NULL,
            asset_id        INTEGER NOT NULL,
            verified_at     TEXT NOT NULL DEFAULT (datetime('now')),
            credits_granted INTEGER NOT NULL DEFAULT 0,
            status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_holders_wallet_asset ON nft_holders(wallet_address, asset_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_nft_holders_status ON nft_holders(status)');
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS nft_holders');
}
