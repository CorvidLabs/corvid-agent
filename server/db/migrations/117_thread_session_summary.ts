import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  // Store conversation summary on thread session for durable context carry-over.
  // Survives session deletion — the thread mapping outlives individual sessions.
  db.run(`ALTER TABLE discord_thread_sessions ADD COLUMN last_summary TEXT DEFAULT NULL`);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN before 3.35 — recreate the table without it
  db.run(`CREATE TABLE discord_thread_sessions_backup AS SELECT
    thread_id, session_id, agent_name, agent_model, owner_user_id, topic, project_name,
    display_color, display_icon, avatar_url, creator_perm_level,
    buddy_agent_id, buddy_agent_name, buddy_max_rounds,
    last_activity_at, created_at
    FROM discord_thread_sessions`);
  db.run(`DROP TABLE discord_thread_sessions`);
  db.run(`ALTER TABLE discord_thread_sessions_backup RENAME TO discord_thread_sessions`);
}
