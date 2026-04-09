import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
  const cols = db.query('PRAGMA table_info(agent_memories)').all() as Array<{ name: string }>;

  if (!cols.some((c) => c.name === 'book')) {
    db.exec('ALTER TABLE agent_memories ADD COLUMN book TEXT DEFAULT NULL');
  }
  if (!cols.some((c) => c.name === 'page')) {
    db.exec('ALTER TABLE agent_memories ADD COLUMN page INTEGER DEFAULT NULL');
  }

  db.exec(`
        CREATE INDEX IF NOT EXISTS idx_agent_memories_book_page
          ON agent_memories(agent_id, book, page)
          WHERE book IS NOT NULL
    `);

  // Enforce: book and page must both be set or both be null (no orphaned pages)
  try {
    db.exec(`
            CREATE TRIGGER IF NOT EXISTS trg_agent_memories_book_page_insert
            BEFORE INSERT ON agent_memories
            WHEN (NEW.book IS NOT NULL AND NEW.page IS NULL)
               OR (NEW.book IS NULL AND NEW.page IS NOT NULL)
            BEGIN
                SELECT RAISE(ABORT, 'book and page must both be set or both be null');
            END
        `);
    db.exec(`
            CREATE TRIGGER IF NOT EXISTS trg_agent_memories_book_page_update
            BEFORE UPDATE ON agent_memories
            WHEN (NEW.book IS NOT NULL AND NEW.page IS NULL)
               OR (NEW.book IS NULL AND NEW.page IS NOT NULL)
            BEGIN
                SELECT RAISE(ABORT, 'book and page must both be set or both be null');
            END
        `);
  } catch {
    // Triggers may already exist from a previous run
  }
}

export function down(db: Database): void {
  db.exec('DROP TRIGGER IF EXISTS trg_agent_memories_book_page_insert');
  db.exec('DROP TRIGGER IF EXISTS trg_agent_memories_book_page_update');
  db.exec('DROP INDEX IF EXISTS idx_agent_memories_book_page');

  const cols = db.query('PRAGMA table_info(agent_memories)').all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === 'book')) {
    db.exec('ALTER TABLE agent_memories DROP COLUMN book');
  }
  if (cols.some((c) => c.name === 'page')) {
    db.exec('ALTER TABLE agent_memories DROP COLUMN page');
  }
}
