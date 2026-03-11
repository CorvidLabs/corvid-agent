import { Database } from 'bun:sqlite';

function hasColumn(db: Database, table: string, column: string): boolean {
    const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
    // Add priority column (persisted — previously tracked only in-memory)
    if (!hasColumn(db, 'work_tasks', 'priority')) {
        db.exec(`ALTER TABLE work_tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 2`);
    }

    // Add queued_at timestamp for queue admission tracking
    if (!hasColumn(db, 'work_tasks', 'queued_at')) {
        db.exec(`ALTER TABLE work_tasks ADD COLUMN queued_at TEXT DEFAULT NULL`);
    }

    // Index for efficient dispatch query: find pending tasks for projects without active tasks
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_work_tasks_pending_dispatch
            ON work_tasks(status, project_id, priority DESC, created_at ASC)
    `);
}

export function down(db: Database): void {
    db.exec('DROP INDEX IF EXISTS idx_work_tasks_pending_dispatch');
    // SQLite doesn't support DROP COLUMN before 3.35.0, but Bun's SQLite does
    if (hasColumn(db, 'work_tasks', 'queued_at')) {
        db.exec('ALTER TABLE work_tasks DROP COLUMN queued_at');
    }
    if (hasColumn(db, 'work_tasks', 'priority')) {
        db.exec('ALTER TABLE work_tasks DROP COLUMN priority');
    }
}
