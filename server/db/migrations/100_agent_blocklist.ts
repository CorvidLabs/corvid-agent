import type { Database } from 'bun:sqlite';

/**
 * Migration 100: Agent blocklist — kill switch for malicious agents.
 *
 * Creates a table to track blacklisted agents. Used by the reputation
 * kill switch (auto-blacklist on critical security violations or
 * accumulated violations) and the messaging guard (instant reject).
 */

export function down(db: Database): void {
  db.exec('DROP TABLE IF EXISTS agent_blocklist');
}

export function up(db: Database): void {
  db.exec(`
        CREATE TABLE IF NOT EXISTS agent_blocklist (
            agent_id    TEXT PRIMARY KEY,
            reason      TEXT NOT NULL DEFAULT 'manual',
            detail      TEXT DEFAULT '',
            blocked_by  TEXT DEFAULT 'system',
            created_at  TEXT DEFAULT (datetime('now'))
        )
    `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_blocklist_reason ON agent_blocklist(reason)`);
}
