export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS agent_library (
        id TEXT PRIMARY KEY,
        asa_id INTEGER DEFAULT NULL,
        key TEXT NOT NULL UNIQUE,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'reference',
        tags TEXT NOT NULL DEFAULT '[]',
        content TEXT NOT NULL,
        book TEXT DEFAULT NULL,
        page INTEGER DEFAULT NULL,
        txid TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        archived INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (author_id) REFERENCES agents(id)
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_agent_library_key ON agent_library(key)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_library_category ON agent_library(category) WHERE archived = 0`,
    `CREATE INDEX IF NOT EXISTS idx_agent_library_book_page ON agent_library(book, page) WHERE book IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_agent_library_author ON agent_library(author_id)`,
];
