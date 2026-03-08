/**
 * Migration 071: Governance v2 quorum configuration.
 *
 * Adds quorum_type and quorum_threshold columns to councils
 * for weighted voting support.
 */

import { Database } from 'bun:sqlite';

function safeAlter(db: Database, sql: string): void {
    try { db.exec(sql); } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('duplicate column')) return;
        throw e;
    }
}

export function up(db: Database): void {
    safeAlter(db, `ALTER TABLE councils ADD COLUMN quorum_type TEXT DEFAULT 'majority'`);
    safeAlter(db, `ALTER TABLE councils ADD COLUMN quorum_threshold REAL DEFAULT NULL`);
}

export function down(_db: Database): void {
    // SQLite doesn't support DROP COLUMN pre-3.35
}
