import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS work_task_attestations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL,
    agent_id    TEXT NOT NULL,
    outcome     TEXT NOT NULL CHECK (outcome IN ('completed', 'failed')),
    pr_url      TEXT,
    duration_ms INTEGER,
    hash        TEXT NOT NULL,
    payload     TEXT NOT NULL,
    txid        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    published_at TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_work_task_attestations_task_id ON work_task_attestations(task_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_work_task_attestations_agent_id ON work_task_attestations(agent_id)`);
}

export function down(db: Database): void {
  db.exec(`DROP INDEX IF EXISTS idx_work_task_attestations_agent_id`);
  db.exec(`DROP INDEX IF EXISTS idx_work_task_attestations_task_id`);
  db.exec(`DROP TABLE IF EXISTS work_task_attestations`);
}
