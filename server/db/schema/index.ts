/**
 * Database schema — aggregator.
 *
 * Domain-specific table and index definitions live in co-located files
 * (e.g. ./agents.ts, ./councils.ts). This module imports them all,
 * assembles the MIGRATIONS dict, and exports `runMigrations`.
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
import * as marketplace from './marketplace';
import * as memory from './memory';
import * as modelExams from './model-exams';
import * as monitoring from './monitoring';
import * as notifications from './notifications';
import * as projects from './projects';
import * as reputation from './reputation';
import * as schedules from './schedules';
import * as sessions from './sessions';
import * as webhooks from './webhooks';
import * as work from './work';
import * as workflows from './workflows';

// ── Domain modules (order: tables first, then indexes) ──────────────

const domains = [
    agents, algochat, auth, contacts, councils, credits, discord, flock,
    marketplace, memory, modelExams, monitoring, notifications, projects,
    reputation, schedules, sessions, webhooks, work, workflows,
] as const;

type Domain = {
    tables: string[];
    indexes: string[];
    virtualTables?: string[];
    triggers?: string[];
    seedData?: string[];
};

// ── Schema version (bump when adding new migrations) ────────────────

const SCHEMA_VERSION = 99;

// ── Build MIGRATIONS dict ───────────────────────────────────────────

/**
 * Collapsed MIGRATIONS dict — single v78 entry containing all idempotent
 * CREATE TABLE/INDEX IF NOT EXISTS statements. Used by reconcileTables()
 * as a safety net; the actual schema creation is handled by the file-based
 * migration system (078_baseline.ts).
 *
 * Domain-specific SQL is imported from co-located schema files and merged
 * here at module load time.
 */
const MIGRATIONS: Record<number, string[]> = {
    78: [
        // Tables from all domains
        ...(domains as readonly Domain[]).flatMap((d) => d.tables),
        // Virtual tables (FTS)
        ...(domains as readonly Domain[]).flatMap((d) => d.virtualTables ?? []),
        // Indexes from all domains
        ...(domains as readonly Domain[]).flatMap((d) => d.indexes),
        // FTS sync triggers
        ...(domains as readonly Domain[]).flatMap((d) => d.triggers ?? []),
        // Seed data
        ...(domains as readonly Domain[]).flatMap((d) => d.seedData ?? []),
    ],

    // Incremental migrations kept for version tracking.
    // Tables/indexes are already included in domain files and reconciled
    // via reconcileTables(), but these entries ensure the version counter
    // advances correctly for existing databases upgrading through each step.
    79: [...flock.tables.filter((s) => s.includes('flock_directory_config'))],
    80: [...discord.tables.filter((s) => s.includes('discord_config'))],
    84: [...modelExams.tables, ...modelExams.indexes],
    89: [
        ...flock.tables.filter((s) => s.includes('flock_test')),
        ...flock.indexes.filter((s) => s.includes('flock_test')),
    ],
    90: [
        ...reputation.tables.filter((s) => s.includes('response_feedback')),
        ...reputation.indexes.filter((s) => s.includes('response_feedback')),
    ],
    91: [...contacts.tables, ...contacts.indexes],
    92: [
        ...discord.tables.filter((s) => s.includes('discord_mention')),
        ...discord.indexes.filter((s) => s.includes('discord_mention')),
    ],
    93: [
        // Add project_name to mention sessions for Discord footer metadata
        `ALTER TABLE discord_mention_sessions ADD COLUMN project_name TEXT`,
    ],
    94: [
        // ARC-69 long-term memory: add ASA ID column
        `ALTER TABLE agent_memories ADD COLUMN asa_id INTEGER DEFAULT NULL`,
    ],
    95: [
        // Memory observations: short-term insights for graduation to long-term
        ...memory.tables.filter((s) => s.includes('memory_observations')),
        ...memory.indexes.filter((s) => s.includes('observations')),
    ],
    96: [
        // Add channel_id to mention sessions for channel tracking
        `ALTER TABLE discord_mention_sessions ADD COLUMN channel_id TEXT`,
    ],
    97: [
        // Add conversation_only to mention sessions for /message command tracking
        `ALTER TABLE discord_mention_sessions ADD COLUMN conversation_only INTEGER DEFAULT 0`,
    ],
    98: [
        // Add output_destinations to schedules for routing results to Discord/AlgoChat
        `ALTER TABLE agent_schedules ADD COLUMN output_destinations TEXT DEFAULT NULL`,
    ],
    99: [
        // Composable personas: standalone personas table + many-to-many assignments
        // The old agent_personas table is dropped by the file-based migration;
        // the new tables are already in the agents schema domain.
        ...agents.tables.filter((s) => s.includes('personas') || s.includes('agent_persona_assignments')),
        ...agents.indexes.filter((s) => s.includes('agent_persona_assignments')),
    ],
    100: [
        // Agent blocklist: kill switch for malicious agents
        ...reputation.tables.filter((s) => s.includes('agent_blocklist')),
        ...reputation.indexes.filter((s) => s.includes('agent_blocklist')),
    ],
};

// ── Migration helpers ───────────────────────────────────────────────

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

// ── Reconciliation regexes ──────────────────────────────────────────

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
