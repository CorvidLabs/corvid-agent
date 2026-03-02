/**
 * Migration 061: Health snapshot tracking for uptime history.
 *
 * Stores periodic health check results so we can compute uptime
 * percentages and detect degradation trends over time.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS health_snapshots (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp       TEXT    NOT NULL DEFAULT (datetime('now')),
            status          TEXT    NOT NULL,
            response_time_ms INTEGER DEFAULT NULL,
            dependencies    TEXT    DEFAULT NULL,
            source          TEXT    NOT NULL DEFAULT 'internal'
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_health_snapshots_timestamp ON health_snapshots(timestamp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_health_snapshots_status ON health_snapshots(status)`);
}

export function down(db: Database): void {
    db.exec(`DROP TABLE IF EXISTS health_snapshots`);
}
