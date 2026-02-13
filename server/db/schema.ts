import { Database } from 'bun:sqlite';

const SCHEMA_VERSION = 27;

const MIGRATIONS: Record<number, string[]> = {
    1: [
        `CREATE TABLE IF NOT EXISTS projects (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT DEFAULT '',
            working_dir TEXT NOT NULL,
            claude_md   TEXT DEFAULT '',
            env_vars    TEXT DEFAULT '{}',
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS agents (
            id                TEXT PRIMARY KEY,
            name              TEXT NOT NULL,
            description       TEXT DEFAULT '',
            system_prompt     TEXT DEFAULT '',
            append_prompt     TEXT DEFAULT '',
            model             TEXT DEFAULT '',
            allowed_tools     TEXT DEFAULT '',
            disallowed_tools  TEXT DEFAULT '',
            permission_mode   TEXT DEFAULT 'default',
            max_budget_usd    REAL DEFAULT NULL,
            algochat_enabled  INTEGER DEFAULT 0,
            algochat_auto     INTEGER DEFAULT 0,
            custom_flags      TEXT DEFAULT '{}',
            created_at        TEXT DEFAULT (datetime('now')),
            updated_at        TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS sessions (
            id              TEXT PRIMARY KEY,
            project_id      TEXT NOT NULL REFERENCES projects(id),
            agent_id        TEXT REFERENCES agents(id),
            name            TEXT DEFAULT '',
            status          TEXT DEFAULT 'idle',
            source          TEXT DEFAULT 'web',
            initial_prompt  TEXT DEFAULT '',
            pid             INTEGER DEFAULT NULL,
            total_cost_usd  REAL DEFAULT 0,
            total_turns     INTEGER DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS session_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL REFERENCES sessions(id),
            role        TEXT NOT NULL,
            content     TEXT NOT NULL,
            cost_usd    REAL DEFAULT 0,
            timestamp   TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS algochat_conversations (
            id                TEXT PRIMARY KEY,
            participant_addr  TEXT NOT NULL,
            agent_id          TEXT REFERENCES agents(id),
            session_id        TEXT REFERENCES sessions(id),
            last_round        INTEGER DEFAULT 0,
            created_at        TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id)`,
        `CREATE INDEX IF NOT EXISTS idx_algochat_participant ON algochat_conversations(participant_addr)`,
    ],
    2: [
        `CREATE TABLE IF NOT EXISTS algochat_psk_state (
            address           TEXT PRIMARY KEY,
            initial_psk       BLOB NOT NULL,
            label             TEXT DEFAULT '',
            send_counter      INTEGER DEFAULT 0,
            peer_last_counter INTEGER DEFAULT 0,
            seen_counters     TEXT DEFAULT '[]',
            last_round        INTEGER DEFAULT 0,
            created_at        TEXT DEFAULT (datetime('now')),
            updated_at        TEXT DEFAULT (datetime('now'))
        )`,
    ],
    3: [
        `ALTER TABLE agents ADD COLUMN wallet_address TEXT DEFAULT NULL`,
        `ALTER TABLE agents ADD COLUMN wallet_mnemonic_encrypted TEXT DEFAULT NULL`,
        `ALTER TABLE agents ADD COLUMN wallet_funded_algo REAL DEFAULT 0`,
    ],
    4: [
        `CREATE TABLE IF NOT EXISTS agent_messages (
            id              TEXT PRIMARY KEY,
            from_agent_id   TEXT NOT NULL,
            to_agent_id     TEXT NOT NULL,
            content         TEXT NOT NULL,
            payment_micro   INTEGER DEFAULT 0,
            txid            TEXT DEFAULT NULL,
            status          TEXT DEFAULT 'pending',
            response        TEXT DEFAULT NULL,
            response_txid   TEXT DEFAULT NULL,
            session_id      TEXT DEFAULT NULL,
            created_at      TEXT DEFAULT (datetime('now')),
            completed_at    TEXT DEFAULT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_agent_messages_status ON agent_messages(status)`,
    ],
    5: [
        `CREATE TABLE IF NOT EXISTS councils (
            id                TEXT PRIMARY KEY,
            name              TEXT NOT NULL,
            description       TEXT DEFAULT '',
            chairman_agent_id TEXT DEFAULT NULL REFERENCES agents(id),
            created_at        TEXT DEFAULT (datetime('now')),
            updated_at        TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS council_members (
            council_id  TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
            agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            sort_order  INTEGER DEFAULT 0,
            PRIMARY KEY (council_id, agent_id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_council_members_council ON council_members(council_id)`,
        `CREATE TABLE IF NOT EXISTS council_launches (
            id          TEXT PRIMARY KEY,
            council_id  TEXT NOT NULL REFERENCES councils(id),
            project_id  TEXT NOT NULL REFERENCES projects(id),
            prompt      TEXT NOT NULL,
            stage       TEXT DEFAULT 'responding',
            synthesis   TEXT DEFAULT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_council_launches_council ON council_launches(council_id)`,
        `ALTER TABLE sessions ADD COLUMN council_launch_id TEXT DEFAULT NULL REFERENCES council_launches(id)`,
        `ALTER TABLE sessions ADD COLUMN council_role TEXT DEFAULT NULL`,
        `CREATE INDEX IF NOT EXISTS idx_sessions_council_launch ON sessions(council_launch_id)`,
    ],
    6: [
        `CREATE TABLE IF NOT EXISTS council_launch_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            launch_id   TEXT NOT NULL REFERENCES council_launches(id) ON DELETE CASCADE,
            level       TEXT DEFAULT 'info',
            message     TEXT NOT NULL,
            detail      TEXT DEFAULT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_council_launch_logs_launch ON council_launch_logs(launch_id)`,
    ],
    7: [
        `ALTER TABLE agents ADD COLUMN default_project_id TEXT DEFAULT NULL`,
    ],
    8: [
        `CREATE TABLE IF NOT EXISTS work_tasks (
            id              TEXT PRIMARY KEY,
            agent_id        TEXT NOT NULL REFERENCES agents(id),
            project_id      TEXT NOT NULL REFERENCES projects(id),
            session_id      TEXT DEFAULT NULL,
            source          TEXT DEFAULT 'web',
            source_id       TEXT DEFAULT NULL,
            requester_info  TEXT DEFAULT '{}',
            description     TEXT NOT NULL,
            branch_name     TEXT DEFAULT NULL,
            status          TEXT DEFAULT 'pending',
            pr_url          TEXT DEFAULT NULL,
            summary         TEXT DEFAULT NULL,
            error           TEXT DEFAULT NULL,
            created_at      TEXT DEFAULT (datetime('now')),
            completed_at    TEXT DEFAULT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_work_tasks_agent ON work_tasks(agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_work_tasks_status ON work_tasks(status)`,
        `CREATE INDEX IF NOT EXISTS idx_work_tasks_session ON work_tasks(session_id)`,
    ],
    9: [
        `ALTER TABLE councils ADD COLUMN discussion_rounds INTEGER DEFAULT 2`,
        `ALTER TABLE council_launches ADD COLUMN current_discussion_round INTEGER DEFAULT 0`,
        `ALTER TABLE council_launches ADD COLUMN total_discussion_rounds INTEGER DEFAULT 0`,
        `CREATE TABLE IF NOT EXISTS council_discussion_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            launch_id   TEXT NOT NULL REFERENCES council_launches(id) ON DELETE CASCADE,
            agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            agent_name  TEXT NOT NULL,
            round       INTEGER NOT NULL,
            content     TEXT NOT NULL,
            txid        TEXT DEFAULT NULL,
            session_id  TEXT DEFAULT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_cdm_launch ON council_discussion_messages(launch_id)`,
    ],
    10: [
        `CREATE TABLE IF NOT EXISTS agent_memories (
            id          TEXT PRIMARY KEY,
            agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            key         TEXT NOT NULL,
            content     TEXT NOT NULL,
            txid        TEXT DEFAULT NULL,
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_agent_key ON agent_memories(agent_id, key)`,
        `CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_id)`,
    ],
    12: [
        `ALTER TABLE agent_messages ADD COLUMN thread_id TEXT DEFAULT NULL`,
        `CREATE INDEX IF NOT EXISTS idx_agent_messages_thread ON agent_messages(thread_id)`,
    ],
    13: [
        `CREATE TABLE IF NOT EXISTS daily_spending (
            date         TEXT PRIMARY KEY,
            algo_micro   INTEGER DEFAULT 0,
            api_cost_usd REAL DEFAULT 0.0
        )`,
    ],
    14: [
        `CREATE TABLE IF NOT EXISTS escalation_queue (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            tool_name   TEXT NOT NULL,
            tool_input  TEXT NOT NULL DEFAULT '{}',
            status      TEXT DEFAULT 'pending',
            created_at  TEXT DEFAULT (datetime('now')),
            resolved_at TEXT DEFAULT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_escalation_queue_status ON escalation_queue(status)`,
        `CREATE INDEX IF NOT EXISTS idx_escalation_queue_session ON escalation_queue(session_id)`,
    ],
    15: [
        `ALTER TABLE sessions ADD COLUMN total_algo_spent INTEGER DEFAULT 0`,
    ],
    16: [
        `CREATE TABLE IF NOT EXISTS algochat_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            participant TEXT NOT NULL,
            content     TEXT NOT NULL,
            direction   TEXT NOT NULL DEFAULT 'inbound',
            fee         INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_algochat_messages_created ON algochat_messages(created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_algochat_messages_participant ON algochat_messages(participant)`,
    ],
    17: [
        `ALTER TABLE work_tasks ADD COLUMN original_branch TEXT DEFAULT NULL`,
        `ALTER TABLE work_tasks ADD COLUMN iteration_count INTEGER DEFAULT 0`,
    ],
    18: [
        `ALTER TABLE work_tasks ADD COLUMN worktree_dir TEXT DEFAULT NULL`,
        `ALTER TABLE sessions ADD COLUMN work_dir TEXT DEFAULT NULL`,
    ],
    19: [
        `CREATE TABLE IF NOT EXISTS algochat_allowlist (
            address    TEXT PRIMARY KEY,
            label      TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
    ],
    20: [
        // Credit ledger: tracks ALGO-based message credits per wallet address
        `CREATE TABLE IF NOT EXISTS credit_ledger (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address  TEXT NOT NULL,
            credits         INTEGER NOT NULL DEFAULT 0,
            reserved        INTEGER NOT NULL DEFAULT 0,
            total_purchased INTEGER NOT NULL DEFAULT 0,
            total_consumed  INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_wallet ON credit_ledger(wallet_address)`,

        // Transaction log for all credit operations (purchases, deductions, reserves)
        `CREATE TABLE IF NOT EXISTS credit_transactions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address  TEXT NOT NULL,
            type            TEXT NOT NULL,
            amount          INTEGER NOT NULL,
            balance_after   INTEGER NOT NULL,
            reference       TEXT DEFAULT NULL,
            txid            TEXT DEFAULT NULL,
            session_id      TEXT DEFAULT NULL,
            created_at      TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_credit_txn_wallet ON credit_transactions(wallet_address)`,
        `CREATE INDEX IF NOT EXISTS idx_credit_txn_type ON credit_transactions(type)`,
        `CREATE INDEX IF NOT EXISTS idx_credit_txn_session ON credit_transactions(session_id)`,

        // Credit configuration table (exchange rates, thresholds)
        `CREATE TABLE IF NOT EXISTS credit_config (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TEXT DEFAULT (datetime('now'))
        )`,

        // Insert default configuration values
        `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('credits_per_algo', '1000')`,
        `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('low_credit_threshold', '50')`,
        `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('reserve_per_group_message', '10')`,
        `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('credits_per_turn', '1')`,
        `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('credits_per_agent_message', '5')`,
        `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('free_credits_on_first_message', '100')`,

        // Track credits consumed per session
        `ALTER TABLE sessions ADD COLUMN credits_consumed INTEGER DEFAULT 0`,
    ],
    21: [
        // MCP tool permission scoping: null = default safe set, JSON array = explicit list
        `ALTER TABLE agents ADD COLUMN mcp_tool_permissions TEXT DEFAULT NULL`,
    ],
    22: [
        // Follow-up chat session for completed council launches
        `ALTER TABLE council_launches ADD COLUMN chat_session_id TEXT DEFAULT NULL`,
    ],
    23: [
        // Make algochat_psk_state network-aware so PSK counters/lastRound are per-network.
        // Recreate the table with (address, network) composite primary key.
        `CREATE TABLE IF NOT EXISTS algochat_psk_state_v2 (
            address           TEXT NOT NULL,
            network           TEXT NOT NULL DEFAULT 'testnet',
            initial_psk       BLOB NOT NULL,
            label             TEXT DEFAULT '',
            send_counter      INTEGER DEFAULT 0,
            peer_last_counter INTEGER DEFAULT 0,
            seen_counters     TEXT DEFAULT '[]',
            last_round        INTEGER DEFAULT 0,
            created_at        TEXT DEFAULT (datetime('now')),
            updated_at        TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (address, network)
        )`,
        // Migrate existing rows (assume they belong to 'testnet' since that was the only network used)
        `INSERT OR IGNORE INTO algochat_psk_state_v2 (address, network, initial_psk, label, send_counter, peer_last_counter, seen_counters, last_round, created_at, updated_at)
         SELECT address, 'testnet', initial_psk, label, send_counter, peer_last_counter, seen_counters, last_round, created_at, updated_at
         FROM algochat_psk_state`,
        `DROP TABLE IF EXISTS algochat_psk_state`,
        `ALTER TABLE algochat_psk_state_v2 RENAME TO algochat_psk_state`,
    ],
    24: [
        // Agent schedules — cron/interval-based automation for agents and councils
        `CREATE TABLE IF NOT EXISTS agent_schedules (
            id                  TEXT PRIMARY KEY,
            agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            name                TEXT NOT NULL,
            description         TEXT DEFAULT '',
            cron_expression     TEXT DEFAULT NULL,
            interval_ms         INTEGER DEFAULT NULL,
            actions             TEXT NOT NULL DEFAULT '[]',
            approval_policy     TEXT DEFAULT 'owner_approve',
            status              TEXT DEFAULT 'active',
            max_executions      INTEGER DEFAULT NULL,
            execution_count     INTEGER DEFAULT 0,
            max_budget_per_run  REAL DEFAULT NULL,
            last_run_at         TEXT DEFAULT NULL,
            next_run_at         TEXT DEFAULT NULL,
            created_at          TEXT DEFAULT (datetime('now')),
            updated_at          TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_agent_schedules_agent ON agent_schedules(agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_agent_schedules_status ON agent_schedules(status)`,
        `CREATE INDEX IF NOT EXISTS idx_agent_schedules_next_run ON agent_schedules(next_run_at)`,

        // Schedule execution log — one row per action execution
        `CREATE TABLE IF NOT EXISTS schedule_executions (
            id              TEXT PRIMARY KEY,
            schedule_id     TEXT NOT NULL REFERENCES agent_schedules(id) ON DELETE CASCADE,
            agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            status          TEXT DEFAULT 'running',
            action_type     TEXT NOT NULL,
            action_input    TEXT DEFAULT '{}',
            result          TEXT DEFAULT NULL,
            session_id      TEXT DEFAULT NULL,
            work_task_id    TEXT DEFAULT NULL,
            cost_usd        REAL DEFAULT 0,
            started_at      TEXT DEFAULT (datetime('now')),
            completed_at    TEXT DEFAULT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_schedule_executions_schedule ON schedule_executions(schedule_id)`,
        `CREATE INDEX IF NOT EXISTS idx_schedule_executions_status ON schedule_executions(status)`,
    ],
    25: [
        // Add config snapshot to execution records for audit/debugging
        `ALTER TABLE schedule_executions ADD COLUMN config_snapshot TEXT DEFAULT NULL`,
    ],
    26: [
        // LLM provider metadata columns
        `ALTER TABLE agents ADD COLUMN provider TEXT DEFAULT ''`,
        `ALTER TABLE agent_messages ADD COLUMN provider TEXT DEFAULT ''`,
        `ALTER TABLE agent_messages ADD COLUMN model TEXT DEFAULT ''`,
        `ALTER TABLE algochat_messages ADD COLUMN provider TEXT DEFAULT ''`,
        `ALTER TABLE algochat_messages ADD COLUMN model TEXT DEFAULT ''`,
    ],
    27: [
        // Schedule notification address — on-chain AlgoChat notifications on execution lifecycle
        `ALTER TABLE agent_schedules ADD COLUMN notify_address TEXT DEFAULT NULL`,
    ],
};

function hasColumn(db: Database, table: string, column: string): boolean {
    const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return cols.some((c) => c.name === column);
}

export function runMigrations(db: Database): void {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`);

    const row = db.query('SELECT version FROM schema_version LIMIT 1').get() as
        | { version: number }
        | null;
    const currentVersion = row?.version ?? 0;

    if (currentVersion >= SCHEMA_VERSION) return;

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
            db.exec(`INSERT INTO schema_version (version) VALUES (${SCHEMA_VERSION})`);
        } else {
            db.exec(`UPDATE schema_version SET version = ${SCHEMA_VERSION}`);
        }
    })();
}
