import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  db.run(`ALTER TABLE agent_library ADD COLUMN title TEXT DEFAULT NULL`);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN before 3.35.0; recreate table
  db.run(`CREATE TABLE agent_library_backup AS SELECT
    id, asa_id, key, author_id, author_name, category, tags, content,
    book, page, txid, created_at, updated_at, archived
    FROM agent_library`);
  db.run(`DROP TABLE agent_library`);
  db.run(`ALTER TABLE agent_library_backup RENAME TO agent_library`);
}
