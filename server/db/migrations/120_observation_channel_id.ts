import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  const columns = db.query(`PRAGMA table_info(memory_observations)`).all() as { name: string }[];
  if (!columns.some((c) => c.name === 'channel_id')) {
    db.exec(`ALTER TABLE memory_observations ADD COLUMN channel_id TEXT`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_channel_id ON memory_observations(channel_id) WHERE channel_id IS NOT NULL`);
}

export function down(db: Database): void {
  db.exec(`DROP INDEX IF EXISTS idx_observations_channel_id`);
}
