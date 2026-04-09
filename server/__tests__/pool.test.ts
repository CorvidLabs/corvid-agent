import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DbPool, isSqliteBusy, writeTransaction } from '../db/pool';

/** Create a unique temp DB path for file-backed pool tests.
 *  Uses project dir instead of tmpdir() because macOS tmpdir symlinks
 *  break SQLite readonly opens (SQLITE_CANTOPEN). */
let tmpCounter = 0;
function tmpDbPath(): string {
  return join(__dirname, `.pool-test-${Date.now()}-${tmpCounter++}.db`);
}

/** Clean up temp DB files (db, wal, shm). */
function cleanupTmpDb(path: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = `${path}${suffix}`;
    if (existsSync(f)) unlinkSync(f);
  }
}

/**
 * Pre-initialise a DB file with WAL mode so that DbPool's readonly
 * connections can open it without hitting SQLITE_CANTOPEN.
 * (Setting PRAGMA journal_mode=WAL on a readonly connection while another
 * connection holds the WAL lock fails on macOS/bun.)
 */
function initDbFile(path: string): void {
  const db = new Database(path, { create: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  db.close();
}

// ─── isSqliteBusy ────────────────────────────────────────────────────────────

describe('isSqliteBusy', () => {
  test('returns true for "database is locked" error', () => {
    expect(isSqliteBusy(new Error('database is locked'))).toBe(true);
  });

  test('returns true for "SQLITE_BUSY" error', () => {
    expect(isSqliteBusy(new Error('SQLITE_BUSY'))).toBe(true);
  });

  test('returns true case-insensitively', () => {
    expect(isSqliteBusy(new Error('Database Is Locked'))).toBe(true);
    expect(isSqliteBusy(new Error('sqlite_busy: table locked'))).toBe(true);
  });

  test('returns false for non-busy errors', () => {
    expect(isSqliteBusy(new Error('no such table'))).toBe(false);
    expect(isSqliteBusy(new Error('syntax error'))).toBe(false);
  });

  test('returns false for non-Error values', () => {
    expect(isSqliteBusy('database is locked')).toBe(false);
    expect(isSqliteBusy(null)).toBe(false);
    expect(isSqliteBusy(undefined)).toBe(false);
    expect(isSqliteBusy(42)).toBe(false);
  });
});

// ─── writeTransaction ────────────────────────────────────────────────────────

describe('writeTransaction', () => {
  test('commits successful transaction and returns result', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');

    const result = writeTransaction(db, (d) => {
      d.query('INSERT INTO t (val) VALUES (?)').run('hello');
      return 'ok';
    });

    expect(result).toBe('ok');
    const row = db.query('SELECT val FROM t WHERE id = 1').get() as { val: string };
    expect(row.val).toBe('hello');
    db.close();
  });

  test('rolls back on error inside fn', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');

    expect(() =>
      writeTransaction(db, (d) => {
        d.query('INSERT INTO t (val) VALUES (?)').run('should-rollback');
        throw new Error('deliberate failure');
      }),
    ).toThrow('deliberate failure');

    const row = db.query('SELECT COUNT(*) as cnt FROM t').get() as { cnt: number };
    expect(row.cnt).toBe(0);
    db.close();
  });

  test('propagates non-busy errors at BEGIN without retry', () => {
    const db = new Database(':memory:');
    db.close(); // closed DB will throw on exec

    expect(() => writeTransaction(db, () => 'nope')).toThrow();
  });

  test('respects maxRetries=0 (no retries)', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');

    // Normal operation still works with 0 retries
    const result = writeTransaction(db, () => 42, { maxRetries: 0 });
    expect(result).toBe(42);
    db.close();
  });
});

// ─── DbPool ──────────────────────────────────────────────────────────────────

describe('DbPool', () => {
  const tmpPaths: string[] = [];

  afterEach(() => {
    for (const p of tmpPaths) cleanupTmpDb(p);
    tmpPaths.length = 0;
  });

  function createPool(opts?: { maxReadConnections?: number }): DbPool {
    const path = tmpDbPath();
    tmpPaths.push(path);
    initDbFile(path);
    return new DbPool({ path, ...opts });
  }

  test('creates pool with default read connections', () => {
    const pool = createPool();
    expect(pool.readConnectionCount).toBe(4);
    pool.close();
  });

  test('creates pool with custom read connection count', () => {
    const pool = createPool({ maxReadConnections: 2 });
    expect(pool.readConnectionCount).toBe(2);
    pool.close();
  });

  test('enforces minimum of 1 read connection', () => {
    const pool = createPool({ maxReadConnections: 0 });
    expect(pool.readConnectionCount).toBe(1);
    pool.close();
  });

  test('getWriteDb returns a usable database', () => {
    const pool = createPool();
    const wd = pool.getWriteDb();
    wd.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    wd.query('INSERT INTO t (id) VALUES (1)').run();
    const row = wd.query('SELECT id FROM t').get() as { id: number };
    expect(row.id).toBe(1);
    pool.close();
  });

  test('getReadDb round-robins across connections', () => {
    const pool = createPool({ maxReadConnections: 3 });
    const first = pool.getReadDb();
    const second = pool.getReadDb();
    pool.getReadDb(); // third
    const fourth = pool.getReadDb(); // wraps around

    // Fourth should be the same object as the first (round-robin)
    expect(fourth).toBe(first);
    expect(second).not.toBe(first);
    pool.close();
  });

  test('write() executes in a transaction', () => {
    const pool = createPool();
    pool.getWriteDb().exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');

    pool.write((db) => {
      db.query('INSERT INTO t (val) VALUES (?)').run('pooled');
    });

    const row = pool.getWriteDb().query('SELECT val FROM t').get() as { val: string };
    expect(row.val).toBe('pooled');
    pool.close();
  });

  test('write() rolls back on error', () => {
    const pool = createPool();
    pool.getWriteDb().exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');

    expect(() =>
      pool.write(() => {
        throw new Error('pool write fail');
      }),
    ).toThrow('pool write fail');

    pool.close();
  });

  test('read() can query data written by write()', () => {
    const pool = createPool();
    pool.getWriteDb().exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    pool.write((db) => {
      db.query("INSERT INTO t (val) VALUES ('hello')").run();
    });

    const result = pool.read((db) => {
      return (db.query('SELECT val FROM t').get() as { val: string }).val;
    });
    expect(result).toBe('hello');
    pool.close();
  });

  test('throws after close on getWriteDb', () => {
    const pool = createPool();
    pool.close();
    expect(() => pool.getWriteDb()).toThrow('DbPool is closed');
  });

  test('throws after close on getReadDb', () => {
    const pool = createPool();
    pool.close();
    expect(() => pool.getReadDb()).toThrow('DbPool is closed');
  });

  test('throws after close on write()', () => {
    const pool = createPool();
    pool.close();
    expect(() => pool.write(() => {})).toThrow('DbPool is closed');
  });

  test('throws after close on read()', () => {
    const pool = createPool();
    pool.close();
    expect(() => pool.read(() => {})).toThrow('DbPool is closed');
  });

  test('close() is idempotent', () => {
    const pool = createPool();
    pool.close();
    pool.close(); // should not throw
  });
});
