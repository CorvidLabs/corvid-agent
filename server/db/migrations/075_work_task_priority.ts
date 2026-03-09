/**
 * Migration 075: Add priority and preemption fields to work_tasks.
 *
 * - priority: 0 (P0, critical) through 3 (P3, low). Default 2 (normal).
 * - preempted_by: task ID that caused this task to be paused.
 * - New statuses 'queued' and 'paused' added to the lifecycle.
 * - Index on (status, priority) for efficient priority-queue dequeue.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`ALTER TABLE work_tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 2`);
    db.exec(`ALTER TABLE work_tasks ADD COLUMN preempted_by TEXT DEFAULT NULL`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_work_tasks_priority ON work_tasks(status, priority, created_at)');
}

export function down(db: Database): void {
    db.exec('DROP INDEX IF EXISTS idx_work_tasks_priority');
    // SQLite does not support DROP COLUMN before 3.35.0; safe with Bun's bundled SQLite.
    db.exec('ALTER TABLE work_tasks DROP COLUMN preempted_by');
    db.exec('ALTER TABLE work_tasks DROP COLUMN priority');
}
