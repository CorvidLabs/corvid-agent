/**
 * Migration 060: PR outcome tracking for feedback loop.
 *
 * Tracks the lifecycle of PRs created by work tasks — whether they
 * were merged, closed, or went stale — so the agent can learn from outcomes.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS pr_outcomes (
            id              TEXT    PRIMARY KEY,
            work_task_id    TEXT    NOT NULL,
            pr_url          TEXT    NOT NULL,
            repo            TEXT    NOT NULL,
            pr_number       INTEGER NOT NULL,
            pr_state        TEXT    NOT NULL DEFAULT 'open',
            failure_reason  TEXT    DEFAULT NULL,
            checked_at      TEXT    DEFAULT NULL,
            resolved_at     TEXT    DEFAULT NULL,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pr_outcomes_state ON pr_outcomes(pr_state)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pr_outcomes_repo ON pr_outcomes(repo)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pr_outcomes_work_task ON pr_outcomes(work_task_id)`);
}

export function down(db: Database): void {
    db.exec(`DROP TABLE IF EXISTS pr_outcomes`);
}
