import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_summaries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      period       TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end   TEXT NOT NULL,
      payload      TEXT NOT NULL,
      hash         TEXT NOT NULL,
      txid         TEXT,
      published_at TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_summaries_period ON activity_summaries(period)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_summaries_hash ON activity_summaries(hash)`);
}

export function down(db: Database): void {
  db.exec('DROP TABLE IF EXISTS activity_summaries');
}
