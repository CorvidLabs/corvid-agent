/**
 * Memory module schema extensions.
 *
 * These tables extend the core agent_memories table (defined in db/schema.ts)
 * with category metadata, vector embeddings, and cross-references.
 *
 * The `ensureMemorySchema()` function is idempotent and safe to call on every
 * MemoryManager initialization.
 */
import type { Database } from 'bun:sqlite';

/**
 * Ensure memory-module-specific tables exist.
 * All statements use IF NOT EXISTS so this is safe to call repeatedly.
 */
export function ensureMemorySchema(db: Database): void {
    db.exec(`
        -- Category metadata for memories (soft extension — no ALTER needed)
        CREATE TABLE IF NOT EXISTS memory_categories (
            memory_id   TEXT PRIMARY KEY REFERENCES agent_memories(id) ON DELETE CASCADE,
            category    TEXT NOT NULL DEFAULT 'general',
            confidence  REAL NOT NULL DEFAULT 1.0,
            updated_at  TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_memory_categories_cat
            ON memory_categories(category);

        -- TF-IDF embedding vectors stored as JSON arrays of floats
        CREATE TABLE IF NOT EXISTS memory_embeddings (
            memory_id   TEXT PRIMARY KEY REFERENCES agent_memories(id) ON DELETE CASCADE,
            vector      TEXT NOT NULL,          -- JSON float array
            vocabulary  TEXT NOT NULL DEFAULT '', -- comma-separated term list (for debugging)
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        -- Cross-references between related memories (bidirectional)
        CREATE TABLE IF NOT EXISTS memory_cross_refs (
            source_id   TEXT NOT NULL REFERENCES agent_memories(id) ON DELETE CASCADE,
            target_id   TEXT NOT NULL REFERENCES agent_memories(id) ON DELETE CASCADE,
            score       REAL NOT NULL DEFAULT 0.0,
            created_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (source_id, target_id)
        );
        CREATE INDEX IF NOT EXISTS idx_memory_cross_refs_target
            ON memory_cross_refs(target_id);
    `);
}
