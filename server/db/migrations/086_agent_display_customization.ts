import { Database } from 'bun:sqlite';

/**
 * Migration 086: Add display customization fields to agents.
 *
 * Enables users to set a custom color, icon, and avatar URL for agents
 * instead of relying on hash-generated colors.
 *
 * - display_color: Hex color string (e.g., '#ff00aa') for the agent's accent color
 * - display_icon: Short emoji or icon identifier (e.g., a single emoji character)
 * - avatar_url: URL to a custom avatar image
 * - disabled: Whether the agent is disabled (0 = active, 1 = disabled)
 */

function columnExists(db: Database, table: string, column: string): boolean {
    const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
    if (!columnExists(db, 'agents', 'display_color')) {
        db.exec(`ALTER TABLE agents ADD COLUMN display_color TEXT DEFAULT NULL`);
    }
    if (!columnExists(db, 'agents', 'display_icon')) {
        db.exec(`ALTER TABLE agents ADD COLUMN display_icon TEXT DEFAULT NULL`);
    }
    if (!columnExists(db, 'agents', 'avatar_url')) {
        db.exec(`ALTER TABLE agents ADD COLUMN avatar_url TEXT DEFAULT NULL`);
    }
    if (!columnExists(db, 'agents', 'disabled')) {
        db.exec(`ALTER TABLE agents ADD COLUMN disabled INTEGER DEFAULT 0`);
    }
}

export function down(db: Database): void {
    // Best-effort rollback — columns are nullable so leaving them is safe
    db.exec(`
        CREATE TABLE IF NOT EXISTS agents_backup AS SELECT
            id, name, description, system_prompt, append_prompt, model, provider,
            allowed_tools, disallowed_tools, permission_mode, max_budget_usd,
            algochat_enabled, algochat_auto, custom_flags, default_project_id,
            mcp_tool_permissions, voice_enabled, voice_preset, wallet_address,
            wallet_mnemonic_encrypted, wallet_funded_algo, tenant_id, created_at, updated_at
        FROM agents
    `);
    db.exec(`DROP TABLE IF EXISTS agents`);
    db.exec(`
        CREATE TABLE agents (
            id                        TEXT PRIMARY KEY,
            name                      TEXT NOT NULL,
            description               TEXT DEFAULT '',
            system_prompt             TEXT DEFAULT '',
            append_prompt             TEXT DEFAULT '',
            model                     TEXT DEFAULT '',
            provider                  TEXT DEFAULT '',
            allowed_tools             TEXT DEFAULT '',
            disallowed_tools          TEXT DEFAULT '',
            permission_mode           TEXT DEFAULT 'default',
            max_budget_usd            REAL DEFAULT NULL,
            algochat_enabled          INTEGER DEFAULT 1,
            algochat_auto             INTEGER DEFAULT 1,
            custom_flags              TEXT DEFAULT '{}',
            wallet_address            TEXT DEFAULT NULL,
            wallet_mnemonic_encrypted TEXT DEFAULT NULL,
            wallet_funded_algo        REAL DEFAULT 0,
            default_project_id        TEXT DEFAULT NULL,
            mcp_tool_permissions      TEXT DEFAULT NULL,
            voice_enabled             INTEGER DEFAULT 0,
            voice_preset              TEXT DEFAULT 'alloy',
            tenant_id                 TEXT NOT NULL DEFAULT 'default',
            created_at                TEXT DEFAULT (datetime('now')),
            updated_at                TEXT DEFAULT (datetime('now'))
        )
    `);
    db.exec(`INSERT INTO agents SELECT * FROM agents_backup`);
    db.exec(`DROP TABLE IF EXISTS agents_backup`);
}
