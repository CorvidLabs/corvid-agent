import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
    const cols = db.query('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;

    if (!cols.some((c) => c.name === 'conversation_summary')) {
        db.exec('ALTER TABLE sessions ADD COLUMN conversation_summary TEXT DEFAULT NULL');
    }
}

export function down(db: Database): void {
    const cols = db.query('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === 'conversation_summary')) {
        db.exec('ALTER TABLE sessions DROP COLUMN conversation_summary');
    }
}
