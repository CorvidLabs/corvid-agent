import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  // Check if column already exists (idempotent)
  const cols = db.query('PRAGMA table_info(agent_memories)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'asa_id')) {
    db.exec('ALTER TABLE agent_memories ADD COLUMN asa_id INTEGER DEFAULT NULL');
  }

  db.exec(`
        CREATE INDEX IF NOT EXISTS idx_agent_memories_asa
          ON agent_memories(agent_id, asa_id)
          WHERE asa_id IS NOT NULL
    `);
}

export function down(db: Database): void {
  db.exec('DROP INDEX IF EXISTS idx_agent_memories_asa');
  // SQLite ALTER TABLE DROP COLUMN is supported in newer versions
  const cols = db.query('PRAGMA table_info(agent_memories)').all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === 'asa_id')) {
    db.exec('ALTER TABLE agent_memories DROP COLUMN asa_id');
  }
}
