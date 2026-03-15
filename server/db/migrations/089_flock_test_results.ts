import { Database } from 'bun:sqlite';

/**
 * Migration 089: Add tables for Flock Directory automated agent testing.
 *
 * - flock_test_results: Stores per-agent test suite outcomes (overall score, categories, timing)
 * - flock_test_challenge_results: Individual challenge results within a test suite
 */

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS flock_test_results (
            id              TEXT PRIMARY KEY,
            agent_id        TEXT NOT NULL,
            overall_score   INTEGER NOT NULL DEFAULT 0,
            category_scores TEXT NOT NULL DEFAULT '{}',
            challenge_count INTEGER NOT NULL DEFAULT 0,
            responded_count INTEGER NOT NULL DEFAULT 0,
            duration_ms     INTEGER NOT NULL DEFAULT 0,
            started_at      TEXT NOT NULL,
            completed_at    TEXT NOT NULL,
            created_at      TEXT DEFAULT (datetime('now'))
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS flock_test_challenge_results (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            test_result_id   TEXT NOT NULL REFERENCES flock_test_results(id) ON DELETE CASCADE,
            challenge_id     TEXT NOT NULL,
            category         TEXT NOT NULL,
            score            INTEGER NOT NULL DEFAULT 0,
            responded        INTEGER NOT NULL DEFAULT 0,
            response_time_ms INTEGER DEFAULT NULL,
            response         TEXT DEFAULT NULL,
            reason           TEXT DEFAULT NULL,
            weight           INTEGER NOT NULL DEFAULT 1
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_flock_test_results_agent ON flock_test_results(agent_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_flock_test_results_completed ON flock_test_results(completed_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_flock_test_challenge_results_test ON flock_test_challenge_results(test_result_id)`);
}

export function down(db: Database): void {
    db.exec(`DROP TABLE IF EXISTS flock_test_challenge_results`);
    db.exec(`DROP TABLE IF EXISTS flock_test_results`);
}
