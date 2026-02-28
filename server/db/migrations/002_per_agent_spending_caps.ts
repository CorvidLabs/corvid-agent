/**
 * Migration 002: Per-agent spending caps.
 *
 * Adds an `agent_spending_caps` table for configurable per-agent daily limits,
 * and extends `daily_spending` with an optional `agent_id` column so we can
 * track spending per-agent in addition to the existing global totals.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    // Per-agent spending caps configuration
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

    // Per-agent daily spending tracking
    // Separate from the global daily_spending table to preserve backward compat.
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
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS agent_daily_spending');
    db.exec('DROP TABLE IF EXISTS agent_spending_caps');
}
