/**
 * Migration 057: Schedule trigger events.
 *
 * Adds trigger_events column to agent_schedules to support
 * event-based schedule triggers (GitHub webhooks, polling events).
 */

import { Database } from 'bun:sqlite';

const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

function hasColumn(db: Database, table: string, column: string): boolean {
    if (!SAFE_SQL_IDENTIFIER.test(table)) {
        throw new Error(`hasColumn: invalid table name '${table}'`);
    }
    const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return cols.some((c) => c.name === column);
}

function safeAlter(db: Database, sql: string): void {
    const match = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
    if (match && hasColumn(db, match[1], match[2])) return;
    db.exec(sql);
}

export function up(db: Database): void {
    safeAlter(db, `ALTER TABLE agent_schedules ADD COLUMN trigger_events TEXT DEFAULT NULL`);
}

export function down(_db: Database): void {
    // SQLite doesn't support DROP COLUMN before 3.35.0;
    // column is left in place (harmless with DEFAULT NULL).
}
