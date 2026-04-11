import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  // Channel-project affinity: tracks which project was last used in each Discord channel.
  // Prevents context bleed when a user talks about project A but gets project B's agent.
  db.run(`CREATE TABLE IF NOT EXISTS discord_channel_project (
    channel_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
}

export function down(db: Database): void {
  db.run(`DROP TABLE IF EXISTS discord_channel_project`);
}
