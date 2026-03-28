import { Database } from 'bun:sqlite';

/**
 * Migration 107: Add server_restart_initiated_at flag to sessions.
 *
 * Tracks when a server restart was initiated from a session via the
 * corvid_restart_server tool. On the next startup, buildResumePrompt
 * uses this flag to inject a "restart completed" note into the
 * conversation history, preventing the agent from re-triggering the restart.
 */

function hasColumn(db: Database, table: string, column: string): boolean {
    const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
    if (!hasColumn(db, 'sessions', 'server_restart_initiated_at')) {
        db.exec(`ALTER TABLE sessions ADD COLUMN server_restart_initiated_at TEXT DEFAULT NULL`);
    }
}

export function down(db: Database): void {
    db.exec(`ALTER TABLE sessions DROP COLUMN server_restart_initiated_at`);
}
