/**
 * Migration 058: Performance metrics table.
 *
 * Stores periodic snapshots of system performance metrics (response times,
 * memory usage, DB size, etc.) for trend detection and regression alerting.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS performance_metrics (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp  TEXT    NOT NULL DEFAULT (datetime('now')),
            metric     TEXT    NOT NULL,
            labels     TEXT    DEFAULT NULL,
            value      REAL    NOT NULL,
            unit       TEXT    DEFAULT NULL
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_perf_metric_ts ON performance_metrics(metric, timestamp)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_perf_ts ON performance_metrics(timestamp)`);
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS performance_metrics');
}
