import type { Database } from 'bun:sqlite';
import { getBookPages, getLibraryEntry, type LibraryCategory, listLibraryEntries } from '../db/agent-library';
import { json, safeNumParam } from '../lib/response';
import type { RequestContext } from '../middleware/guards';

const VALID_CATEGORIES: LibraryCategory[] = ['guide', 'reference', 'decision', 'standard', 'runbook'];

export function handleLibraryRoutes(req: Request, url: URL, db: Database, _context?: RequestContext): Response | null {
  const path = url.pathname;
  const method = req.method;

  // GET /api/library — list entries with optional filters
  if (path === '/api/library' && method === 'GET') {
    const category = url.searchParams.get('category') as LibraryCategory | null;
    const tag = url.searchParams.get('tag') ?? undefined;
    const book = url.searchParams.get('book') ?? undefined;
    const limit = safeNumParam(url.searchParams.get('limit'), 50);

    if (category && !VALID_CATEGORIES.includes(category)) {
      return json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }, 400);
    }

    const entries = listLibraryEntries(db, {
      category: category ?? undefined,
      tag,
      book,
      limit,
    });
    return json(entries);
  }

  // GET /api/library/:key — get single entry + book pages if multi-page
  const entryMatch = path.match(/^\/api\/library\/([^/]+)$/);
  if (entryMatch && method === 'GET') {
    const key = decodeURIComponent(entryMatch[1]);
    const entry = getLibraryEntry(db, key);
    if (!entry) {
      return json({ error: 'Library entry not found' }, 404);
    }

    // If this entry belongs to a book, include all pages
    if (entry.book) {
      const pages = getBookPages(db, entry.book);
      return json({ ...entry, pages });
    }

    return json(entry);
  }

  return null;
}
