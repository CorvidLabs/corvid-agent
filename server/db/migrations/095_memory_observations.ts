import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS memory_observations (
            id                TEXT PRIMARY KEY,
            agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            source            TEXT NOT NULL,
            source_id         TEXT DEFAULT NULL,
            content           TEXT NOT NULL,
            suggested_key     TEXT DEFAULT NULL,
            relevance_score   REAL NOT NULL DEFAULT 1.0,
            access_count      INTEGER NOT NULL DEFAULT 0,
            last_accessed_at  TEXT DEFAULT NULL,
            status            TEXT NOT NULL DEFAULT 'active',
            graduated_key     TEXT DEFAULT NULL,
            created_at        TEXT DEFAULT (datetime('now')),
            expires_at        TEXT DEFAULT NULL
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_agent ON memory_observations(agent_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_status ON memory_observations(agent_id, status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_score ON memory_observations(relevance_score DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_expires ON memory_observations(expires_at) WHERE expires_at IS NOT NULL`);

    // FTS5 for searching observation content
    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_observations_fts USING fts5(
            content, suggested_key, content=memory_observations, content_rowid=rowid
        )
    `);

    // Sync triggers for FTS
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON memory_observations BEGIN
            INSERT INTO memory_observations_fts(rowid, content, suggested_key)
            VALUES (new.rowid, new.content, new.suggested_key);
        END
    `);
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON memory_observations BEGIN
            INSERT INTO memory_observations_fts(memory_observations_fts, rowid, content, suggested_key)
            VALUES ('delete', old.rowid, old.content, old.suggested_key);
        END
    `);
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON memory_observations BEGIN
            INSERT INTO memory_observations_fts(memory_observations_fts, rowid, content, suggested_key)
            VALUES ('delete', old.rowid, old.content, old.suggested_key);
            INSERT INTO memory_observations_fts(rowid, content, suggested_key)
            VALUES (new.rowid, new.content, new.suggested_key);
        END
    `);
}

export function down(db: Database): void {
    db.exec('DROP TRIGGER IF EXISTS observations_au');
    db.exec('DROP TRIGGER IF EXISTS observations_ad');
    db.exec('DROP TRIGGER IF EXISTS observations_ai');
    db.exec('DROP TABLE IF EXISTS memory_observations_fts');
    db.exec('DROP INDEX IF EXISTS idx_observations_expires');
    db.exec('DROP INDEX IF EXISTS idx_observations_score');
    db.exec('DROP INDEX IF EXISTS idx_observations_status');
    db.exec('DROP INDEX IF EXISTS idx_observations_agent');
    db.exec('DROP TABLE IF EXISTS memory_observations');
}
