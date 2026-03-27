/**
 * Tests for the ARC-69 Shared Agent Library (CRVLIB).
 *
 * Tests cover:
 * - DB helper functions (CRUD, list, archive, delete)
 * - Schema migration (table and index existence)
 * - resolveLibraryAsa helper
 * - Note payload building (via plaintext export)
 *
 * On-chain operations (createLibraryEntry, readLibraryEntry, etc.) require a
 * live localnet and are tested separately in integration tests.
 */
import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import {
    saveLibraryEntry,
    getLibraryEntry,
    getLibraryEntryByAsaId,
    listLibraryEntries,
    getBookPages,
    updateLibraryEntryTxid,
    updateLibraryEntryAsaId,
    archiveLibraryEntry,
    deleteLibraryEntryRow,
    resolveLibraryAsaId,
    upsertLibraryEntryFromChain,
} from '../db/agent-library';
import { resolveLibraryAsa } from '../memory/arc69-library';

let db: Database;
let agentId: string;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    const agent = createAgent(db, { name: 'Library Agent', model: 'sonnet' });
    agentId = agent.id;
});

afterEach(() => {
    db.close();
});

// ─── Schema ──────────────────────────────────────────────────────────────────

describe('Migration 106 — agent_library table', () => {
    test('table exists', () => {
        const tables = db.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_library'"
        ).all();
        expect(tables.length).toBe(1);
    });

    test('required columns exist', () => {
        const cols = db.query('PRAGMA table_info(agent_library)').all() as Array<{ name: string }>;
        const colNames = cols.map((c) => c.name);
        expect(colNames).toContain('id');
        expect(colNames).toContain('asa_id');
        expect(colNames).toContain('key');
        expect(colNames).toContain('author_id');
        expect(colNames).toContain('author_name');
        expect(colNames).toContain('category');
        expect(colNames).toContain('tags');
        expect(colNames).toContain('content');
        expect(colNames).toContain('book');
        expect(colNames).toContain('page');
        expect(colNames).toContain('txid');
        expect(colNames).toContain('created_at');
        expect(colNames).toContain('updated_at');
        expect(colNames).toContain('archived');
    });

    test('indexes exist', () => {
        const indexes = db.query(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='agent_library'"
        ).all() as Array<{ name: string }>;
        const idxNames = indexes.map((i) => i.name);
        expect(idxNames).toContain('idx_agent_library_key');
        expect(idxNames).toContain('idx_agent_library_category');
        expect(idxNames).toContain('idx_agent_library_book_page');
        expect(idxNames).toContain('idx_agent_library_author');
    });
});

// ─── saveLibraryEntry ────────────────────────────────────────────────────────

describe('saveLibraryEntry', () => {
    test('creates a new entry', () => {
        const entry = saveLibraryEntry(db, {
            authorId: agentId,
            authorName: 'Jackdaw',
            key: 'ts-style-guide',
            content: 'Use strict TypeScript.',
            category: 'guide',
            tags: ['typescript'],
        });

        expect(entry.id).toBeTruthy();
        expect(entry.key).toBe('ts-style-guide');
        expect(entry.authorId).toBe(agentId);
        expect(entry.authorName).toBe('Jackdaw');
        expect(entry.category).toBe('guide');
        expect(entry.tags).toEqual(['typescript']);
        expect(entry.content).toBe('Use strict TypeScript.');
        expect(entry.asaId).toBeNull();
        expect(entry.txid).toBeNull();
        expect(entry.archived).toBe(false);
    });

    test('upserts on duplicate key', () => {
        saveLibraryEntry(db, {
            authorId: agentId,
            authorName: 'Jackdaw',
            key: 'decision-001',
            content: 'v1 content',
        });

        const updated = saveLibraryEntry(db, {
            authorId: agentId,
            authorName: 'Jackdaw',
            key: 'decision-001',
            content: 'v2 content',
        });

        expect(updated.content).toBe('v2 content');

        // Only one row should exist
        const rows = db.query("SELECT COUNT(*) as cnt FROM agent_library WHERE key = 'decision-001'").get() as { cnt: number };
        expect(rows.cnt).toBe(1);
    });

    test('defaults category to reference', () => {
        const entry = saveLibraryEntry(db, {
            authorId: agentId,
            authorName: 'Rook',
            key: 'api-ref',
            content: 'API reference.',
        });
        expect(entry.category).toBe('reference');
    });

    test('defaults tags to empty array', () => {
        const entry = saveLibraryEntry(db, {
            authorId: agentId,
            authorName: 'Rook',
            key: 'no-tags',
            content: 'x',
        });
        expect(entry.tags).toEqual([]);
    });

    test('stores book and page metadata', () => {
        const entry = saveLibraryEntry(db, {
            authorId: agentId,
            authorName: 'Condor',
            key: 'big-book',
            content: 'Chapter 1',
            book: 'big-book',
            page: 1,
        });
        expect(entry.book).toBe('big-book');
        expect(entry.page).toBe(1);
    });
});

// ─── getLibraryEntry ─────────────────────────────────────────────────────────

