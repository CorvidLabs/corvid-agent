import { Database } from 'bun:sqlite';

/**
 * Migration 098: Add output_destinations column to agent_schedules.
 *
 * Stores JSON array of output destinations (Discord channels, AlgoChat agents/addresses)
 * where schedule execution results should be delivered after completion.
 */

function columnExists(db: Database, table: string, column: string): boolean {
    const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
    if (!columnExists(db, 'agent_schedules', 'output_destinations')) {
        db.exec(`ALTER TABLE agent_schedules ADD COLUMN output_destinations TEXT DEFAULT NULL`);
    }
}

export function down(db: Database): void {
    db.exec(`ALTER TABLE agent_schedules DROP COLUMN output_destinations`);
}
