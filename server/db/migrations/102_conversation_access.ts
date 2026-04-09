import type { Database } from 'bun:sqlite';

/**
 * Migration 102: Conversation access control — per-agent access modes,
 * allowlists, blocklists, and rate-limit tracking for conversational agents.
 *
 * Adds conversation_mode, rate limit config to agents table, and creates
 * per-agent allowlist, blocklist, and rate-limit tracking tables.
 */

function hasColumn(db: Database, table: string, column: string): boolean {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export function up(db: Database): void {
  // Add conversation access fields to agents table (idempotent)
  if (!hasColumn(db, 'agents', 'conversation_mode')) {
    db.exec(`ALTER TABLE agents ADD COLUMN conversation_mode TEXT NOT NULL DEFAULT 'private'`);
  }
  if (!hasColumn(db, 'agents', 'conversation_rate_limit_window')) {
    db.exec(`ALTER TABLE agents ADD COLUMN conversation_rate_limit_window INTEGER NOT NULL DEFAULT 3600`);
  }
  if (!hasColumn(db, 'agents', 'conversation_rate_limit_max')) {
    db.exec(`ALTER TABLE agents ADD COLUMN conversation_rate_limit_max INTEGER NOT NULL DEFAULT 10`);
  }

  // Per-agent conversation allowlist
  db.exec(`
        CREATE TABLE IF NOT EXISTS agent_conversation_allowlist (
            agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            address    TEXT NOT NULL,
            label      TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (agent_id, address)
        )
    `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_conv_allow_agent ON agent_conversation_allowlist(agent_id)`);

  // Per-agent conversation blocklist
  db.exec(`
        CREATE TABLE IF NOT EXISTS agent_conversation_blocklist (
            agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            address    TEXT NOT NULL,
            reason     TEXT DEFAULT 'manual',
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (agent_id, address)
        )
    `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_conv_block_agent ON agent_conversation_blocklist(agent_id)`);

  // Per-agent per-address rate-limit tracking
  db.exec(`
        CREATE TABLE IF NOT EXISTS agent_conversation_rate_limits (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id   TEXT NOT NULL,
            address    TEXT NOT NULL,
            message_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_conv_rate_agent_addr ON agent_conversation_rate_limits(agent_id, address)`,
  );
}

export function down(db: Database): void {
  db.exec('DROP TABLE IF EXISTS agent_conversation_rate_limits');
  db.exec('DROP TABLE IF EXISTS agent_conversation_blocklist');
  db.exec('DROP TABLE IF EXISTS agent_conversation_allowlist');

  // SQLite doesn't support DROP COLUMN before 3.35.0, but Bun ships 3.45+
  if (hasColumn(db, 'agents', 'conversation_mode')) {
    db.exec('ALTER TABLE agents DROP COLUMN conversation_mode');
  }
  if (hasColumn(db, 'agents', 'conversation_rate_limit_window')) {
    db.exec('ALTER TABLE agents DROP COLUMN conversation_rate_limit_window');
  }
  if (hasColumn(db, 'agents', 'conversation_rate_limit_max')) {
    db.exec('ALTER TABLE agents DROP COLUMN conversation_rate_limit_max');
  }
}