describe('getLibraryEntry', () => {
    test('returns entry by key', () => {
        saveLibraryEntry(db, {
            authorId: agentId,
            authorName: 'Jackdaw',
            key: 'runbook-deploy',
            content: 'Deploy steps.',
            category: 'runbook',
        });

        const entry = getLibraryEntry(db, 'runbook-deploy');
        expect(entry).not.toBeNull();
        expect(entry!.content).toBe('Deploy steps.');
    });

    test('returns null for nonexistent key', () => {
        expect(getLibraryEntry(db, 'nope')).toBeNull();
    });

    test('excludes archived entries', () => {
        saveLibraryEntry(db, {
            authorId: agentId,
            authorName: 'Jackdaw',
            key: 'old-doc',
            content: 'Outdated.',
        });
        archiveLibraryEntry(db, 'old-doc');
        expect(getLibraryEntry(db, 'old-doc')).toBeNull();
    });
});

// ─── getLibraryEntryByAsaId ──────────────────────────────────────────────────

describe('getLibraryEntryByAsaId', () => {
    test('finds entry by ASA ID', () => {
        const entry = saveLibraryEntry(db, {
            authorId: agentId,
            authorName: 'Jackdaw',
            key: 'adr-001',
            content: 'Use TypeScript.',
            category: 'decision',
        });
        updateLibraryEntryAsaId(db, entry.key, 9999);

        const found = getLibraryEntryByAsaId(db, 9999);
        expect(found).not.toBeNull();
        expect(found!.key).toBe('adr-001');
        expect(found!.asaId).toBe(9999);
    });

    test('returns null for nonexistent ASA ID', () => {
        expect(getLibraryEntryByAsaId(db, 99999)).toBeNull();
    });
});

// ─── listLibraryEntries ───────────────────────────────────────────────────────

describe('listLibraryEntries', () => {
    beforeEach(() => {
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Jackdaw', key: 'guide-1', content: 'g1', category: 'guide', tags: ['ts'] });
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Jackdaw', key: 'ref-1', content: 'r1', category: 'reference' });
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Rook', key: 'std-1', content: 's1', category: 'standard', tags: ['security'] });
    });

    test('lists all non-archived entries', () => {
        const entries = listLibraryEntries(db);
        expect(entries.length).toBe(3);
    });

    test('filters by category', () => {
        const guides = listLibraryEntries(db, { category: 'guide' });
        expect(guides.length).toBe(1);
        expect(guides[0].key).toBe('guide-1');
    });

    test('filters by author', () => {
        const rookEntries = listLibraryEntries(db, { authorId: agentId });
        // All were created with agentId, but let's verify filtering works
        expect(rookEntries.length).toBeGreaterThan(0);
    });

    test('filters by tag', () => {
        const tsEntries = listLibraryEntries(db, { tag: 'ts' });
        expect(tsEntries.length).toBe(1);
        expect(tsEntries[0].key).toBe('guide-1');
    });

    test('excludes archived entries', () => {
        archiveLibraryEntry(db, 'guide-1');
        const entries = listLibraryEntries(db);
        expect(entries.length).toBe(2);
    });

    test('respects limit', () => {
        const entries = listLibraryEntries(db, { limit: 2 });
        expect(entries.length).toBe(2);
    });
});

// ─── getBookPages ─────────────────────────────────────────────────────────────

describe('getBookPages', () => {
    test('returns pages in order', () => {
        saveLibraryEntry(db, {
            authorId: agentId, authorName: 'Condor', key: 'book-p1',
            content: 'Page 1', book: 'my-book', page: 1,
        });
        saveLibraryEntry(db, {
            authorId: agentId, authorName: 'Condor', key: 'book-p2',
            content: 'Page 2', book: 'my-book', page: 2,
        });
        saveLibraryEntry(db, {
            authorId: agentId, authorName: 'Condor', key: 'book-p3',
            content: 'Page 3', book: 'my-book', page: 3,
        });

        const pages = getBookPages(db, 'my-book');
        expect(pages.length).toBe(3);
        expect(pages[0].page).toBe(1);
        expect(pages[1].page).toBe(2);
        expect(pages[2].page).toBe(3);
    });

    test('returns empty array for nonexistent book', () => {
        expect(getBookPages(db, 'ghost-book')).toEqual([]);
    });
});

// ─── updateLibraryEntryTxid ───────────────────────────────────────────────────

describe('updateLibraryEntryTxid', () => {
    test('sets txid on entry', () => {
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Rook', key: 'k1', content: 'c' });
        updateLibraryEntryTxid(db, 'k1', 'abc123txid');

        const entry = getLibraryEntry(db, 'k1');
        expect(entry!.txid).toBe('abc123txid');
    });
});

// ─── updateLibraryEntryAsaId ──────────────────────────────────────────────────

describe('updateLibraryEntryAsaId', () => {
    test('sets asa_id on entry', () => {
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Rook', key: 'k2', content: 'c' });
        updateLibraryEntryAsaId(db, 'k2', 555);

        const entry = getLibraryEntry(db, 'k2');
        expect(entry!.asaId).toBe(555);
    });
});

