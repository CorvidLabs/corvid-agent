/**
 * Schema definitions for infrastructure / misc tables.
 *
 * Tables: dedup_state, rate_limit_state, repo_blocklist, voice_cache
 */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS dedup_state (
        namespace  TEXT NOT NULL,
        key        TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, key)
    )`,

    `CREATE TABLE IF NOT EXISTS rate_limit_state (
        key           TEXT    NOT NULL,
        bucket        TEXT    NOT NULL,
        window_start  INTEGER NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 1,
        updated_at    TEXT    DEFAULT (datetime('now')),
        PRIMARY KEY (key, bucket, window_start)
    )`,

    `CREATE TABLE IF NOT EXISTS repo_blocklist (
        repo       TEXT NOT NULL,
        reason     TEXT DEFAULT '',
        source     TEXT NOT NULL DEFAULT 'manual',
        pr_url     TEXT DEFAULT '',
        tenant_id  TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (repo, tenant_id)
    )`,

    `CREATE TABLE IF NOT EXISTS voice_cache (
        id           TEXT PRIMARY KEY,
        text_hash    TEXT NOT NULL,
        voice_preset TEXT NOT NULL,
        audio_data   BLOB NOT NULL,
        format       TEXT DEFAULT 'mp3',
        duration_ms  INTEGER DEFAULT 0,
        created_at   TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_dedup_state_expires ON dedup_state(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_dedup_state_ns_expires ON dedup_state(namespace, expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_state(window_start)`,
    `CREATE INDEX IF NOT EXISTS idx_repo_blocklist_tenant ON repo_blocklist(tenant_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_cache_hash ON voice_cache(text_hash, voice_preset)`,
];
