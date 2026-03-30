/**
 * Tests for scripts/validate-db-specs.ts — DB schema validation logic.
 *
 * Tests the SQL migration parser and markdown spec parser in isolation.
 */

import { describe, expect, it } from 'bun:test';

// ── Inline the pure parsing functions for testing ─────────────────────────
// We re-implement a minimal subset here to test the parsing logic
// without importing top-level side-effects (file I/O, process.exit).

function extractCreateTableBody(sql: string): { tableName: string; body: string; isVirtual: boolean } | null {
  const headerMatch = sql.match(/CREATE\s+(VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*/i);
  if (!headerMatch) return null;
  const isVirtual = Boolean(headerMatch[1]);
  const tableName = headerMatch[2].toLowerCase();
  const headerEnd = sql.indexOf('(', headerMatch.index! + headerMatch[0].length);
  if (headerEnd === -1) return null;
  let depth = 0;
  let start = -1;
  let end = -1;
  for (let i = headerEnd; i < sql.length; i++) {
    if (sql[i] === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (sql[i] === ')') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (start === -1 || end === -1) return null;
  return { tableName, body: sql.slice(start, end), isVirtual };
}

interface MigrationColumn {
  name: string;
  type: string;
}

function parseCreateTableColumns(sql: string): Map<string, MigrationColumn> {
  const result = extractCreateTableBody(sql);
  if (!result) return new Map();
  const { body } = result;
  const defs: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      defs.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) defs.push(current.trim());
  const columns = new Map<string, MigrationColumn>();
  for (const def of defs) {
    const line = def.trim();
    if (!line) continue;
    if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE\s*\(|CHECK\s*\(|CONSTRAINT\s+)/i.test(line)) continue;
    const m = line.match(/^(\w+)\s+(\w+)/s);
    if (!m) continue;
    const colName = m[1].toLowerCase();
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)$/i.test(colName)) continue;
    columns.set(colName, { name: colName, type: m[2].toUpperCase() });
  }
  return columns;
}

function parseAlterTableAddColumn(sql: string): { table: string; col: string; type: string } | null {
  const m = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s+(\w+)/i);
  if (!m) return null;
  return { table: m[1].toLowerCase(), col: m[2].toLowerCase(), type: m[3].toUpperCase() };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('extractCreateTableBody', () => {
  it('extracts basic table', () => {
    const sql = `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT)`;
    const result = extractCreateTableBody(sql);
    expect(result).not.toBeNull();
    expect(result!.tableName).toBe('users');
    expect(result!.body).toContain('id TEXT PRIMARY KEY');
  });

  it('handles nested parens in REFERENCES', () => {
    const sql = `CREATE TABLE IF NOT EXISTS foo (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL
        )`;
    const cols = parseCreateTableColumns(sql);
    expect(cols.has('id')).toBe(true);
    expect(cols.has('user_id')).toBe(true);
    expect(cols.has('name')).toBe(true);
    expect(cols.size).toBe(3);
  });

  it('handles DEFAULT datetime(now)', () => {
    const sql = `CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT DEFAULT (datetime('now'))
        )`;
    const cols = parseCreateTableColumns(sql);
    expect(cols.has('id')).toBe(true);
    expect(cols.has('created_at')).toBe(true);
  });

  it('skips table-level constraints', () => {
    const sql = `CREATE TABLE IF NOT EXISTS memberships (
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            address TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (agent_id, address)
        )`;
    const cols = parseCreateTableColumns(sql);
    expect(cols.has('agent_id')).toBe(true);
    expect(cols.has('address')).toBe(true);
    expect(cols.has('created_at')).toBe(true);
    // PRIMARY KEY constraint should NOT appear as a column
    expect([...cols.keys()].every((k) => !/primary/i.test(k))).toBe(true);
    expect(cols.size).toBe(3);
  });

  it('correctly identifies column types', () => {
    const sql = `CREATE TABLE IF NOT EXISTS mixed (
            id TEXT PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0,
            score REAL NOT NULL DEFAULT 0.0,
            data BLOB DEFAULT NULL
        )`;
    const cols = parseCreateTableColumns(sql);
    expect(cols.get('id')!.type).toBe('TEXT');
    expect(cols.get('count')!.type).toBe('INTEGER');
    expect(cols.get('score')!.type).toBe('REAL');
    expect(cols.get('data')!.type).toBe('BLOB');
  });

  it('returns null for non-CREATE TABLE SQL', () => {
    expect(extractCreateTableBody('ALTER TABLE foo ADD COLUMN bar TEXT')).toBeNull();
    expect(extractCreateTableBody('SELECT * FROM foo')).toBeNull();
    expect(extractCreateTableBody('')).toBeNull();
  });
});

describe('parseAlterTableAddColumn', () => {
  it('parses ALTER TABLE ... ADD COLUMN', () => {
    const result = parseAlterTableAddColumn('ALTER TABLE agent_memories ADD COLUMN asa_id INTEGER DEFAULT NULL');
    expect(result).not.toBeNull();
    expect(result!.table).toBe('agent_memories');
    expect(result!.col).toBe('asa_id');
    expect(result!.type).toBe('INTEGER');
  });

  it('handles IF NOT EXISTS pattern (via wrapping)', () => {
    // Some migrations wrap ALTER in an if-check; we parse just the SQL
    const result = parseAlterTableAddColumn(`ALTER TABLE sessions ADD COLUMN conversation_summary TEXT DEFAULT NULL`);
    expect(result!.table).toBe('sessions');
    expect(result!.col).toBe('conversation_summary');
    expect(result!.type).toBe('TEXT');
  });

  it('returns null for non-ALTER SQL', () => {
    expect(parseAlterTableAddColumn('CREATE TABLE foo (id TEXT)')).toBeNull();
  });
});

describe('parseCreateTableColumns — composite key tables', () => {
  it('handles agent_conversation_allowlist pattern', () => {
    const sql = `CREATE TABLE IF NOT EXISTS agent_conversation_allowlist (
            agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            address    TEXT NOT NULL,
            label      TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (agent_id, address)
        )`;
    const cols = parseCreateTableColumns(sql);
    expect(cols.size).toBe(4);
    expect(cols.has('agent_id')).toBe(true);
    expect(cols.has('address')).toBe(true);
    expect(cols.has('label')).toBe(true);
    expect(cols.has('created_at')).toBe(true);
  });

  it('handles FOREIGN KEY constraint line', () => {
    const sql = `CREATE TABLE IF NOT EXISTS spending (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL NOT NULL,
            FOREIGN KEY (id) REFERENCES agents(id)
        )`;
    const cols = parseCreateTableColumns(sql);
    expect(cols.size).toBe(2);
    expect(cols.has('id')).toBe(true);
    expect(cols.has('amount')).toBe(true);
  });
});
