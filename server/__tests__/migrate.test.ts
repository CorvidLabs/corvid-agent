import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    migrateUp,
    migrateDown,
    migrationStatus,
    getCurrentVersion,
    discoverMigrations,
} from '../db/migrate';

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
        try { rmSync(tempDir, { recursive: true }); } catch {}
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
        const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
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
        writeMigration(dir, '001_create_users.ts', 'CREATE TABLE users (id INTEGER PRIMARY KEY)', 'DROP TABLE IF EXISTS users');
        writeMigration(dir, '002_create_posts.ts', 'CREATE TABLE posts (id INTEGER PRIMARY KEY)', 'DROP TABLE IF EXISTS posts');

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
        writeMigration(dir, '001_create_users.ts', 'CREATE TABLE users (id INTEGER PRIMARY KEY)', 'DROP TABLE IF EXISTS users');
        writeMigration(dir, '002_create_posts.ts', 'CREATE TABLE posts (id INTEGER PRIMARY KEY)', 'DROP TABLE IF EXISTS posts');
        writeMigration(dir, '003_create_tags.ts', 'CREATE TABLE tags (id INTEGER PRIMARY KEY)', 'DROP TABLE IF EXISTS tags');

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

describe('baseline migration (001_baseline.ts)', () => {
    test('creates full schema from scratch', async () => {
        const result = await migrateUp(db);
        expect(result.applied).toBeGreaterThan(0);

        // Spot-check key tables exist
        const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
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
