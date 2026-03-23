import { Database } from 'bun:sqlite';

/**
 * Migration 103: Add pipeline execution support to agent_schedules.
 *
 * Adds execution_mode ('independent' | 'pipeline') and pipeline_steps (JSON)
 * columns for composable multi-action pipelines with shared context.
 */

function columnExists(db: Database, table: string, column: string): boolean {
    const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
    if (!columnExists(db, 'agent_schedules', 'execution_mode')) {
        db.exec(`ALTER TABLE agent_schedules ADD COLUMN execution_mode TEXT DEFAULT 'independent'`);
    }
    if (!columnExists(db, 'agent_schedules', 'pipeline_steps')) {
        db.exec(`ALTER TABLE agent_schedules ADD COLUMN pipeline_steps TEXT DEFAULT NULL`);
    }
}

export function down(db: Database): void {
    db.exec(`ALTER TABLE agent_schedules DROP COLUMN execution_mode`);
    db.exec(`ALTER TABLE agent_schedules DROP COLUMN pipeline_steps`);
}
