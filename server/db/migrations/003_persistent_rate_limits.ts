/**
 * Migration 003: Persistent rate limits (SQLite-backed).
 *
 * Replaces the in-memory sliding-window rate limiter with a SQLite table
 * so that rate-limit state survives server restarts.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS rate_limit_state (
            key           TEXT    NOT NULL,
            bucket        TEXT    NOT NULL,
            window_start  INTEGER NOT NULL,
            request_count INTEGER NOT NULL DEFAULT 1,
            updated_at    TEXT    DEFAULT (datetime('now')),
            PRIMARY KEY (key, bucket, window_start)
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_state(window_start)`);
}

export function down(db: Database): void {
    db.exec('DROP TABLE IF EXISTS rate_limit_state');
}
