/**
 * Migration 072: Add pids_limit and storage_limit_mb to sandbox_configs.
 *
 * These fields were supported in the ResourceLimits type but not persisted,
 * always falling back to defaults. This migration adds them to the schema
 * so they can be configured per-agent.
 */

import { Database } from 'bun:sqlite';

function safeAlter(db: Database, sql: string): void {
    try { db.exec(sql); } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('duplicate column')) return;
        throw e;
    }
}

export function up(db: Database): void {
    safeAlter(db, `ALTER TABLE sandbox_configs ADD COLUMN pids_limit INTEGER DEFAULT 100`);
    safeAlter(db, `ALTER TABLE sandbox_configs ADD COLUMN storage_limit_mb INTEGER DEFAULT 1024`);
}

export function down(_db: Database): void {
    // SQLite doesn't support DROP COLUMN pre-3.35
}