// ─── archiveLibraryEntry ──────────────────────────────────────────────────────

describe('archiveLibraryEntry', () => {
    test('marks entry as archived', () => {
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Rook', key: 'old', content: 'x' });
        const archived = archiveLibraryEntry(db, 'old');
        expect(archived).toBe(true);
        expect(getLibraryEntry(db, 'old')).toBeNull();
    });

    test('returns false for nonexistent key', () => {
        expect(archiveLibraryEntry(db, 'nonexistent')).toBe(false);
    });
});

// ─── deleteLibraryEntryRow ────────────────────────────────────────────────────

describe('deleteLibraryEntryRow', () => {
    test('deletes entry row', () => {
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Rook', key: 'del-me', content: 'x' });
        expect(deleteLibraryEntryRow(db, 'del-me')).toBe(true);
        expect(getLibraryEntry(db, 'del-me')).toBeNull();
    });

    test('returns false for nonexistent key', () => {
        expect(deleteLibraryEntryRow(db, 'gone')).toBe(false);
    });
});

// ─── resolveLibraryAsaId ──────────────────────────────────────────────────────

describe('resolveLibraryAsaId', () => {
    test('returns ASA ID when set', () => {
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Jackdaw', key: 'asa-key', content: 'x' });
        updateLibraryEntryAsaId(db, 'asa-key', 1234);
        expect(resolveLibraryAsaId(db, 'asa-key')).toBe(1234);
    });

    test('returns null when no ASA ID', () => {
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Jackdaw', key: 'no-asa', content: 'x' });
        expect(resolveLibraryAsaId(db, 'no-asa')).toBeNull();
    });

    test('returns null for nonexistent key', () => {
        expect(resolveLibraryAsaId(db, 'nope')).toBeNull();
    });
});

// ─── resolveLibraryAsa (memory module export) ─────────────────────────────────

describe('resolveLibraryAsa (arc69-library module)', () => {
    test('returns ASA ID via memory module helper', () => {
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Jackdaw', key: 'mem-key', content: 'x' });
        updateLibraryEntryAsaId(db, 'mem-key', 7777);
        expect(resolveLibraryAsa(db, 'mem-key')).toBe(7777);
    });

    test('returns null when missing', () => {
        expect(resolveLibraryAsa(db, 'missing')).toBeNull();
    });
});

// ─── upsertLibraryEntryFromChain ──────────────────────────────────────────────

describe('upsertLibraryEntryFromChain', () => {
    test('inserts new entry from chain sync', () => {
        upsertLibraryEntryFromChain(db, {
            asaId: 8001,
            key: 'chain-entry',
            authorId: agentId,
            authorName: 'Condor',
            category: 'decision',
            tags: ['architecture'],
            content: 'Use Bun runtime.',
            txid: 'txchain123',
        });

        const entry = getLibraryEntry(db, 'chain-entry');
        expect(entry).not.toBeNull();
        expect(entry!.asaId).toBe(8001);
        expect(entry!.content).toBe('Use Bun runtime.');
        expect(entry!.tags).toEqual(['architecture']);
        expect(entry!.txid).toBe('txchain123');
    });

    test('updates existing entry from chain sync', () => {
        // Pre-create entry
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Condor', key: 'chain-update', content: 'old' });

        // Upsert from chain
        upsertLibraryEntryFromChain(db, {
            asaId: 8002,
            key: 'chain-update',
            authorId: agentId,
            authorName: 'Condor',
            category: 'guide',
            tags: ['updated'],
            content: 'new content',
            txid: 'txupdate456',
        });

        const entry = getLibraryEntry(db, 'chain-update');
        expect(entry!.content).toBe('new content');
        expect(entry!.asaId).toBe(8002);
        expect(entry!.archived).toBe(false);
    });

    test('restores archived entry from chain sync', () => {
        saveLibraryEntry(db, { authorId: agentId, authorName: 'Condor', key: 'restored', content: 'old' });
        archiveLibraryEntry(db, 'restored');

        upsertLibraryEntryFromChain(db, {
            asaId: 8003,
            key: 'restored',
            authorId: agentId,
            authorName: 'Condor',
            category: 'reference',
            tags: [],
            content: 'restored content',
            txid: 'txrestore789',
        });

        const row = db.query('SELECT archived FROM agent_library WHERE key = ?').get('restored') as { archived: number };
        expect(row.archived).toBe(0);
    });

    test('stores book and page metadata from chain', () => {
        upsertLibraryEntryFromChain(db, {
            asaId: 8004,
            key: 'book-chain/page-2',
            authorId: agentId,
            authorName: 'Condor',
            category: 'guide',
            tags: [],
            content: 'Page 2 content.',
            book: 'book-chain',
            page: 2,
            txid: 'txbook001',
        });

        const entry = getLibraryEntry(db, 'book-chain/page-2');
        expect(entry!.book).toBe('book-chain');
        expect(entry!.page).toBe(2);
    });
});
