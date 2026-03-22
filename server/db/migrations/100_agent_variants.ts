import { Database } from 'bun:sqlite';

/**
 * Migration 100: Agent variant profiles — preset skill + persona combinations.
 *
 * - Creates `agent_variants` table (reusable variant templates)
 * - Creates `agent_variant_assignments` table (1:1 agent → variant)
 *
 * Depends on: migration 099 (composable personas)
 */

function tableExists(db: Database, name: string): boolean {
    const row = db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name) as { name: string } | null;
    return !!row;
}

export function up(db: Database): void {
    if (!tableExists(db, 'agent_variants')) {
        db.exec(`
            CREATE TABLE agent_variants (
                id               TEXT PRIMARY KEY,
                name             TEXT UNIQUE NOT NULL,
                description      TEXT DEFAULT '',
                skill_bundle_ids TEXT NOT NULL DEFAULT '[]',
                persona_ids      TEXT NOT NULL DEFAULT '[]',
                preset           INTEGER NOT NULL DEFAULT 0,
                created_at       TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
            )
        `);
    }

    if (!tableExists(db, 'agent_variant_assignments')) {
        db.exec(`
            CREATE TABLE agent_variant_assignments (
                agent_id   TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
                variant_id TEXT NOT NULL REFERENCES agent_variants(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_variant_assignments_variant ON agent_variant_assignments(variant_id)`);
    }
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS agent_variant_assignments');
    db.exec('DROP TABLE IF EXISTS agent_variants');
}
