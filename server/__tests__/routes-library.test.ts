import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { saveLibraryEntry } from '../db/agent-library';
import { runMigrations } from '../db/schema';
import { handleLibraryRoutes } from '../routes/library';

let db: Database;
const AUTHOR_ID = crypto.randomUUID();

function makeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost${path}`);
  return { req: new Request(url, { method }), url };
}

function seed(key: string, overrides: Partial<Parameters<typeof saveLibraryEntry>[1]> = {}) {
  return saveLibraryEntry(db, { authorId: AUTHOR_ID, authorName: 'TestAgent', key, content: 'content', ...overrides });
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.query("INSERT INTO agents (id, name) VALUES (?, 'TestAgent')").run(AUTHOR_ID);
});

afterEach(() => {
  db.close();
});

// ─── Route matching ──────────────────────────────────────────────────────────

describe('route matching', () => {
  it('returns null for unrelated paths', () => {
    const { req, url } = makeReq('GET', '/api/agents');
    const result = handleLibraryRoutes(req, url, db);
    expect(result).toBeNull();
  });

  it('returns null for non-GET on /api/library', () => {
    const { req, url } = makeReq('POST', '/api/library');
    const result = handleLibraryRoutes(req, url, db);
    expect(result).toBeNull();
  });
});

// ─── GET /api/library ────────────────────────────────────────────────────────

describe('GET /api/library', () => {
  it('returns empty list when no entries', async () => {
    const { req, url } = makeReq('GET', '/api/library');
    const res = handleLibraryRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('returns all entries', async () => {
    seed('test-entry', { content: 'Test content', category: 'guide' });
    const { req, url } = makeReq('GET', '/api/library');
    const res = handleLibraryRoutes(req, url, db);
    const data = await res!.json();
    expect(data.length).toBe(1);
    expect(data[0].key).toBe('test-entry');
  });

  it('filters by category', async () => {
    seed('entry-guide', { category: 'guide' });
    seed('entry-ref', { category: 'reference' });
    const { req, url } = makeReq('GET', '/api/library?category=guide');
    const res = handleLibraryRoutes(req, url, db);
    const data = await res!.json();
    expect(data.length).toBe(1);
    expect(data[0].category).toBe('guide');
  });

  it('rejects invalid category with 400', async () => {
    const { req, url } = makeReq('GET', '/api/library?category=invalid_xyz');
    const res = handleLibraryRoutes(req, url, db);
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('Invalid category');
  });

  it('returns grouped entries when grouped=true', async () => {
    seed('book-entry', { book: 'mybook', page: 1 });
    seed('solo-entry');
    const { req, url } = makeReq('GET', '/api/library?grouped=true');
    const res = handleLibraryRoutes(req, url, db);
    expect(res!.status).toBe(200);
    // grouped=true returns an array; book entries include totalPages
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
    const bookEntry = data.find((e: { book: string }) => e.book === 'mybook');
    expect(bookEntry?.totalPages).toBeDefined();
  });

  it('respects limit param', async () => {
    for (let i = 0; i < 5; i++) {
      seed(`entry-${i}`, { category: 'guide' });
    }
    const { req, url } = makeReq('GET', '/api/library?limit=3');
    const res = handleLibraryRoutes(req, url, db);
    const data = await res!.json();
    expect(data.length).toBeLessThanOrEqual(3);
  });

  it('filters by tag', async () => {
    seed('tagged', { tags: ['alpha'] });
    seed('untagged', { tags: [] });
    const { req, url } = makeReq('GET', '/api/library?tag=alpha');
    const res = handleLibraryRoutes(req, url, db);
    const data = await res!.json();
    expect(data.length).toBe(1);
    expect(data[0].key).toBe('tagged');
  });

  it('filters by book', async () => {
    seed('book-page', { book: 'my-book', page: 1 });
    seed('no-book');
    const { req, url } = makeReq('GET', '/api/library?book=my-book');
    const res = handleLibraryRoutes(req, url, db);
    const data = await res!.json();
    expect(data.length).toBe(1);
    expect(data[0].key).toBe('book-page');
  });
});

// ─── GET /api/library/:key ───────────────────────────────────────────────────

describe('GET /api/library/:key', () => {
  it('returns 404 for missing entry', async () => {
    const { req, url } = makeReq('GET', '/api/library/does-not-exist');
    const res = handleLibraryRoutes(req, url, db);
    expect(res!.status).toBe(404);
    const data = await res!.json();
    expect(data.error).toBeDefined();
  });

  it('returns entry by key', async () => {
    seed('my-guide', { content: 'Hello world', category: 'guide' });
    const { req, url } = makeReq('GET', '/api/library/my-guide');
    const res = handleLibraryRoutes(req, url, db);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.key).toBe('my-guide');
    expect(data.content).toBe('Hello world');
    expect(data.category).toBe('guide');
  });

  it('includes book pages for entries belonging to a book', async () => {
    seed('book-ch1', { content: 'Chapter 1', book: 'mybook', page: 1 });
    seed('book-ch2', { content: 'Chapter 2', book: 'mybook', page: 2 });
    const { req, url } = makeReq('GET', '/api/library/book-ch1');
    const res = handleLibraryRoutes(req, url, db);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.book).toBe('mybook');
    expect(Array.isArray(data.pages)).toBe(true);
    expect(data.pages.length).toBe(2);
  });

  it('handles URL-encoded keys', async () => {
    seed('my key with spaces', { content: 'encoded' });
    const { req, url } = makeReq('GET', '/api/library/my%20key%20with%20spaces');
    const res = handleLibraryRoutes(req, url, db);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.key).toBe('my key with spaces');
  });

  it('returns null for non-GET on /:key path', () => {
    const { req, url } = makeReq('DELETE', '/api/library/some-key');
    const result = handleLibraryRoutes(req, url, db);
    expect(result).toBeNull();
  });
});
