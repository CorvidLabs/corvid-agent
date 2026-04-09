import type { Database } from 'bun:sqlite';

/**
 * Migration 090: Add response_feedback table for user feedback on agent responses.
 *
 * Stores thumbs-up / thumbs-down feedback tied to agents, integrated with
 * the reputation scoring system via `feedback_received` events.
 */

export function up(db: Database): void {
  db.exec(`
        CREATE TABLE IF NOT EXISTS response_feedback (
            id              TEXT PRIMARY KEY,
            agent_id        TEXT NOT NULL,
            session_id      TEXT DEFAULT NULL,
            source          TEXT NOT NULL DEFAULT 'api',
            sentiment       TEXT NOT NULL,
            category        TEXT DEFAULT NULL,
            comment         TEXT DEFAULT NULL,
            submitted_by    TEXT DEFAULT NULL,
            created_at      TEXT DEFAULT (datetime('now'))
        )
    `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_response_feedback_agent ON response_feedback(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_response_feedback_created ON response_feedback(created_at)`);
}

export function down(db: Database): void {
  db.exec(`DROP TABLE IF EXISTS response_feedback`);
}
