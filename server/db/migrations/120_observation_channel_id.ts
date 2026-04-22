import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  const columns = db.query('PRAGMA table_info(memory_observations)').all() as { name: string; type: string }[];
  const existing = columns.find((c) => c.name === 'channel_id');
  if (!existing) {
    db.exec(`ALTER TABLE memory_observations ADD COLUMN channel_id TEXT`);
  } else if (existing.type.toUpperCase() !== 'TEXT') {
    console.warn(`[migration 120] channel_id exists with unexpected type "${existing.type}", expected TEXT`);
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_observations_channel_id ON memory_observations(channel_id) WHERE channel_id IS NOT NULL`,
  );
}

export function down(db: Database): void {
  db.exec(`DROP INDEX IF EXISTS idx_observations_channel_id`);
}
