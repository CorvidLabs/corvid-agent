import { Database } from 'bun:sqlite';

/**
 * Migration 101: Reputation score history — track score snapshots over time.
 *
 * Stores a snapshot each time a reputation score is computed, enabling
 * trend charts and historical analysis in the dashboard.
 */

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS reputation_history');
}

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS reputation_history (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id            TEXT NOT NULL,
            overall_score       INTEGER NOT NULL,
            trust_level         TEXT NOT NULL,
            task_completion     INTEGER NOT NULL DEFAULT 0,
            peer_rating         INTEGER NOT NULL DEFAULT 0,
            credit_pattern      INTEGER NOT NULL DEFAULT 0,
            security_compliance INTEGER NOT NULL DEFAULT 0,
            activity_level      INTEGER NOT NULL DEFAULT 0,
            computed_at         TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_reputation_history_agent ON reputation_history(agent_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_reputation_history_computed ON reputation_history(computed_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_reputation_history_agent_time ON reputation_history(agent_id, computed_at)`);
}
