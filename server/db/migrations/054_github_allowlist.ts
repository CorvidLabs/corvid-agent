/**
 * Migration 054: Global GitHub user allowlist.
 *
 * Controls who can trigger agents via GitHub @mentions (polling + webhooks).
 * Empty table = open mode (all users allowed, preserving current behavior).
 * Non-empty = only listed users can trigger agent work.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS github_allowlist (
            username   TEXT PRIMARY KEY,
            label      TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS github_allowlist');
}
