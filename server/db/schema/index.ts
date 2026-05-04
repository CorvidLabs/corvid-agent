/**
 * Database schema — aggregator.
 *
 * Domain-specific table and index definitions live in co-located files
 * (e.g. ./agents.ts, ./councils.ts). This module imports them all,
 * assembles the MIGRATIONS dict, and exports `runMigrations`.
 */
import type { Database } from 'bun:sqlite';

import * as agents from './agents';
import * as algochat from './algochat';
import * as auth from './auth';
import * as buddy from './buddy';
import * as contacts from './contacts';
import * as councils from './councils';
import * as credits from './credits';
import * as discord from './discord';
import * as flock from './flock';
import * as library from './library';
import * as marketplace from './marketplace';
import * as memory from './memory';
import * as modelExams from './model-exams';
import * as monitoring from './monitoring';
import * as notifications from './notifications';
import * as projects from './projects';
import * as reputation from './reputation';
import * as schedules from './schedules';
import * as sessions from './sessions';
import * as telegram from './telegram';
import * as webhooks from './webhooks';
import * as work from './work';
import * as workflows from './workflows';

// ── Domain modules (order: tables first, then indexes) ──────────────

const domains = [
  agents,
  algochat,
  auth,
  buddy,
  contacts,
  councils,
  credits,
  discord,
  flock,
  library,
  marketplace,
  memory,
  modelExams,
  monitoring,
  notifications,
  projects,
  reputation,
  schedules,
  sessions,
  telegram,
  webhooks,
  work,
  workflows,
] as const;

