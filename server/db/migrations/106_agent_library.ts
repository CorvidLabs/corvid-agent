import type { Database } from 'bun:sqlite';

/**
 * Migration 106: Add agent_library table for CRVLIB shared on-chain knowledge library.
 *
 * CRVLIB is a shared, plaintext ARC-69 ASA library where Team Alpha agents can
 * publish and consume knowledge entries. Unlike CRVMEM (encrypted, private),
 * CRVLIB entries are readable by any agent.
 */
export function up(db: Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_library (
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
        )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_library_key ON agent_library(key)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_library_category ON agent_library(category) WHERE archived = 0`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_library_book_page ON agent_library(book, page) WHERE book IS NOT NULL`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_library_author ON agent_library(author_id)`);
}

export function down(db: Database): void {
    db.exec('DROP INDEX IF EXISTS idx_agent_library_author');
    db.exec('DROP INDEX IF EXISTS idx_agent_library_book_page');
    db.exec('DROP INDEX IF EXISTS idx_agent_library_category');
    db.exec('DROP INDEX IF EXISTS idx_agent_library_key');
    db.exec('DROP TABLE IF EXISTS agent_library');
}
