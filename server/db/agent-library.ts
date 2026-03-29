import type { Database } from 'bun:sqlite';

// ── Types ──────────────────────────────────────────────────────────

export type LibraryCategory = 'guide' | 'reference' | 'decision' | 'standard' | 'runbook';

export interface LibraryEntry {
  id: string;
  asaId: number | null;
  key: string;
  authorId: string;
  authorName: string;
  category: LibraryCategory;
  tags: string[];
  content: string;
  book: string | null;
  page: number | null;
  txid: string | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

interface LibraryRow {
  id: string;
  asa_id: number | null;
  key: string;
  author_id: string;
  author_name: string;
  category: string;
  tags: string;
  content: string;
  book: string | null;
  page: number | null;
  txid: string | null;
  created_at: string;
  updated_at: string;
  archived: number;
}

export interface ListLibraryOptions {
  category?: LibraryCategory;
  authorId?: string;
  tag?: string;
  book?: string;
  limit?: number;
  includeArchived?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────

function rowToEntry(row: LibraryRow): LibraryEntry {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    asaId: row.asa_id,
    key: row.key,
    authorId: row.author_id,
    authorName: row.author_name,
    category: row.category as LibraryCategory,
    tags,
    content: row.content,
    book: row.book,
    page: row.page,
    txid: row.txid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived === 1,
  };
}

// ── Public API ─────────────────────────────────────────────────────

export function saveLibraryEntry(
  db: Database,
  params: {
    authorId: string;
    authorName: string;
    key: string;
    content: string;
    category?: LibraryCategory;
    tags?: string[];
    book?: string | null;
    page?: number | null;
  },
): LibraryEntry {
  const id = crypto.randomUUID();
  const category = params.category ?? 'reference';
  const tags = JSON.stringify(params.tags ?? []);
  const book = params.book ?? null;
  const page = params.page ?? null;

  db.query(`
        INSERT INTO agent_library (id, author_id, author_name, key, content, category, tags, book, page)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            content = excluded.content,
            author_id = excluded.author_id,
            author_name = excluded.author_name,
            category = excluded.category,
            tags = excluded.tags,
            book = excluded.book,
            page = excluded.page,
            txid = NULL,
            updated_at = datetime('now')
    `).run(id, params.authorId, params.authorName, params.key, params.content, category, tags, book, page);

  const row = db.query('SELECT * FROM agent_library WHERE key = ?').get(params.key) as LibraryRow | null;

  if (row) return rowToEntry(row);
  // Fallback (should never happen)
  return rowToEntry({
    id,
    asa_id: null,
    key: params.key,
    author_id: params.authorId,
    author_name: params.authorName,
    category,
    tags,
    content: params.content,
    book,
    page,
    txid: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: 0,
  });
}

export function getLibraryEntry(db: Database, key: string): LibraryEntry | null {
  const row = db.query('SELECT * FROM agent_library WHERE key = ? AND archived = 0').get(key) as LibraryRow | null;
  return row ? rowToEntry(row) : null;
}

export function getLibraryEntryByAsaId(db: Database, asaId: number): LibraryEntry | null {
  const row = db.query('SELECT * FROM agent_library WHERE asa_id = ?').get(asaId) as LibraryRow | null;
  return row ? rowToEntry(row) : null;
}

export function listLibraryEntries(db: Database, options: ListLibraryOptions = {}): LibraryEntry[] {
  const { category, authorId, tag, book, limit = 20, includeArchived = false } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!includeArchived) {
    conditions.push('archived = 0');
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (authorId) {
    conditions.push('author_id = ?');
    params.push(authorId);
  }
  if (book) {
    conditions.push('book = ?');
    params.push(book);
  }
  if (tag) {
    conditions.push('tags LIKE ?');
    params.push(`%"${tag}"%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM agent_library ${where} ORDER BY updated_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.query(sql).all(...(params as Parameters<typeof db.query>)) as LibraryRow[];
  return rows.map(rowToEntry);
}

export function getBookPages(db: Database, book: string): LibraryEntry[] {
  const rows = db
    .query('SELECT * FROM agent_library WHERE book = ? AND archived = 0 ORDER BY page ASC')
    .all(book) as LibraryRow[];
  return rows.map(rowToEntry);
}

/**
 * List entries with book pages collapsed — returns one entry per book (page 1)
 * plus all non-book entries. Each book entry includes a `totalPages` count.
 */
export function listLibraryEntriesGrouped(
  db: Database,
  options: ListLibraryOptions = {},
): (LibraryEntry & { totalPages?: number })[] {
  const { category, authorId, tag, book, limit = 50, includeArchived = false } = options;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!includeArchived) {
    conditions.push('archived = 0');
  }
  // Only return non-book entries OR page 1 of books
  conditions.push('(book IS NULL OR page = 1)');

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (authorId) {
    conditions.push('author_id = ?');
    params.push(authorId);
  }
  if (book) {
    conditions.push('book = ?');
    params.push(book);
  }
  if (tag) {
    conditions.push('tags LIKE ?');
    params.push(`%"${tag}"%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM agent_library ${where} ORDER BY updated_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.query(sql).all(...(params as Parameters<typeof db.query>)) as LibraryRow[];
  const entries = rows.map(rowToEntry);

  // For each book entry, count total pages
  return entries.map((entry) => {
    if (entry.book) {
      const countRow = db
        .query('SELECT COUNT(*) as cnt FROM agent_library WHERE book = ? AND archived = 0')
        .get(entry.book) as { cnt: number } | null;
      return { ...entry, totalPages: countRow?.cnt ?? 1 };
    }
    return entry;
  });
}

export function updateLibraryEntryTxid(db: Database, key: string, txid: string): void {
  db.query("UPDATE agent_library SET txid = ?, updated_at = datetime('now') WHERE key = ?").run(txid, key);
}

export function updateLibraryEntryAsaId(db: Database, key: string, asaId: number): void {
  db.query("UPDATE agent_library SET asa_id = ?, updated_at = datetime('now') WHERE key = ?").run(asaId, key);
}

export function archiveLibraryEntry(db: Database, key: string): boolean {
  const result = db.query("UPDATE agent_library SET archived = 1, updated_at = datetime('now') WHERE key = ?").run(key);
  return (result as unknown as { changes: number }).changes > 0;
}

export function deleteLibraryEntryRow(db: Database, key: string): boolean {
  const result = db.query('DELETE FROM agent_library WHERE key = ?').run(key);
  return (result as unknown as { changes: number }).changes > 0;
}

export function resolveLibraryAsaId(db: Database, key: string): number | null {
  const row = db.query('SELECT asa_id FROM agent_library WHERE key = ? AND asa_id IS NOT NULL').get(key) as {
    asa_id: number;
  } | null;
  return row?.asa_id ?? null;
}

export function upsertLibraryEntryFromChain(
  db: Database,
  params: {
    asaId: number;
    key: string;
    authorId: string;
    authorName: string;
    category: LibraryCategory;
    tags: string[];
    content: string;
    book?: string | null;
    page?: number | null;
    txid: string;
  },
): void {
  const tags = JSON.stringify(params.tags ?? []);
  db.query(`
        INSERT INTO agent_library (id, asa_id, key, author_id, author_name, category, tags, content, book, page, txid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            asa_id = excluded.asa_id,
            author_id = excluded.author_id,
            author_name = excluded.author_name,
            category = excluded.category,
            tags = excluded.tags,
            content = excluded.content,
            book = excluded.book,
            page = excluded.page,
            txid = excluded.txid,
            updated_at = datetime('now'),
            archived = 0
    `).run(
    crypto.randomUUID(),
    params.asaId,
    params.key,
    params.authorId,
    params.authorName,
    params.category,
    tags,
    params.content,
    params.book ?? null,
    params.page ?? null,
    params.txid,
  );
}
