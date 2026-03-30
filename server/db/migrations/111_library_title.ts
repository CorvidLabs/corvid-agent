import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  const cols = db.query('PRAGMA table_info(agent_library)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'title')) {
    db.run(`ALTER TABLE agent_library ADD COLUMN title TEXT DEFAULT NULL`);
  }
}

export function down(db: Database): void {
  const cols = db.query('PRAGMA table_info(agent_library)').all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === 'title')) {
    db.run(`ALTER TABLE agent_library DROP COLUMN title`);
  }
}
