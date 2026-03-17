/**
 * Schema definitions for the permissions domain.
 *
 * Tables: permission_checks, permission_grants
 */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS permission_checks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id   TEXT NOT NULL,
        tool_name  TEXT NOT NULL,
        action     TEXT NOT NULL,
        allowed    INTEGER NOT NULL DEFAULT 0,
        grant_id   INTEGER DEFAULT NULL,
        reason     TEXT DEFAULT '',
        check_ms   REAL DEFAULT 0,
        session_id TEXT DEFAULT NULL,
        tenant_id  TEXT NOT NULL DEFAULT 'default',
        checked_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS permission_grants (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id   TEXT NOT NULL,
        action     TEXT NOT NULL,
        granted_by TEXT NOT NULL,
        reason     TEXT DEFAULT '',
        signature  TEXT NOT NULL DEFAULT '',
        expires_at TEXT DEFAULT NULL,
        revoked_at TEXT DEFAULT NULL,
        revoked_by TEXT DEFAULT NULL,
        tenant_id  TEXT NOT NULL DEFAULT 'default',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_perm_checks_agent ON permission_checks(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_perm_checks_tenant ON permission_checks(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_perm_checks_tool ON permission_checks(tool_name)`,
    `CREATE INDEX IF NOT EXISTS idx_perm_grants_action ON permission_grants(action)`,
    `CREATE INDEX IF NOT EXISTS idx_perm_grants_agent ON permission_grants(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_perm_grants_tenant ON permission_grants(tenant_id)`,
];
