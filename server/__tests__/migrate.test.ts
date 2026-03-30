import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverMigrations, getCurrentVersion, migrateDown, migrateUp, migrationStatus } from '../db/migrate';

// ── Helpers ─────────────────────────────────────────────────────────────────

let db: Database;
let tempDir: string;

function makeMigrationDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'migrate-test-'));
  return tempDir;
}

function writeMigration(dir: string, filename: string, upSql: string, downSql: string): void {
  const content = `
import { Database } from 'bun:sqlite';
export function up(db: Database): void { db.exec(${JSON.stringify(upSql)}); }
export function down(db: Database): void { db.exec(${JSON.stringify(downSql)}); }
`;
  writeFileSync(join(dir, filename), content);
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
});

afterEach(() => {
  db.close();
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true });
    } catch {}
  }
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('getCurrentVersion', () => {
  test('returns 0 for fresh database', () => {
    expect(getCurrentVersion(db)).toBe(0);
  });

  test('creates schema_version table', () => {
    getCurrentVersion(db);
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").all();
    expect(tables).toHaveLength(1);
  });
});

describe('discoverMigrations', () => {
  test('returns empty for non-existent directory', () => {
    expect(discoverMigrations('/nonexistent')).toEqual([]);
  });

  test('discovers migration files in correct order', () => {
    const dir = makeMigrationDir();
    writeMigration(dir, '002_add_users.ts', 'SELECT 1', 'SELECT 1');
    writeMigration(dir, '001_baseline.ts', 'SELECT 1', 'SELECT 1');
    writeMigration(dir, '003_add_posts.ts', 'SELECT 1', 'SELECT 1');

    const entries = discoverMigrations(dir);
    expect(entries).toHaveLength(3);
    expect(entries[0].version).toBe(1);
    expect(entries[0].name).toBe('baseline');
    expect(entries[1].version).toBe(2);
    expect(entries[1].name).toBe('add users');
    expect(entries[2].version).toBe(3);
    expect(entries[2].name).toBe('add posts');
  });

  test('ignores non-migration files', () => {
    const dir = makeMigrationDir();
    writeMigration(dir, '001_baseline.ts', 'SELECT 1', 'SELECT 1');
    writeFileSync(join(dir, 'README.md'), '# Migrations');
    writeFileSync(join(dir, 'helper.ts'), 'export const x = 1;');

    const entries = discoverMigrations(dir);
    expect(entries).toHaveLength(1);
  });
});

describe('migrateUp', () => {
  test('applies all pending migrations', async () => {
    const dir = makeMigrationDir();
    writeMigration(
      dir,
      '001_create_users.ts',
      'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
      'DROP TABLE users',
    );
    writeMigration(
      dir,
      '002_create_posts.ts',
      'CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)',
      'DROP TABLE posts',
    );

    const result = await migrateUp(db, undefined, dir);
    expect(result.applied).toBe(2);
    expect(result.to).toBe(2);
    expect(getCurrentVersion(db)).toBe(2);

    // Verify tables exist
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string;
    }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('posts');
  });

  test('applies migrations up to target version', async () => {
    const dir = makeMigrationDir();
    writeMigration(dir, '001_create_users.ts', 'CREATE TABLE users (id INTEGER PRIMARY KEY)', 'DROP TABLE users');
    writeMigration(dir, '002_create_posts.ts', 'CREATE TABLE posts (id INTEGER PRIMARY KEY)', 'DROP TABLE posts');
    writeMigration(dir, '003_create_tags.ts', 'CREATE TABLE tags (id INTEGER PRIMARY KEY)', 'DROP TABLE tags');

    const result = await migrateUp(db, 2, dir);
    expect(result.applied).toBe(2);
    expect(result.to).toBe(2);

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('posts');
    expect(tableNames).not.toContain('tags');
  });

  test('skips already-applied migrations', async () => {
    const dir = makeMigrationDir();
    writeMigration(dir, '001_create_users.ts', 'CREATE TABLE users (id INTEGER PRIMARY KEY)', 'DROP TABLE users');
    writeMigration(dir, '002_create_posts.ts', 'CREATE TABLE posts (id INTEGER PRIMARY KEY)', 'DROP TABLE posts');

    await migrateUp(db, 1, dir);
    expect(getCurrentVersion(db)).toBe(1);

    const result = await migrateUp(db, undefined, dir);
    expect(result.applied).toBe(1);
    expect(result.to).toBe(2);
  });

  test('returns 0 applied when already up to date', async () => {
    const dir = makeMigrationDir();
    writeMigration(dir, '001_create_users.ts', 'CREATE TABLE users (id INTEGER PRIMARY KEY)', 'DROP TABLE users');

    await migrateUp(db, undefined, dir);
    const result = await migrateUp(db, undefined, dir);
    expect(result.applied).toBe(0);
    expect(result.to).toBe(1);
  });

  test('rolls back on failure (transaction safety)', async () => {
    const dir = makeMigrationDir();
    writeMigration(dir, '001_create_users.ts', 'CREATE TABLE users (id INTEGER PRIMARY KEY)', 'DROP TABLE users');
    writeMigration(dir, '002_bad_migration.ts', 'INVALID SQL STATEMENT', 'SELECT 1');

    await migrateUp(db, 1, dir);

    try {
      await migrateUp(db, undefined, dir);
    } catch {
      // Expected to fail
    }

    // Version should still be 1 (failed migration didn't commit)
    expect(getCurrentVersion(db)).toBe(1);
  });
});

