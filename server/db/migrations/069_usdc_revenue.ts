/**
 * Migration 069: USDC revenue tracking for agent wallets.
 *
 * Tracks USDC received by agent wallets with full txid audit trail
 * and auto-forwarding status to the owner wallet.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_usdc_revenue (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id       TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            amount_micro   INTEGER NOT NULL,
            from_address   TEXT NOT NULL,
            txid           TEXT NOT NULL UNIQUE,
            forward_txid   TEXT DEFAULT NULL,
            forward_status TEXT NOT NULL DEFAULT 'pending',
            created_at     TEXT DEFAULT (datetime('now'))
        )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_usdc_revenue_agent ON agent_usdc_revenue(agent_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_usdc_revenue_status ON agent_usdc_revenue(forward_status)');
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS agent_usdc_revenue');
}
