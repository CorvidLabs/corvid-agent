/**
 * Migration 066: Formalize dedup_state table.
 *
 * Moves the dedup_state table from inline CREATE TABLE IF NOT EXISTS
 * (in DedupService.ensureTable) into the numbered migration system.
 * Adds indexes on expires_at for efficient TTL cleanup.
 *
 * Closes #587.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS dedup_state (
            namespace  TEXT NOT NULL,
            key        TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            PRIMARY KEY (namespace, key)
        )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_dedup_state_expires ON dedup_state(expires_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_dedup_state_ns_expires ON dedup_state(namespace, expires_at)');
}

export function down(db: Database): void {
    db.exec('DROP INDEX IF EXISTS idx_dedup_state_ns_expires');
    db.exec('DROP INDEX IF EXISTS idx_dedup_state_expires');
    db.exec('DROP TABLE IF EXISTS dedup_state');
}
