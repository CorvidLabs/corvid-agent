import type { Database } from 'bun:sqlite';

/**
 * Migration 107: Add server_restart_initiated_at flag to sessions.
 *
 * Tracks when a server restart was initiated from a session via the
 * corvid_restart_server tool. This supports restart-loop prevention
 * (issue #1570) by allowing the session to know whether a restart
 * occurred when resuming.
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
