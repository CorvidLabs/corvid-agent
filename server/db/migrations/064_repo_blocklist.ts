/**
 * Migration 064: Repo blocklist table.
 *
 * Prevents the agent from contributing to repos that don't want its help.
 * Entries can be manual, from PR rejection analysis, or from daily review.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS repo_blocklist (
            repo       TEXT NOT NULL,
            reason     TEXT DEFAULT '',
            source     TEXT NOT NULL DEFAULT 'manual',
            pr_url     TEXT DEFAULT '',
            tenant_id  TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (repo, tenant_id)
        )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_repo_blocklist_tenant ON repo_blocklist(tenant_id)');
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS repo_blocklist');
}
