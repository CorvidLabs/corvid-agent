import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
    // Add voting period columns to governance_proposals
    const cols = db.query('PRAGMA table_info(governance_proposals)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'voting_opened_at')) {
        db.run(`ALTER TABLE governance_proposals ADD COLUMN voting_opened_at TEXT DEFAULT NULL`);
    }
    if (!cols.some((c) => c.name === 'voting_deadline')) {
        db.run(`ALTER TABLE governance_proposals ADD COLUMN voting_deadline TEXT DEFAULT NULL`);
    }

    // Create proposal_vetoes table
    db.run(`
        CREATE TABLE IF NOT EXISTS proposal_vetoes (
            id          TEXT PRIMARY KEY,
            proposal_id TEXT NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
            vetoer_id   TEXT NOT NULL,
            reason      TEXT NOT NULL DEFAULT '',
            vetoed_at   TEXT NOT NULL DEFAULT (datetime('now')),
            tenant_id   TEXT NOT NULL DEFAULT 'default',
            UNIQUE(proposal_id, vetoer_id)
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_proposal_vetoes_proposal ON proposal_vetoes(proposal_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_proposal_vetoes_tenant ON proposal_vetoes(tenant_id)`);
}

export function down(db: Database): void {
    db.run(`DROP INDEX IF EXISTS idx_proposal_vetoes_tenant`);
    db.run(`DROP INDEX IF EXISTS idx_proposal_vetoes_proposal`);
    db.run(`DROP TABLE IF EXISTS proposal_vetoes`);

    const cols = db.query('PRAGMA table_info(governance_proposals)').all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === 'voting_deadline')) {
        db.run(`ALTER TABLE governance_proposals DROP COLUMN voting_deadline`);
    }
    if (cols.some((c) => c.name === 'voting_opened_at')) {
        db.run(`ALTER TABLE governance_proposals DROP COLUMN voting_opened_at`);
    }
}
