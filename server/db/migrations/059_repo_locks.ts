/**
 * Migration 059: Repo locks for schedule coordination.
 *
 * Prevents concurrent schedule executions from working on the same
 * repository simultaneously. Locks auto-expire to prevent deadlocks.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS repo_locks (
            repo         TEXT    NOT NULL PRIMARY KEY,
            execution_id TEXT    NOT NULL,
            schedule_id  TEXT    NOT NULL,
            action_type  TEXT    NOT NULL,
            locked_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            expires_at   TEXT    NOT NULL
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_repo_locks_expires ON repo_locks(expires_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_repo_locks_schedule ON repo_locks(schedule_id)`);
}

export function down(db: Database): void {
    db.exec(`DROP TABLE IF EXISTS repo_locks`);
}