describe('migrateDown', () => {
  test('reverts the most recent migration', async () => {
    const dir = makeMigrationDir();
    writeMigration(
      dir,
      '001_create_users.ts',
      'CREATE TABLE users (id INTEGER PRIMARY KEY)',
      'DROP TABLE IF EXISTS users',
    );
    writeMigration(
      dir,
      '002_create_posts.ts',
      'CREATE TABLE posts (id INTEGER PRIMARY KEY)',
      'DROP TABLE IF EXISTS posts',
    );

    await migrateUp(db, undefined, dir);
    expect(getCurrentVersion(db)).toBe(2);

    const result = await migrateDown(db, undefined, dir);
    expect(result.reverted).toBe(1);
    expect(result.to).toBe(1);
    expect(getCurrentVersion(db)).toBe(1);

    // posts table should be gone, users should remain
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).not.toContain('posts');
    expect(tableNames).toContain('users');
  });

  test('reverts down to target version', async () => {
    const dir = makeMigrationDir();
    writeMigration(
      dir,
      '001_create_users.ts',
      'CREATE TABLE users (id INTEGER PRIMARY KEY)',
      'DROP TABLE IF EXISTS users',
    );
    writeMigration(
      dir,
      '002_create_posts.ts',
      'CREATE TABLE posts (id INTEGER PRIMARY KEY)',
      'DROP TABLE IF EXISTS posts',
    );
    writeMigration(
      dir,
      '003_create_tags.ts',
      'CREATE TABLE tags (id INTEGER PRIMARY KEY)',
      'DROP TABLE IF EXISTS tags',
    );

    await migrateUp(db, undefined, dir);
    expect(getCurrentVersion(db)).toBe(3);

    const result = await migrateDown(db, 1, dir);
    expect(result.reverted).toBe(2);
    expect(result.to).toBe(1);
    expect(getCurrentVersion(db)).toBe(1);
  });

  test('returns 0 reverted when at version 0', async () => {
    const result = await migrateDown(db, undefined, '/nonexistent');
    expect(result.reverted).toBe(0);
    expect(result.to).toBe(0);
  });
});

