import { Database } from 'bun:sqlite';
import { chmodSync, existsSync } from 'node:fs';
import { runMigrations } from './schema';
import { migrateUp, getCurrentVersion, discoverMigrations } from './migrate';
import { initCreditConfigFromEnv } from './credits';

let db: Database | null = null;
let _initPromise: Promise<void> | null = null;

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
export function getDb(path: string = process.env.DB_PATH ?? 'corvid-agent.db'): Database {
    if (db) return db;

    db = new Database(path, { create: true });
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    initCreditConfigFromEnv(db);

    setDbFilePermissions(path);

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
    }
    return _initPromise;
}

export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
        _initPromise = null;
    }
}
