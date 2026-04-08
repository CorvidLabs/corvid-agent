import type { Database } from 'bun:sqlite';

/**
 * Migration 100: Agent blocklist, variant profiles, and pipeline schedules.
 *
 * Consolidated from three separate migration files that all shared version 100:
 * - agent_blocklist: Kill switch for malicious agents
 * - agent_variants: Preset skill + persona combinations
 * - pipeline_schedules: Pipeline execution support for agent_schedules
 */

function tableExists(db: Database, name: string): boolean {
  const row = db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name) as {
    name: string;
  } | null;
  return !!row;
}

function columnExists(db: Database, table: string, column: string): boolean {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
  // --- Agent blocklist ---
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

  // --- Agent variants ---
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
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_agent_variant_assignments_variant ON agent_variant_assignments(variant_id)`,
    );
  }

  // --- Pipeline schedules ---
  if (!columnExists(db, 'agent_schedules', 'execution_mode')) {
    db.exec(`ALTER TABLE agent_schedules ADD COLUMN execution_mode TEXT DEFAULT 'independent'`);
  }
  if (!columnExists(db, 'agent_schedules', 'pipeline_steps')) {
    db.exec(`ALTER TABLE agent_schedules ADD COLUMN pipeline_steps TEXT DEFAULT NULL`);
  }
}

export function down(db: Database): void {
  // --- Pipeline schedules ---
  if (columnExists(db, 'agent_schedules', 'pipeline_steps')) {
    db.exec(`ALTER TABLE agent_schedules DROP COLUMN pipeline_steps`);
  }
  if (columnExists(db, 'agent_schedules', 'execution_mode')) {
    db.exec(`ALTER TABLE agent_schedules DROP COLUMN execution_mode`);
  }

  // --- Agent variants ---
  db.exec('DROP TABLE IF EXISTS agent_variant_assignments');
  db.exec('DROP TABLE IF EXISTS agent_variants');

  // --- Agent blocklist ---
  db.exec('DROP TABLE IF EXISTS agent_blocklist');
}