type Domain = {
  tables: string[];
  indexes: string[];
  virtualTables?: string[];
  triggers?: string[];
  seedData?: string[];
};

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
    // Agent variant profiles: preset skill + persona combinations
    ...agents.tables.filter((s) => s.includes('agent_variants') || s.includes('agent_variant_assignments')),
    ...agents.indexes.filter((s) => s.includes('agent_variant_assignments')),
  ],
  102: [
    // Per-agent conversation access control: mode, allowlist, blocklist, rate limits
    `ALTER TABLE agents ADD COLUMN conversation_mode TEXT NOT NULL DEFAULT 'private'`,
    `ALTER TABLE agents ADD COLUMN conversation_rate_limit_window INTEGER NOT NULL DEFAULT 3600`,
    `ALTER TABLE agents ADD COLUMN conversation_rate_limit_max INTEGER NOT NULL DEFAULT 10`,
    ...agents.tables.filter((s) => s.includes('agent_conversation_')),
    ...agents.indexes.filter((s) => s.includes('agent_conv_')),
  ],
  103: [
    // Persist Discord muted users across restarts
    ...discord.tables.filter((s) => s.includes('discord_muted_users')),
  ],
  104: [
    // Buddy mode: paired agent collaboration
    ...buddy.tables,
    ...buddy.indexes,
  ],
  105: [
    // Session restart recovery flag
    `ALTER TABLE sessions ADD COLUMN restart_pending INTEGER NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_restart_pending ON sessions(restart_pending) WHERE restart_pending = 1`,
  ],
  106: [
    // CRVLIB: shared agent knowledge library (plaintext ARC-69 ASAs)
    ...library.tables,
    ...library.indexes,
  ],
  107: [
    // Session server-restart tracking (prevents agent restart loops)
    `ALTER TABLE sessions ADD COLUMN server_restart_initiated_at TEXT DEFAULT NULL`,
  ],
  108: [
    // Memory book/page: organize memories into named books with ordered pages
    `ALTER TABLE agent_memories ADD COLUMN book TEXT DEFAULT NULL`,
    `ALTER TABLE agent_memories ADD COLUMN page INTEGER DEFAULT NULL`,
    ...memory.indexes.filter((s) => s.includes('book_page')),
    ...memory.triggers.filter((s) => s.includes('book_page')),
  ],
  109: [
    // Persist processed Discord message IDs across restarts (prevents duplicate handling)
    ...discord.tables.filter((s) => s.includes('discord_processed_messages')),
    ...discord.indexes.filter((s) => s.includes('discord_processed_messages')),
  ],
  110: [
    // Conversation summary for Discord session context carry-over
    `ALTER TABLE sessions ADD COLUMN conversation_summary TEXT DEFAULT NULL`,
  ],
  111: [
    // Library entry titles
    `ALTER TABLE agent_library ADD COLUMN title TEXT DEFAULT NULL`,
  ],
  112: [
    // Thread session persistence: dedicated table + unified activity tracking
    ...discord.tables.filter((s) => s.includes('discord_thread_sessions')),
    ...discord.indexes.filter((s) => s.includes('discord_thread_sessions')),
    `ALTER TABLE discord_mention_sessions ADD COLUMN last_activity_at TEXT DEFAULT (datetime('now'))`,
  ],
  113: [
    // Short-term memory decay: TTL and access-count tracking on agent_memories
    `ALTER TABLE agent_memories ADD COLUMN expires_at TEXT DEFAULT NULL`,
    `UPDATE agent_memories SET expires_at = datetime(updated_at, '+7 days') WHERE status = 'short_term'`,
    `CREATE INDEX IF NOT EXISTS idx_agent_memories_expires ON agent_memories(expires_at) WHERE expires_at IS NOT NULL`,
    `ALTER TABLE agent_memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0`,
  ],
  114: [
    // Proxy trust mode: email-based tenant member lookup for oauth2-proxy deployments.
    // Allows X-Forwarded-Email header (when TRUST_PROXY=1) to identify tenant members
    // without requiring an API key (the proxy already authenticated the user).
    `ALTER TABLE tenant_members ADD COLUMN email TEXT DEFAULT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_members_email ON tenant_members(tenant_id, email) WHERE email IS NOT NULL`,
  ],
  115: [
    // Fix duplicate AlgoChat conversations: enforce unique participant_addr
    `DELETE FROM algochat_conversations WHERE id NOT IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY participant_addr ORDER BY created_at DESC) AS rn FROM algochat_conversations) WHERE rn = 1)`,
    `DROP INDEX IF EXISTS idx_algochat_participant`,
    `CREATE UNIQUE INDEX idx_algochat_participant ON algochat_conversations(participant_addr)`,
  ],
  116: [
    // Governance voting periods and vetoes
    `ALTER TABLE governance_proposals ADD COLUMN voting_opened_at TEXT DEFAULT NULL`,
    `ALTER TABLE governance_proposals ADD COLUMN voting_deadline TEXT DEFAULT NULL`,
    ...councils.tables.filter((s) => s.includes('proposal_vetoes')),
    ...councils.indexes.filter((s) => s.includes('proposal_vetoes')),
  ],
  117: [
    // Channel-project affinity: tracks which project was last used in each Discord channel
    `CREATE TABLE IF NOT EXISTS discord_channel_project (
      channel_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  ],
  118: [
    // Durable conversation summary on thread sessions for context carry-over
    `ALTER TABLE discord_thread_sessions ADD COLUMN last_summary TEXT DEFAULT NULL`,
  ],
  119: [
    // Telegram runtime configuration (mirrors discord_config pattern)
    ...telegram.tables,
  ],
  120: [
    // Add channel_id to memory observations for channel-scoped context
    `ALTER TABLE memory_observations ADD COLUMN channel_id TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_observations_channel_id ON memory_observations(channel_id) WHERE channel_id IS NOT NULL`,
  ],
  121: [
    // Work task attestations: on-chain records of task completion/failure
    `CREATE TABLE IF NOT EXISTS work_task_attestations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     TEXT NOT NULL,
      agent_id    TEXT NOT NULL,
      outcome     TEXT NOT NULL CHECK (outcome IN ('completed', 'failed')),
      pr_url      TEXT,
      duration_ms INTEGER,
      hash        TEXT NOT NULL,
      payload     TEXT NOT NULL,
      txid        TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      published_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_work_task_attestations_task_id ON work_task_attestations(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_work_task_attestations_agent_id ON work_task_attestations(agent_id)`,
  ],
  122: [
    // Memory attestations: on-chain verifiable records of memory promotion events
    `CREATE TABLE IF NOT EXISTS memory_attestations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_key   TEXT NOT NULL,
      agent_id     TEXT NOT NULL,
      hash         TEXT NOT NULL,
      payload      TEXT NOT NULL,
      txid         TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      published_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_memory_attestations_agent_id ON memory_attestations(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_memory_attestations_key ON memory_attestations(memory_key)`,
  ],
  123: [
    `CREATE TABLE IF NOT EXISTS activity_summaries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      period       TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end   TEXT NOT NULL,
      payload      TEXT NOT NULL,
      hash         TEXT NOT NULL,
      txid         TEXT,
      published_at TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_activity_summaries_period ON activity_summaries(period)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_summaries_hash ON activity_summaries(hash)`,
  ],
  124: [
    `ALTER TABLE sessions ADD COLUMN last_context_tokens INTEGER`,
    `ALTER TABLE sessions ADD COLUMN last_context_window INTEGER`,
  ],
  125: [`ALTER TABLE sessions ADD COLUMN cumulative_turns INTEGER DEFAULT 0`],
  126: [`ALTER TABLE councils ADD COLUMN min_trust_level TEXT`],
  127: [`ALTER TABLE sessions ADD COLUMN keep_alive INTEGER NOT NULL DEFAULT 0`],
  128: [
    `ALTER TABLE sessions ADD COLUMN active_duration_ms INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN duration_checkpoint INTEGER`,
  ],
};

// ── Schema version ──────────────────────────────────────────────────
// Derived from MIGRATIONS keys so runMigrations cannot advance schema_version
// past what it actually has statements for. File-based migrations beyond this
// version are handled by migrate.ts:migrateUp.
const SCHEMA_VERSION = Math.max(...Object.keys(MIGRATIONS).map(Number));

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

  const row = db.query('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | null;
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
        try {
          db.exec(sql);
        } catch {
          /* column may not exist yet */
        }
        continue;
      }
      // Reconcile CREATE TABLE IF NOT EXISTS
      if (IDEMPOTENT_CREATE_TABLE.test(sql)) {
        db.exec(sql);
        continue;
      }
      // Reconcile CREATE VIRTUAL TABLE IF NOT EXISTS
      if (IDEMPOTENT_CREATE_VTABLE.test(sql)) {
        try {
          db.exec(sql);
        } catch {
          /* table may already exist */
        }
        continue;
      }
      // Reconcile CREATE TRIGGER IF NOT EXISTS
      if (IDEMPOTENT_CREATE_TRIGGER.test(sql)) {
        try {
          db.exec(sql);
        } catch {
          /* trigger may already exist */
        }
        continue;
      }
      // Reconcile INSERT OR IGNORE (seed data)
      if (IDEMPOTENT_INSERT_OR_IGNORE.test(sql)) {
        try {
          db.exec(sql);
        } catch {
          /* table may not exist yet */
        }
      }
    }
  }
}
