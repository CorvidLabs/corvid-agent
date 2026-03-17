/**
 * Schema aggregator — collects domain-colocated schema definitions and
 * exposes runMigrations() for the rest of the codebase.
 *
 * Each domain file exports `tables` and `indexes` arrays (baseline v78)
 * plus optional migration arrays for later versions.
 */

import { Database } from 'bun:sqlite';

import * as agents from './agents';
import * as algochat from './algochat';
import * as auth from './auth';
import * as contacts from './contacts';
import * as councils from './councils';
import * as credits from './credits';
import * as discord from './discord';
import * as flock from './flock';
import * as infra from './infra';
import * as marketplace from './marketplace';
import * as memory from './memory';
import * as messaging from './messaging';
import * as permissions from './permissions';
import * as plugins from './plugins';
import * as projects from './projects';
import * as reputation from './reputation';
import * as schedules from './schedules';
import * as sessions from './sessions';
import * as webhooks from './webhooks';
import * as work from './work';
import * as workflows from './workflows';

const SCHEMA_VERSION = 92;

/**
 * Collapsed MIGRATIONS dict — single v78 entry containing all idempotent
 * CREATE TABLE/INDEX IF NOT EXISTS statements. Used by reconcileTables()
 * as a safety net; the actual schema creation is handled by the file-based
 * migration system (078_baseline.ts).
 *
 * This replaces the previous 78-entry MIGRATIONS dict that accumulated
 * ALTER TABLE, INSERT, DROP TABLE, and other non-idempotent statements
 * across incremental migrations. Since all columns are now included
 * directly in the CREATE TABLE statements, no ALTER TABLE is needed.
 */
const MIGRATIONS: Record<number, string[]> = {
    78: [
        // ── Tables (from domain modules) ─────────────────────────────────
        ...agents.tables,
        ...algochat.tables,
        ...auth.tables,
        ...councils.tables,
        ...credits.tables,
        ...flock.tables,
        ...infra.tables,
        ...marketplace.tables,
        ...memory.tables,
        ...messaging.tables,
        ...permissions.tables,
        ...plugins.tables,
        ...projects.tables,
        ...reputation.tables,
        ...schedules.tables,
        ...sessions.tables,
        ...webhooks.tables,
        ...work.tables,
        ...workflows.tables,

        // ── FTS virtual table ────────────────────────────────────────────
        ...memory.ftsStatements,

        // ── Indexes (from domain modules) ────────────────────────────────
        ...agents.indexes,
        ...algochat.indexes,
        ...auth.indexes,
        ...councils.indexes,
        ...credits.indexes,
        ...flock.indexes,
        ...infra.indexes,
        ...marketplace.indexes,
        ...memory.indexes,
        ...messaging.indexes,
        ...permissions.indexes,
        ...plugins.indexes,
        ...projects.indexes,
        ...reputation.indexes,
        ...schedules.indexes,
        ...sessions.indexes,
        ...webhooks.indexes,
        ...work.indexes,
        ...workflows.indexes,

        // ── FTS5 virtual table (duplicate safe) ──────────────────────────
        `CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_fts USING fts5(
            key, content, content=agent_memories, content_rowid=rowid
        )`,

        // ── FTS sync triggers ────────────────────────────────────────────
        ...memory.ftsTriggers,

        // ── Seed data ────────────────────────────────────────────────────
        ...credits.seeds,
        ...plugins.seeds,
    ],

    // ── Post-baseline migrations (domain-owned) ──────────────────────────
    79: [...flock.migrationV79],
    80: [...discord.migrationV80],
    84: [...flock.migrationV84],
    89: [...flock.migrationV89],
    90: [...reputation.migrationV90],
    91: [...contacts.migrationV91],
    92: [...discord.migrationV92],
};

/** Allowlist pattern for valid SQL identifiers (table/column names). */
const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

function hasColumn(db: Database, table: string, column: string): boolean {
    if (!SAFE_SQL_IDENTIFIER.test(table)) {
        throw new Error(`hasColumn: invalid table name '${table}'`);
    }
    const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return cols.some((c) => c.name === column);
}

export function runMigrations(db: Database): void {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`);

    const row = db.query('SELECT version FROM schema_version LIMIT 1').get() as
        | { version: number }
        | null;
    const currentVersion = row?.version ?? 0;

    if (currentVersion < SCHEMA_VERSION) {
        db.transaction(() => {
            for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
                const statements = MIGRATIONS[v];
                if (!statements) continue;
                for (const sql of statements) {
                    // Skip ALTER TABLE ADD COLUMN if the column already exists
                    const alterMatch = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
                    if (alterMatch && hasColumn(db, alterMatch[1], alterMatch[2])) {
                        continue;
                    }
                    db.exec(sql);
                }
            }

            if (currentVersion === 0) {
                db.query('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
            } else {
                db.query('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
            }
        })();
    }

    // Safety net: re-run all idempotent CREATE TABLE/INDEX IF NOT EXISTS
    // statements regardless of version. This catches tables that were missed
    // when the schema_version was bumped by file-based migrations before the
    // corresponding inline migration was added (see #368).
    reconcileTables(db);
}

const IDEMPOTENT_CREATE_TABLE = /^\s*CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i;
const IDEMPOTENT_CREATE_INDEX = /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i;
const IDEMPOTENT_CREATE_VTABLE = /^\s*CREATE\s+VIRTUAL\s+TABLE\s+IF\s+NOT\s+EXISTS/i;
const IDEMPOTENT_CREATE_TRIGGER = /^\s*CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS/i;
const IDEMPOTENT_INSERT_OR_IGNORE = /^\s*INSERT\s+OR\s+IGNORE\s+INTO/i;

function reconcileTables(db: Database): void {
    for (const statements of Object.values(MIGRATIONS)) {
        for (const sql of statements) {
            // Always reconcile CREATE INDEX IF NOT EXISTS
            if (IDEMPOTENT_CREATE_INDEX.test(sql)) {
                try { db.exec(sql); } catch { /* column may not exist yet */ }
                continue;
            }
            // Reconcile CREATE TABLE IF NOT EXISTS
            if (IDEMPOTENT_CREATE_TABLE.test(sql)) {
                db.exec(sql);
                continue;
            }
            // Reconcile CREATE VIRTUAL TABLE IF NOT EXISTS
            if (IDEMPOTENT_CREATE_VTABLE.test(sql)) {
                try { db.exec(sql); } catch { /* table may already exist */ }
                continue;
            }
            // Reconcile CREATE TRIGGER IF NOT EXISTS
            if (IDEMPOTENT_CREATE_TRIGGER.test(sql)) {
                try { db.exec(sql); } catch { /* trigger may already exist */ }
                continue;
            }
            // Reconcile INSERT OR IGNORE (seed data)
            if (IDEMPOTENT_INSERT_OR_IGNORE.test(sql)) {
                try { db.exec(sql); } catch { /* table may not exist yet */ }
            }
        }
    }
}
