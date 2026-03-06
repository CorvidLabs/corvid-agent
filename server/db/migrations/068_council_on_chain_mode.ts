/**
 * Migration 068: Council on-chain communication mode.
 *
 * Adds configurable on-chain mode per council (off/attestation/full)
 * and synthesis_txid tracking for council launches.
 */

import { Database } from 'bun:sqlite';

function safeAlter(db: Database, sql: string): void {
    try { db.exec(sql); } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('duplicate column')) return;
        throw e;
    }
}

export function up(db: Database): void {
    safeAlter(db, `ALTER TABLE councils ADD COLUMN on_chain_mode TEXT NOT NULL DEFAULT 'full'`);
    safeAlter(db, `ALTER TABLE council_launches ADD COLUMN synthesis_txid TEXT DEFAULT NULL`);
}

export function down(_db: Database): void {
    // SQLite doesn't support DROP COLUMN pre-3.35
}
