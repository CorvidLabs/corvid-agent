/**
 * Migration 061: Server health snapshot tracking for uptime history.
 *
 * Stores periodic health check results so we can compute uptime
 * percentages and detect degradation trends over time.
 *
 * Note: uses `server_health_snapshots` to avoid conflict with the existing
 * `health_snapshots` table (migration 44) used for codebase improvement metrics.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS server_health_snapshots (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp       TEXT    NOT NULL DEFAULT (datetime('now')),
            status          TEXT    NOT NULL,
            response_time_ms INTEGER DEFAULT NULL,
            dependencies    TEXT    DEFAULT NULL,
            source          TEXT    NOT NULL DEFAULT 'internal'
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_server_health_snap_ts ON server_health_snapshots(timestamp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_server_health_snap_status ON server_health_snapshots(status)`);
}

export function down(db: Database): void {
    db.exec(`DROP TABLE IF EXISTS server_health_snapshots`);
}
