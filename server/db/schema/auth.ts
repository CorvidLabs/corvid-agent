/**
 * Schema definitions for the auth domain.
 *
 * Tables: api_keys, audit_log, tenants, tenant_members, github_allowlist
 */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS api_keys (
        key_hash     TEXT PRIMARY KEY,
        tenant_id    TEXT NOT NULL,
        label        TEXT DEFAULT 'default',
        expires_at   TEXT DEFAULT NULL,
        last_used_at TEXT DEFAULT NULL,
        created_at   TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS audit_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp     TEXT NOT NULL DEFAULT (datetime('now')),
        action        TEXT NOT NULL,
        actor         TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id   TEXT,
        detail        TEXT,
        trace_id      TEXT,
        ip_address    TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS github_allowlist (
        username   TEXT PRIMARY KEY,
        label      TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS tenant_members (
        tenant_id  TEXT NOT NULL,
        key_hash   TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT 'viewer',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (tenant_id, key_hash)
    )`,

    `CREATE TABLE IF NOT EXISTS tenants (
        id                      TEXT PRIMARY KEY,
        name                    TEXT NOT NULL,
        slug                    TEXT UNIQUE NOT NULL,
        owner_email             TEXT NOT NULL,
        stripe_customer_id      TEXT DEFAULT NULL,
        plan                    TEXT DEFAULT 'free',
        max_agents              INTEGER DEFAULT 3,
        max_concurrent_sessions INTEGER DEFAULT 2,
        sandbox_enabled         INTEGER DEFAULT 0,
        status                  TEXT DEFAULT 'active',
        created_at              TEXT DEFAULT (datetime('now')),
        updated_at              TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_trace_id ON audit_log(trace_id)`,
];