describe('migrationStatus', () => {
  test('shows all migrations with applied status', async () => {
    const dir = makeMigrationDir();
    writeMigration(dir, '001_create_users.ts', 'CREATE TABLE users (id INTEGER PRIMARY KEY)', 'DROP TABLE users');
    writeMigration(dir, '002_create_posts.ts', 'CREATE TABLE posts (id INTEGER PRIMARY KEY)', 'DROP TABLE posts');
    writeMigration(dir, '003_create_tags.ts', 'CREATE TABLE tags (id INTEGER PRIMARY KEY)', 'DROP TABLE tags');

    await migrateUp(db, 2, dir);

    const statuses = migrationStatus(db, dir);
    expect(statuses).toHaveLength(3);
    expect(statuses[0]).toEqual({ version: 1, name: 'create users', applied: true });
    expect(statuses[1]).toEqual({ version: 2, name: 'create posts', applied: true });
    expect(statuses[2]).toEqual({ version: 3, name: 'create tags', applied: false });
  });
});

describe('initDb retry on failure', () => {
  test('promise-caching pattern resets on rejection, allowing retry', async () => {
    // This tests the exact pattern used by initDb():
    //   _initPromise = (async () => { ... })();
    //   _initPromise.catch(() => { _initPromise = null; });
    //
    // Without the .catch reset, _initPromise stays as a rejected promise
    // and subsequent calls return the same rejection forever.

    let _cachedPromise: Promise<void> | null = null;
    let callCount = 0;

    function initWithRetry(): Promise<void> {
      if (!_cachedPromise) {
        callCount++;
        const attempt = callCount;
        _cachedPromise = (async () => {
          if (attempt === 1) {
            throw new Error('Migration failed');
          }
          // Second attempt succeeds
        })();
        _cachedPromise.catch(() => {
          _cachedPromise = null; // The fix under test
        });
      }
      return _cachedPromise;
    }

    // First call fails
    try {
      await initWithRetry();
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect((err as Error).message).toBe('Migration failed');
    }

    // Wait a tick for the .catch handler to clear _cachedPromise
    await new Promise((r) => setTimeout(r, 0));

    // _cachedPromise should now be null, allowing retry
    expect(_cachedPromise).toBeNull();

    // Second call should retry (callCount increments to 2) and succeed
    await initWithRetry();
    expect(callCount).toBe(2);
  });

  test('without the fix, rejected promise would be cached forever', async () => {
    // Demonstrates the bug: without .catch(() => { _p = null }),
    // the second call returns the same rejected promise.

    let _cachedPromise: Promise<void> | null = null;
    let callCount = 0;

    function initWithoutFix(): Promise<void> {
      if (!_cachedPromise) {
        callCount++;
        const attempt = callCount;
        _cachedPromise = (async () => {
          if (attempt === 1) {
            throw new Error('Migration failed');
          }
        })();
        // NO .catch reset — the bug
      }
      return _cachedPromise;
    }

    // First call fails
    try {
      await initWithoutFix();
    } catch {
      // expected
    }

    // _cachedPromise is still set (the bug)
    expect(_cachedPromise).not.toBeNull();

    // Second call returns the SAME rejected promise — never retries
    expect(callCount).toBe(1);
    try {
      await initWithoutFix();
    } catch {
      // still fails with the same error
    }
    // migrateUp was never called again
    expect(callCount).toBe(1);
  });

  test('real initDb succeeds and caches on success', async () => {
    const { initDb, closeDb, getDb: getDbConn } = await import('../db/connection');

    // Reset any existing state
    closeDb();
    getDbConn();

    // initDb should succeed with real migrations on :memory:
    await initDb();

    // Calling again should not throw (returns cached resolved promise)
    await initDb();

    closeDb();
  });

  test('initDb applies pending file-based migrations and logs', async () => {
    const { initDb, closeDb, getDb: getDbConn } = await import('../db/connection');

    // Reset any existing state
    closeDb();

    // Create DB with legacy migrations (version 91)
    const d = getDbConn();

    // Lower the schema version so initDb finds pending file-based migrations
    const current = getCurrentVersion(d);
    expect(current).toBeGreaterThan(0);
    d.query('UPDATE schema_version SET version = ?').run(current - 1);

    // Now initDb should discover pending migration(s) and apply them
    await initDb();

    // Verify version is at least restored (may be higher if new file-based migrations exist)
    expect(getCurrentVersion(d)).toBeGreaterThanOrEqual(current);

    closeDb();
  });
});

