/**
 * Migration 072: Governance proposals table.
 *
 * Adds a proposals table for the governance v2 proposal lifecycle:
 *   draft → open → voting → decided → enacted
 *
 * Includes configurable quorum rules (threshold + minimum voters)
 * and ties into existing governance tiers and council votes.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS governance_proposals (
            id TEXT PRIMARY KEY,
            council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            author_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            decision TEXT DEFAULT NULL,
            governance_tier INTEGER NOT NULL DEFAULT 2,
            affected_paths TEXT NOT NULL DEFAULT '[]',
            quorum_threshold REAL DEFAULT NULL,
            minimum_voters INTEGER DEFAULT NULL,
            launch_id TEXT DEFAULT NULL,
            tenant_id TEXT NOT NULL DEFAULT 'default',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            decided_at TEXT DEFAULT NULL,
            enacted_at TEXT DEFAULT NULL
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_governance_proposals_council ON governance_proposals(council_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_governance_proposals_status ON governance_proposals(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_governance_proposals_tenant ON governance_proposals(tenant_id)`);
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS governance_proposals');
}
