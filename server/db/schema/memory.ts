/** Agent memory tables, FTS virtual table, and sync triggers. */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_memories (
        id         TEXT PRIMARY KEY,
        agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        key        TEXT NOT NULL,
        content    TEXT NOT NULL,
        txid       TEXT DEFAULT NULL,
        status     TEXT DEFAULT 'confirmed',
        archived   INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_agent_key ON agent_memories(agent_id, key)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_memories_status ON agent_memories(status)`,
];

export const virtualTables: string[] = [
    `CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_fts USING fts5(
        key, content, content=agent_memories, content_rowid=rowid
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
];
