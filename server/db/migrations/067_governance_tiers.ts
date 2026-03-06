/**
 * Migration 067: Governance tier architecture for council jurisdiction.
 *
 * Three-layer governance model (#590):
 * - Adds vote_type and governance_tier to council_launches
 * - Creates governance_votes table for formal tier-aware voting
 * - Creates governance_member_votes for individual agent votes
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    // Add governance columns to council_launches
    db.exec(`ALTER TABLE council_launches ADD COLUMN vote_type TEXT NOT NULL DEFAULT 'standard'`);
    db.exec(`ALTER TABLE council_launches ADD COLUMN governance_tier INTEGER DEFAULT NULL`);

    // Governance votes — formal vote records for tier-aware decisions
    db.exec(`
        CREATE TABLE IF NOT EXISTS governance_votes (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            launch_id        TEXT NOT NULL REFERENCES council_launches(id) ON DELETE CASCADE,
            governance_tier  INTEGER NOT NULL,
            affected_paths   TEXT NOT NULL DEFAULT '[]',
            status           TEXT NOT NULL DEFAULT 'pending',
            human_approved   INTEGER NOT NULL DEFAULT 0,
            human_approved_by TEXT DEFAULT NULL,
            human_approved_at TEXT DEFAULT NULL,
            tenant_id        TEXT NOT NULL DEFAULT 'default',
            created_at       TEXT NOT NULL DEFAULT (datetime('now')),
            resolved_at      TEXT DEFAULT NULL
        )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_gov_votes_launch ON governance_votes(launch_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_gov_votes_status ON governance_votes(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_gov_votes_tenant ON governance_votes(tenant_id)');

    // Individual member votes within a governance vote
    db.exec(`
        CREATE TABLE IF NOT EXISTS governance_member_votes (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            governance_vote_id  INTEGER NOT NULL REFERENCES governance_votes(id) ON DELETE CASCADE,
            agent_id            TEXT NOT NULL,
            vote                TEXT NOT NULL CHECK(vote IN ('approve', 'reject', 'abstain')),
            reason              TEXT NOT NULL DEFAULT '',
            created_at          TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_gov_member_votes_vote ON governance_member_votes(governance_vote_id)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_member_votes_unique ON governance_member_votes(governance_vote_id, agent_id)');
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS governance_member_votes');
    db.exec('DROP TABLE IF EXISTS governance_votes');
    // SQLite doesn't support DROP COLUMN pre-3.35, but these are safe to leave
}
