/**
 * Migration 055: Multi-tenant isolation.
 *
 * Adds tenant_id columns to all resource tables for per-tenant data isolation,
 * and creates the tenant_members table for RBAC membership.
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

const TENANT_SCOPED_TABLES = [
    'projects',
    'agents',
    'sessions',
    'session_messages',
    'work_tasks',
    'marketplace_listings',
    'agent_reputation',
    'sandbox_configs',
    'notification_channels',
] as const;

export function up(db: Database): void {
    // Add tenant_id column to all resource tables
    for (const table of TENANT_SCOPED_TABLES) {
        safeAlter(db, `ALTER TABLE ${table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`);
    }

    // Tenant members — RBAC membership for multi-tenant access control
    db.exec(`CREATE TABLE IF NOT EXISTS tenant_members (
        tenant_id  TEXT NOT NULL,
        key_hash   TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT 'viewer',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (tenant_id, key_hash)
    )`);
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS tenant_members');
    // SQLite doesn't support DROP COLUMN before 3.35.0;
    // tenant_id columns are left in place (harmless with DEFAULT 'default').
    for (const table of TENANT_SCOPED_TABLES) {
        db.exec(`DROP INDEX IF EXISTS idx_${table}_tenant`);
    }
}
