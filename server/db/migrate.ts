/**
 * File-based database migration system.
 *
 * Migrations live in server/db/migrations/ as TypeScript files.
 * Each migration exports:
 *   - up(db: Database): void   — apply the migration
 *   - down(db: Database): void — revert the migration
 *
 * The schema_version table (single-row, version INTEGER) remains the
 * source of truth for the current schema version, preserving compatibility
 * with the legacy inline migration system that shipped versions 1–52.
 */

import { Database } from 'bun:sqlite';
import { readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MigrationModule {
    up: (db: Database) => void;
    down: (db: Database) => void;
}

export interface MigrationEntry {
    version: number;
    name: string;
    filename: string;
}

export interface MigrationStatus {
    version: number;
    name: string;
    applied: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MIGRATION_DIR = resolve(import.meta.dir, 'migrations');

/** Filename pattern: NNN_description.ts  (e.g. 001_baseline.ts) */
const MIGRATION_RE = /^(\d{3})_(.+)\.ts$/;

/** Discover all migration files sorted by version. */
export function discoverMigrations(dir: string = MIGRATION_DIR): MigrationEntry[] {
    let files: string[];
    try {
        files = readdirSync(dir).sort();
    } catch {
        return [];
    }

    const entries: MigrationEntry[] = [];
    for (const f of files) {
        const m = MIGRATION_RE.exec(f);
        if (!m) continue;
        entries.push({
            version: parseInt(m[1], 10),
            name: m[2].replace(/_/g, ' '),
            filename: f,
        });
    }
    return entries;
}

/** Load a migration module by filename. */
async function loadMigration(filename: string, dir: string = MIGRATION_DIR): Promise<MigrationModule> {
    const mod = await import(join(dir, filename));
    if (typeof mod.up !== 'function' || typeof mod.down !== 'function') {
        throw new Error(`Migration ${filename} must export up(db) and down(db) functions`);
    }
    return mod as MigrationModule;
}

/** Ensure the schema_version table exists and return the current version. */
export function getCurrentVersion(db: Database): number {
    db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
    const row = db.query('SELECT version FROM schema_version LIMIT 1').get() as
        | { version: number }
        | null;
    return row?.version ?? 0;
}

function setVersion(db: Database, version: number, currentVersion: number): void {
    if (currentVersion === 0) {
        db.query('INSERT INTO schema_version (version) VALUES (?)').run(version);
    } else {
        db.query('UPDATE schema_version SET version = ?').run(version);
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Apply all pending migrations (or up to `target` version).
 * Returns the number of migrations applied.
 */
export async function migrateUp(
    db: Database,
    target?: number,
    dir?: string,
): Promise<{ applied: number; to: number }> {
    const current = getCurrentVersion(db);
    const migrations = discoverMigrations(dir);
    const pending = migrations.filter(
        (m) => m.version > current && (target === undefined || m.version <= target),
    );

    if (pending.length === 0) {
        return { applied: 0, to: current };
    }

    let lastVersion = current;
    for (const entry of pending) {
        const mod = await loadMigration(entry.filename, dir);
        db.transaction(() => {
            mod.up(db);
            setVersion(db, entry.version, lastVersion);
        })();
        lastVersion = entry.version;
    }

    return { applied: pending.length, to: lastVersion };
}

/**
 * Revert the most recent migration (or down to `target` version).
 * Returns the number of migrations reverted.
 */
export async function migrateDown(
    db: Database,
    target?: number,
    dir?: string,
): Promise<{ reverted: number; to: number }> {
    const current = getCurrentVersion(db);
    if (current === 0) return { reverted: 0, to: 0 };

    const migrations = discoverMigrations(dir);
    const effectiveTarget = target ?? current - 1;

    // Migrations to revert, in reverse order
    const toRevert = migrations
        .filter((m) => m.version <= current && m.version > effectiveTarget)
        .reverse();

    if (toRevert.length === 0) {
        return { reverted: 0, to: current };
    }

    let lastVersion = current;
    for (const entry of toRevert) {
        const mod = await loadMigration(entry.filename, dir);
        const newVersion = entry.version - 1;
        db.transaction(() => {
            mod.down(db);
            setVersion(db, newVersion, lastVersion);
        })();
        lastVersion = newVersion;
    }

    return { reverted: toRevert.length, to: lastVersion };
}

/**
 * Return the status of all known migrations.
 */
export function migrationStatus(db: Database, dir?: string): MigrationStatus[] {
    const current = getCurrentVersion(db);
    const migrations = discoverMigrations(dir);
    return migrations.map((m) => ({
        version: m.version,
        name: m.name,
        applied: m.version <= current,
    }));
}

/**
 * Run all pending migrations. Drop-in replacement for the legacy
 * runMigrations() — called from connection.ts on startup.
 */
export async function runPendingMigrations(db: Database): Promise<void> {
    const { applied } = await migrateUp(db);
    if (applied > 0) {
        console.log(`[migrate] Applied ${applied} migration(s)`);
    }
}
