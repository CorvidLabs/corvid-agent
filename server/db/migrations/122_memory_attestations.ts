import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_attestations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_key   TEXT NOT NULL,
      agent_id     TEXT NOT NULL,
      hash         TEXT NOT NULL,
      payload      TEXT NOT NULL,
      txid         TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      published_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_attestations_agent_id ON memory_attestations(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_attestations_key ON memory_attestations(memory_key)`);
}

export function down(db: Database): void {
  db.exec('DROP TABLE IF EXISTS memory_attestations');
}