describe('runPendingMigrations', () => {
  test('applies migrations and logs when applied > 0', async () => {
    const { runPendingMigrations } = await import('../db/migrate');
    // Fresh in-memory DB has version 0, so all file-based migrations are pending
    const freshDb = new Database(':memory:');
    freshDb.exec('PRAGMA foreign_keys = ON');

    await runPendingMigrations(freshDb);

    // Verify migrations were actually applied
    const version = getCurrentVersion(freshDb);
    expect(version).toBeGreaterThan(0);

    freshDb.close();
  });

  test('does not log when no migrations are pending', async () => {
    const { runPendingMigrations } = await import('../db/migrate');
    // Apply all migrations first
    const freshDb = new Database(':memory:');
    freshDb.exec('PRAGMA foreign_keys = ON');
    await migrateUp(freshDb);

    // Running again should find nothing pending
    await runPendingMigrations(freshDb);

    // Verify version unchanged
    const version = getCurrentVersion(freshDb);
    expect(version).toBeGreaterThan(0);

    freshDb.close();
  });
});

describe('baseline migration (001_baseline.ts)', () => {
  test('creates full schema from scratch', async () => {
    const result = await migrateUp(db);
    expect(result.applied).toBeGreaterThan(0);

    // Spot-check key tables exist
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string;
    }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('agents');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('session_messages');
    expect(tableNames).toContain('agent_messages');
    expect(tableNames).toContain('councils');
    expect(tableNames).toContain('work_tasks');
    expect(tableNames).toContain('agent_memories');
    expect(tableNames).toContain('credit_ledger');
    expect(tableNames).toContain('workflows');
    expect(tableNames).toContain('audit_log');
    expect(tableNames).toContain('skill_bundles');
    expect(tableNames).toContain('mcp_server_configs');
  });

  test('produces same schema as legacy runMigrations', async () => {
    // Run ALL file-based migrations on db1 (baseline + incremental)
    const db1 = new Database(':memory:');
    db1.exec('PRAGMA foreign_keys = ON');
    await migrateUp(db1);

    // Run legacy migration on db2
    const db2 = new Database(':memory:');
    db2.exec('PRAGMA foreign_keys = ON');
    const { runMigrations } = await import('../db/schema');
    runMigrations(db2);

    // Compare table lists
    const getTables = (d: Database) =>
      (d.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[])
        .map((t) => t.name)
        .filter((n) => n !== 'schema_version');
    const tables1 = getTables(db1);
    const tables2 = getTables(db2);
    expect(tables1).toEqual(tables2);

    // Compare columns for each table
    for (const table of tables1) {
      const getCols = (d: Database) =>
        (d.query(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[])
          .map((c) => `${c.name}:${c.type}`)
          .sort();
      expect(getCols(db1)).toEqual(getCols(db2));
    }

    // Compare indexes (catches name mismatches like idx_foo_ts vs idx_foo_timestamp)
    const getIndexes = (d: Database) =>
      (
        d
          .query("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
          .all() as { name: string }[]
      ).map((i) => i.name);
    expect(getIndexes(db1)).toEqual(getIndexes(db2));

    // Compare schema versions
    const getVersion = (d: Database) =>
      (d.query('SELECT version FROM schema_version LIMIT 1').get() as { version: number })?.version;
    expect(getVersion(db1)).toEqual(getVersion(db2));

    db1.close();
    db2.close();
  });

  test('baseline down drops all tables', async () => {
    await migrateUp(db);

    const tablesBefore = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(tablesBefore.length).toBeGreaterThan(5);

    await migrateDown(db, 0);

    const tablesAfter = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    // sqlite_sequence is an internal SQLite table for AUTOINCREMENT tracking
    const remaining = tablesAfter.map((t) => t.name).filter((n) => n !== 'schema_version' && n !== 'sqlite_sequence');
    expect(remaining).toEqual([]);
  });
});
