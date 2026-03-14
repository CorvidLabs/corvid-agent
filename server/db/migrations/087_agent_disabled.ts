import { Database } from 'bun:sqlite';

/**
 * Migration 087: Add disabled flag to agents.
 *
 * When disabled=1, the agent is excluded from:
 * - Agent directory listings (corvid_list_agents)
 * - Internal agent-to-agent messaging targets (corvid_send_message)
 * - AlgoChat auto-response
 * - Council participation
 *
 * The agent record is preserved for history/audit but is effectively offline.
 */

function hasColumn(db: Database, table: string, column: string): boolean {
    const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
    if (!hasColumn(db, 'agents', 'disabled')) {
        db.exec(`ALTER TABLE agents ADD COLUMN disabled INTEGER DEFAULT 0`);
    }
}

export function down(_db: Database): void {
    // SQLite doesn't support DROP COLUMN in older versions, but this column
    // is safe to leave — it defaults to 0 (not disabled).
}
