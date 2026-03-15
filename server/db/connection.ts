import { Database } from 'bun:sqlite';
import { chmodSync, existsSync } from 'node:fs';
import { runMigrations } from './schema';
import { migrateUp, getCurrentVersion, discoverMigrations } from './migrate';
import { initCreditConfigFromEnv } from './credits';
import { DbPool, writeTransaction } from './pool';
import type { WriteTransactionOptions } from './pool';

let db: Database | null = null;
let _initPromise: Promise<void> | null = null;
let _pool: DbPool | null = null;

function setDbFilePermissions(path: string): void {
    try {
        if (existsSync(path)) chmodSync(path, 0o600);
        if (existsSync(`${path}-wal`)) chmodSync(`${path}-wal`, 0o600);
        if (existsSync(`${path}-shm`)) chmodSync(`${path}-shm`, 0o600);
    } catch {
        // chmod may fail on some platforms (Windows) — non-fatal
    }
}

/**
 * Get the database connection. The first call initialises the DB:
 *  1. Legacy inline migrations (v1–52) run synchronously.
 *  2. File-based migrations (v53+) run asynchronously via initDb().
 *
 * The returned Database is usable immediately — legacy migrations
 * ensure the v1–52 schema is present. Call `await initDb()` early
 * in your startup to also apply any newer file-based migrations.
 */
export function getDb(path?: string): Database {
    if (db) return db;

    const isTest = process.env.BUN_TEST === '1' || process.env.NODE_ENV === 'test';
    const defaultPath = isTest || process.env.TRY_MODE === 'true' ? ':memory:' : 'corvid-agent.db';
    const dbPath = path ?? process.env.DATABASE_PATH ?? defaultPath;
    db = new Database(dbPath, { create: true });
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    initCreditConfigFromEnv(db);

    if (dbPath !== ':memory:') {
        setDbFilePermissions(dbPath);
    }

    return db;
}

/**
 * Run any file-based migrations beyond the legacy schema version.
 * Call this once during server startup (after getDb()).
 * Safe to call multiple times — only runs pending migrations.
 */
export async function initDb(): Promise<void> {
    if (!_initPromise) {
        _initPromise = (async () => {
            const d = getDb();
            const migrations = discoverMigrations();
            const current = getCurrentVersion(d);
            // Only run file-based migrations newer than the current version
            const pending = migrations.filter((m) => m.version > current);
            if (pending.length > 0) {
                const { applied, to } = await migrateUp(d);
                if (applied > 0) {
                    console.log(`[migrate] Applied ${applied} file-based migration(s), now at version ${to}`);
                }
            }
        })();
        _initPromise.catch(() => {
            _initPromise = null; // Allow retry on next call
        });
    }
    return _initPromise;
}

/**
 * Get or create a connection pool for the current database.
 * The pool provides separate read and write connections with
 * BEGIN IMMEDIATE transactions and SQLITE_BUSY retry logic.
 */
export function getDbPool(options?: { maxReadConnections?: number }): DbPool {
    if (_pool) return _pool;

    const d = getDb();
    const dbPath = (d as unknown as { filename: string }).filename;

    // In-memory databases can't use a pool (no file to share)
    if (!dbPath || dbPath === ':memory:' || dbPath === '') {
        // Return a minimal pool backed by the singleton
        _pool = new DbPool({
            path: ':memory:',
            maxReadConnections: 1,
        });
        return _pool;
    }

    _pool = new DbPool({
        path: dbPath,
        maxReadConnections: options?.maxReadConnections ?? 4,
    });

    return _pool;
}

/**
 * Execute `fn` inside a BEGIN IMMEDIATE write transaction with SQLITE_BUSY
 * retry. Use this instead of `db.transaction()` for all write operations.
 *
 * @see server/db/pool.ts for implementation details.
 */
export function dbWriteTransaction<T>(fn: (db: Database) => T, options?: WriteTransactionOptions): T {
    return writeTransaction(getDb(), fn, options);
}

export function closeDb(): void {
    if (_pool) {
        _pool.close();
        _pool = null;
    }
    if (db) {
        db.close();
        db = null;
        _initPromise = null;
    }
}
