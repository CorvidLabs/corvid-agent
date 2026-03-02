/**
 * Migration 062: Tenant resource isolation.
 *
 * Extends multi-tenant support (from migration 055) to resource tables
 * that were created after the initial tenant infrastructure:
 *   councils, council_launches, agent_schedules, schedule_executions,
 *   workflows, workflow_runs, mention_polling_configs, mcp_server_configs,
 *   webhook_registrations.
 *
 * Backfills tenant_id from agent relationship where possible.
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

const TABLES_TO_SCOPE = [
    'councils',
    'council_launches',
    'agent_schedules',
    'schedule_executions',
    'workflows',
    'workflow_runs',
    'mention_polling_configs',
    'mcp_server_configs',
    'webhook_registrations',
] as const;

/** Tables that have an agent_id FK we can backfill from. */
const AGENT_FK_TABLES = [
    'agent_schedules',
    'schedule_executions',
    'workflows',
    'workflow_runs',
    'mention_polling_configs',
    'mcp_server_configs',
    'webhook_registrations',
] as const;

export function up(db: Database): void {
    // 1. Add tenant_id column + index to all tables
    for (const table of TABLES_TO_SCOPE) {
        safeAlter(db, `ALTER TABLE ${table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`);
    }

    // 2. Backfill from agent relationship where agent_id FK exists
    for (const table of AGENT_FK_TABLES) {
        db.exec(`
            UPDATE ${table} SET tenant_id = (
                SELECT a.tenant_id FROM agents a WHERE a.id = ${table}.agent_id
            ) WHERE EXISTS (
                SELECT 1 FROM agents a WHERE a.id = ${table}.agent_id
            ) AND tenant_id = 'default'
        `);
    }

    // 3. Backfill councils from first participating agent (via council_members)
    db.exec(`
        UPDATE councils SET tenant_id = (
            SELECT a.tenant_id FROM council_members cm
            JOIN agents a ON a.id = cm.agent_id
            WHERE cm.council_id = councils.id
            ORDER BY cm.sort_order ASC
            LIMIT 1
        ) WHERE EXISTS (
            SELECT 1 FROM council_members cm
            JOIN agents a ON a.id = cm.agent_id
            WHERE cm.council_id = councils.id
        ) AND tenant_id = 'default'
    `);

    // 4. Backfill council_launches from their council
    db.exec(`
        UPDATE council_launches SET tenant_id = (
            SELECT c.tenant_id FROM councils c WHERE c.id = council_launches.council_id
        ) WHERE EXISTS (
            SELECT 1 FROM councils c WHERE c.id = council_launches.council_id
        ) AND tenant_id = 'default'
    `);
}

export function down(db: Database): void {
    // SQLite doesn't support DROP COLUMN before 3.35.0;
    // tenant_id columns are left in place (harmless with DEFAULT 'default').
    for (const table of TABLES_TO_SCOPE) {
        db.exec(`DROP INDEX IF EXISTS idx_${table}_tenant`);
    }
}
