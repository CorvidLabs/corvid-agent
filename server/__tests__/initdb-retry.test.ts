/**
 * Tests the initDb() retry-on-failure behaviour in connection.ts.
 *
 * Uses mock.module to make migrateUp throw on the first call, verifying
 * that the .catch handler resets _initPromise so subsequent calls retry.
 *
 * Isolated in its own file to prevent mock.module from leaking into other tests.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

let migrateUpCallCount = 0;
let shouldFail = true;

// Must mock BEFORE connection.ts is imported
mock.module('../db/migrate', () => {
    // Re-implement just enough of the real module for connection.ts
    const { existsSync, readdirSync } = require('node:fs');
    const { join } = require('node:path');
    const MIGRATION_DIR = join(__dirname, '..', 'db', 'migrations');

    function discoverMigrations(dir: string = MIGRATION_DIR) {
        if (!existsSync(dir)) return [];
        const files = readdirSync(dir).filter((f: string) => /^\d{3}_.*\.ts$/.test(f)).sort();
        return files.map((f: string) => ({
            version: parseInt(f.split('_')[0], 10),
            name: f.replace(/^\d{3}_/, '').replace(/\.ts$/, '').replace(/_/g, ' '),
            filename: f,
        }));
    }

    function getCurrentVersion(db: { query: (sql: string) => { get: () => unknown } }) {
        try {
            const row = db.query('SELECT MAX(version) as v FROM migration_history').get() as { v: number } | null;
            return row?.v ?? 0;
        } catch {
            return 0;
        }
    }

    return {
        discoverMigrations,
        getCurrentVersion,
        migrateDown: () => Promise.resolve({ applied: 0, to: 0 }),
        migrationStatus: () => [],
        runPendingMigrations: () => Promise.resolve(),
        migrateUp: () => {
            migrateUpCallCount++;
            if (shouldFail) {
                return Promise.reject(new Error('Simulated migration failure'));
            }
            return Promise.resolve({ applied: 0, to: 0 });
        },
    };
});

// Import AFTER mock.module so the mock is in effect
const { initDb, closeDb, getDb } = await import('../db/connection');

beforeEach(() => {
    migrateUpCallCount = 0;
    shouldFail = true;
    closeDb();
    getDb();
});

test('initDb resets cached promise on failure, allowing retry', async () => {
    // First call should fail (migrateUp throws)
    let firstError: Error | null = null;
    try {
        await initDb();
    } catch (err) {
        firstError = err as Error;
    }
    expect(firstError).not.toBeNull();
    expect(firstError!.message).toBe('Simulated migration failure');
    expect(migrateUpCallCount).toBeGreaterThanOrEqual(1);

    // Wait a tick for the .catch handler to reset _initPromise
    await new Promise((r) => setTimeout(r, 0));

    // Allow retry to succeed
    shouldFail = false;

    // Second call should retry (not return the cached rejection)
    await initDb();
    expect(migrateUpCallCount).toBeGreaterThanOrEqual(2);

    closeDb();
});
