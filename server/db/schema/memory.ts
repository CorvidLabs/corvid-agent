/** Agent memory tables, observation tables, FTS virtual tables, and sync triggers. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS agent_memories (
        id         TEXT PRIMARY KEY,
        agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        key        TEXT NOT NULL,
        content    TEXT NOT NULL,
        txid       TEXT DEFAULT NULL,
        asa_id     INTEGER DEFAULT NULL,
        status     TEXT DEFAULT 'confirmed',
        archived   INTEGER NOT NULL DEFAULT 0,
        book       TEXT DEFAULT NULL,
        page       INTEGER DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS memory_observations (
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
        channel_id        TEXT DEFAULT NULL,
        created_at        TEXT DEFAULT (datetime('now')),
        expires_at        TEXT DEFAULT NULL
    )`,
];

export const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_agent_key ON agent_memories(agent_id, key)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_memories_status ON agent_memories(status)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_memories_asa ON agent_memories(agent_id, asa_id) WHERE asa_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_agent_memories_book_page ON agent_memories(agent_id, book, page) WHERE book IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_observations_agent ON memory_observations(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_observations_status ON memory_observations(agent_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_observations_score ON memory_observations(relevance_score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_observations_expires ON memory_observations(expires_at) WHERE expires_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_observations_channel_id ON memory_observations(channel_id) WHERE channel_id IS NOT NULL`,
];

export const virtualTables: string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_fts USING fts5(
        key, content, content=agent_memories, content_rowid=rowid
    )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS memory_observations_fts USING fts5(
        content, suggested_key, content=memory_observations, content_rowid=rowid
    )`,
];

export const triggers: string[] = [
  `CREATE TRIGGER IF NOT EXISTS agent_memories_ai AFTER INSERT ON agent_memories BEGIN
        INSERT INTO agent_memories_fts(rowid, key, content)
        VALUES (new.rowid, new.key, new.content);
    END`,
  `CREATE TRIGGER IF NOT EXISTS agent_memories_ad AFTER DELETE ON agent_memories BEGIN
        INSERT INTO agent_memories_fts(agent_memories_fts, rowid, key, content)
        VALUES ('delete', old.rowid, old.key, old.content);
    END`,
  `CREATE TRIGGER IF NOT EXISTS agent_memories_au AFTER UPDATE ON agent_memories BEGIN
        INSERT INTO agent_memories_fts(agent_memories_fts, rowid, key, content)
        VALUES ('delete', old.rowid, old.key, old.content);
        INSERT INTO agent_memories_fts(rowid, key, content)
        VALUES (new.rowid, new.key, new.content);
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_agent_memories_book_page_insert
    BEFORE INSERT ON agent_memories
    WHEN (NEW.book IS NOT NULL AND NEW.page IS NULL)
       OR (NEW.book IS NULL AND NEW.page IS NOT NULL)
    BEGIN
        SELECT RAISE(ABORT, 'book and page must both be set or both be null');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_agent_memories_book_page_update
    BEFORE UPDATE ON agent_memories
    WHEN (NEW.book IS NOT NULL AND NEW.page IS NULL)
       OR (NEW.book IS NULL AND NEW.page IS NOT NULL)
    BEGIN
        SELECT RAISE(ABORT, 'book and page must both be set or both be null');
    END`,
  `CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON memory_observations BEGIN
        INSERT INTO memory_observations_fts(rowid, content, suggested_key)
        VALUES (new.rowid, new.content, new.suggested_key);
    END`,
  `CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON memory_observations BEGIN
        INSERT INTO memory_observations_fts(memory_observations_fts, rowid, content, suggested_key)
        VALUES ('delete', old.rowid, old.content, old.suggested_key);
    END`,
  `CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON memory_observations BEGIN
        INSERT INTO memory_observations_fts(memory_observations_fts, rowid, content, suggested_key)
        VALUES ('delete', old.rowid, old.content, old.suggested_key);
        INSERT INTO memory_observations_fts(rowid, content, suggested_key)
        VALUES (new.rowid, new.content, new.suggested_key);
    END`,
];
