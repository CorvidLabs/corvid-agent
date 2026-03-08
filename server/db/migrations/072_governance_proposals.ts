/**
 * Migration 072: Governance v2 proposals table.
 *
 * Adds governance_proposals table with lifecycle states:
 *   draft → open → voting → decided → enacted
 *
 * Proposals formalize governance actions with configurable quorum rules,
 * weighted voting based on reputation scores, and minimum voter requirements.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS governance_proposals (
            id                TEXT PRIMARY KEY,
            title             TEXT NOT NULL,
            description       TEXT NOT NULL DEFAULT '',
            author_agent_id   TEXT NOT NULL,
            council_id        TEXT REFERENCES councils(id) ON DELETE SET NULL,
            governance_tier   INTEGER NOT NULL DEFAULT 2,
            affected_paths    TEXT NOT NULL DEFAULT '[]',
            status            TEXT NOT NULL DEFAULT 'draft'
                              CHECK(status IN ('draft', 'open', 'voting', 'decided', 'enacted')),
            decision          TEXT DEFAULT NULL
                              CHECK(decision IS NULL OR decision IN ('approved', 'rejected')),
            quorum_threshold  REAL DEFAULT NULL,
            min_voters        INTEGER DEFAULT NULL,
            vote_start_at     TEXT DEFAULT NULL,
            vote_end_at       TEXT DEFAULT NULL,
            decided_at        TEXT DEFAULT NULL,
            enacted_at        TEXT DEFAULT NULL,
            launch_id         TEXT DEFAULT NULL REFERENCES council_launches(id) ON DELETE SET NULL,
            tenant_id         TEXT NOT NULL DEFAULT 'default',
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_gov_proposals_status ON governance_proposals(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_gov_proposals_council ON governance_proposals(council_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_gov_proposals_author ON governance_proposals(author_agent_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_gov_proposals_tenant ON governance_proposals(tenant_id)');

    // Proposal votes — individual agent votes on a proposal
    db.exec(`
        CREATE TABLE IF NOT EXISTS governance_proposal_votes (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            proposal_id     TEXT NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
            agent_id        TEXT NOT NULL,
            vote            TEXT NOT NULL CHECK(vote IN ('approve', 'reject', 'abstain')),
            weight          REAL NOT NULL DEFAULT 50,
            reason          TEXT NOT NULL DEFAULT '',
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(proposal_id, agent_id)
        )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_gov_proposal_votes_proposal ON governance_proposal_votes(proposal_id)');
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS governance_proposal_votes');
    db.exec('DROP TABLE IF EXISTS governance_proposals');
}
