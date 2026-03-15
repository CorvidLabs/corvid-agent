import { Database } from 'bun:sqlite';

/**
 * Migration 088: Add missing display customization columns.
 *
 * Migration 086 included these columns but was partially skipped because the
 * `disabled` column it also added already existed (added inline by schema.ts).
 * The version counter advanced past 086, leaving display_color, display_icon,
 * and avatar_url missing. This fixup adds them idempotently.
 */

function columnExists(db: Database, table: string, column: string): boolean {
    const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
    if (!columnExists(db, 'agents', 'display_color')) {
        db.exec(`ALTER TABLE agents ADD COLUMN display_color TEXT DEFAULT NULL`);
    }
    if (!columnExists(db, 'agents', 'display_icon')) {
        db.exec(`ALTER TABLE agents ADD COLUMN display_icon TEXT DEFAULT NULL`);
    }
    if (!columnExists(db, 'agents', 'avatar_url')) {
        db.exec(`ALTER TABLE agents ADD COLUMN avatar_url TEXT DEFAULT NULL`);
    }
}

export function down(_db: Database): void {
    // Columns are nullable — safe to leave in place
}
