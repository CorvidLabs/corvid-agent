/**
 * Migration 073: Work pipeline v2 — parallel execution, dependencies, and retry policies.
 *
 * Adds:
 *   - work_task_dependencies: declare blocker relationships between tasks
 *   - Retry columns on work_tasks: max_retries, retry_count, retry_backoff, last_retry_at
 *   - max_concurrency on projects: configurable parallel task limit per project
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    // Dependency tracking between work tasks
    db.exec(`
        CREATE TABLE IF NOT EXISTS work_task_dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
            depends_on_task_id TEXT NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(task_id, depends_on_task_id)
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_work_task_deps_task ON work_task_dependencies(task_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_work_task_deps_depends ON work_task_dependencies(depends_on_task_id)`);

    // Retry policy columns on work_tasks
    db.exec(`ALTER TABLE work_tasks ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE work_tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE work_tasks ADD COLUMN retry_backoff TEXT NOT NULL DEFAULT 'fixed'`);
    db.exec(`ALTER TABLE work_tasks ADD COLUMN last_retry_at TEXT DEFAULT NULL`);

    // Per-project concurrency limit (default 1 preserves existing behaviour)
    db.exec(`ALTER TABLE projects ADD COLUMN max_concurrency INTEGER NOT NULL DEFAULT 1`);
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS work_task_dependencies');
    // SQLite does not support DROP COLUMN before 3.35 — these are safe to leave
}
