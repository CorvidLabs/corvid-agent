import { Database } from 'bun:sqlite';

const SCHEMA_VERSION = 44;

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
    // Version 11 intentionally skipped (removed during development; cannot renumber without breaking existing DBs)
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
    28: [
        // Memory sync status tracking: pending → confirmed / failed
        `ALTER TABLE agent_memories ADD COLUMN status TEXT DEFAULT 'confirmed'`,
        `UPDATE agent_memories SET status = 'confirmed' WHERE txid IS NOT NULL`,
        `UPDATE agent_memories SET status = 'pending' WHERE txid IS NULL`,
        `CREATE INDEX IF NOT EXISTS idx_agent_memories_status ON agent_memories(status)`,
    ],
    29: [
        // FTS5 full-text search index for agent memories — enables semantic-style search
        // with ranking, prefix matching, phrase queries, and Boolean operators.
        `CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_fts USING fts5(
            key,
            content,
            content=agent_memories,
            content_rowid=rowid
        )`,

        // Populate FTS index from existing memories
        `INSERT INTO agent_memories_fts(rowid, key, content)
         SELECT rowid, key, content FROM agent_memories`,

        // Triggers to keep FTS index in sync with the main table
        `CREATE TRIGGER IF NOT EXISTS agent_memories_ai AFTER INSERT ON agent_memories BEGIN
            INSERT INTO agent_memories_fts(rowid, key, content)
            VALUES (new.rowid, new.key, new.content);
        END`,

        `CREATE TRIGGER IF NOT EXISTS agent_memories_ad AFTER DELETE ON agent_memories BEGIN
            INSERT INTO agent_memories_fts(agent_memories_fts, rowid, key, content)
            VALUES ('delete', old.rowid, old.key, old.content);
        END`,

        `CREATE TRIGGER IF NOT EXISTS agent_memories_au AFTER UPDATE ON agent_memories BEGIN
            INSERT INTO agent_memories_fts(agent_memories_fts, rowid, key, content)
            VALUES ('delete', old.rowid, old.key, old.content);
            INSERT INTO agent_memories_fts(rowid, key, content)
            VALUES (new.rowid, new.key, new.content);
        END`,
    ],
    30: [
        // Multi-contact PSK support: registry of PSK contacts (friends)
        `CREATE TABLE IF NOT EXISTS psk_contacts (
            id              TEXT PRIMARY KEY,
            nickname        TEXT NOT NULL,
            network         TEXT NOT NULL,
            initial_psk     BLOB NOT NULL,
            mobile_address  TEXT DEFAULT NULL,
            active          INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_psk_contacts_network ON psk_contacts(network)`,
        `CREATE INDEX IF NOT EXISTS idx_psk_contacts_active ON psk_contacts(active, network)`,

        // Migrate existing single mobile-client PSK into the new contacts table.
        // For each network that has a 'mobile-client' row, insert a contact entry.
        `INSERT OR IGNORE INTO psk_contacts (id, nickname, network, initial_psk, active, created_at)
         SELECT
             'migrated-' || network,
             'Mobile',
             network,
             initial_psk,
             1,
             created_at
         FROM algochat_psk_state
         WHERE address = 'mobile-client'`,
    ],
    31: [
        // GitHub webhook registrations — event-driven automation triggered by @mentions
        `CREATE TABLE IF NOT EXISTS webhook_registrations (
            id                TEXT PRIMARY KEY,
            agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            repo              TEXT NOT NULL,
            events            TEXT NOT NULL DEFAULT '[]',
            mention_username  TEXT NOT NULL,
            project_id        TEXT NOT NULL REFERENCES projects(id),
            status            TEXT DEFAULT 'active',
            trigger_count     INTEGER DEFAULT 0,
            created_at        TEXT DEFAULT (datetime('now')),
            updated_at        TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_webhook_registrations_repo ON webhook_registrations(repo)`,
        `CREATE INDEX IF NOT EXISTS idx_webhook_registrations_status ON webhook_registrations(status)`,
        `CREATE INDEX IF NOT EXISTS idx_webhook_registrations_agent ON webhook_registrations(agent_id)`,

        // Webhook delivery log — one row per incoming webhook event
        `CREATE TABLE IF NOT EXISTS webhook_deliveries (
            id                TEXT PRIMARY KEY,
            registration_id   TEXT NOT NULL REFERENCES webhook_registrations(id) ON DELETE CASCADE,
            event             TEXT NOT NULL,
            action            TEXT NOT NULL DEFAULT '',
            repo              TEXT NOT NULL,
            sender            TEXT NOT NULL,
            body              TEXT DEFAULT '',
            html_url          TEXT DEFAULT '',
            session_id        TEXT DEFAULT NULL,
            work_task_id      TEXT DEFAULT NULL,
            status            TEXT DEFAULT 'processing',
            result            TEXT DEFAULT NULL,
            created_at        TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_registration ON webhook_deliveries(registration_id)`,
        `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status)`,
    ],
    32: [
        // GitHub mention polling — poll for @mentions without needing a public webhook URL
        `CREATE TABLE IF NOT EXISTS mention_polling_configs (
            id                TEXT PRIMARY KEY,
            agent_id          TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            repo              TEXT NOT NULL,
            mention_username  TEXT NOT NULL,
            project_id        TEXT NOT NULL REFERENCES projects(id),
            interval_seconds  INTEGER NOT NULL DEFAULT 60,
            status            TEXT DEFAULT 'active',
            trigger_count     INTEGER DEFAULT 0,
            last_poll_at      TEXT DEFAULT NULL,
            last_seen_id      TEXT DEFAULT NULL,
            event_filter      TEXT NOT NULL DEFAULT '[]',
            allowed_users     TEXT NOT NULL DEFAULT '[]',
            created_at        TEXT DEFAULT (datetime('now')),
            updated_at        TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_mention_polling_configs_agent ON mention_polling_configs(agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_mention_polling_configs_status ON mention_polling_configs(status)`,
        `CREATE INDEX IF NOT EXISTS idx_mention_polling_configs_repo ON mention_polling_configs(repo)`,
    ],
    33: [
        // Track all processed mention IDs (not just the newest) to avoid missing
        // older issues that get newly assigned after the high-water-mark was set.
        `ALTER TABLE mention_polling_configs ADD COLUMN processed_ids TEXT NOT NULL DEFAULT '[]'`,
    ],
    34: [
        // Workflows — graph-based orchestration of agent sessions, work tasks, and decisions
        `CREATE TABLE IF NOT EXISTS workflows (
            id                  TEXT PRIMARY KEY,
            agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            name                TEXT NOT NULL,
            description         TEXT DEFAULT '',
            nodes               TEXT NOT NULL DEFAULT '[]',
            edges               TEXT NOT NULL DEFAULT '[]',
            status              TEXT DEFAULT 'draft',
            default_project_id  TEXT DEFAULT NULL,
            max_concurrency     INTEGER DEFAULT 2,
            created_at          TEXT DEFAULT (datetime('now')),
            updated_at          TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_workflows_agent ON workflows(agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status)`,

        // Workflow runs — one row per workflow execution
        `CREATE TABLE IF NOT EXISTS workflow_runs (
            id                  TEXT PRIMARY KEY,
            workflow_id         TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            agent_id            TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            status              TEXT DEFAULT 'running',
            input               TEXT DEFAULT '{}',
            output              TEXT DEFAULT NULL,
            workflow_snapshot    TEXT NOT NULL DEFAULT '{}',
            current_node_ids    TEXT DEFAULT '[]',
            error               TEXT DEFAULT NULL,
            started_at          TEXT DEFAULT (datetime('now')),
            completed_at        TEXT DEFAULT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id)`,
        `CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status)`,

        // Workflow node runs — one row per node execution within a run
        `CREATE TABLE IF NOT EXISTS workflow_node_runs (
            id              TEXT PRIMARY KEY,
            run_id          TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
            node_id         TEXT NOT NULL,
            node_type       TEXT NOT NULL,
            status          TEXT DEFAULT 'pending',
            input           TEXT DEFAULT '{}',
            output          TEXT DEFAULT NULL,
            session_id      TEXT DEFAULT NULL,
            work_task_id    TEXT DEFAULT NULL,
            error           TEXT DEFAULT NULL,
            started_at      TEXT DEFAULT NULL,
            completed_at    TEXT DEFAULT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_run ON workflow_node_runs(run_id)`,
        `CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_status ON workflow_node_runs(status)`,
        `CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_session ON workflow_node_runs(session_id)`,
    ],

    35: [
        // Immutable audit log — insert-only table for security/compliance auditing.
        // No UPDATE or DELETE operations should ever be performed on this table.
        `CREATE TABLE IF NOT EXISTS audit_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
            action      TEXT NOT NULL,
            actor       TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id TEXT,
            detail      TEXT,
            trace_id    TEXT,
            ip_address  TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`,
        `CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)`,
        `CREATE INDEX IF NOT EXISTS idx_audit_log_trace_id ON audit_log(trace_id)`,
    ],
    36: [
        // Owner questions — agent-to-owner communication (blocking questions + audit)
        `CREATE TABLE IF NOT EXISTS owner_questions (
            id           TEXT PRIMARY KEY,
            session_id   TEXT NOT NULL,
            agent_id     TEXT NOT NULL,
            question     TEXT NOT NULL,
            options      TEXT DEFAULT NULL,
            context      TEXT DEFAULT NULL,
            status       TEXT DEFAULT 'pending',
            answer       TEXT DEFAULT NULL,
            timeout_ms   INTEGER DEFAULT 120000,
            created_at   TEXT DEFAULT (datetime('now')),
            resolved_at  TEXT DEFAULT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_owner_questions_session ON owner_questions(session_id)`,
        `CREATE INDEX IF NOT EXISTS idx_owner_questions_agent ON owner_questions(agent_id)`,
    ],
    37: [
        // Per-agent notification channel configs (Discord, Telegram, GitHub, AlgoChat)
        `CREATE TABLE IF NOT EXISTS notification_channels (
            id           TEXT PRIMARY KEY,
            agent_id     TEXT NOT NULL,
            channel_type TEXT NOT NULL,
            config       TEXT NOT NULL DEFAULT '{}',
            enabled      INTEGER NOT NULL DEFAULT 1,
            created_at   TEXT DEFAULT (datetime('now')),
            updated_at   TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_channels_agent_type
            ON notification_channels(agent_id, channel_type)`,

        // Persistent notification log — never lost even if all channels fail
        `CREATE TABLE IF NOT EXISTS owner_notifications (
            id         TEXT PRIMARY KEY,
            agent_id   TEXT NOT NULL,
            session_id TEXT DEFAULT NULL,
            title      TEXT DEFAULT NULL,
            message    TEXT NOT NULL,
            level      TEXT NOT NULL DEFAULT 'info',
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_owner_notifications_agent
            ON owner_notifications(agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_owner_notifications_created
            ON owner_notifications(created_at)`,

        // Per-channel delivery tracking with retry support
        `CREATE TABLE IF NOT EXISTS notification_deliveries (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            notification_id TEXT NOT NULL REFERENCES owner_notifications(id) ON DELETE CASCADE,
            channel_type    TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'pending',
            attempts        INTEGER NOT NULL DEFAULT 0,
            last_attempt_at TEXT DEFAULT NULL,
            error           TEXT DEFAULT NULL,
            external_ref    TEXT DEFAULT NULL,
            created_at      TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification
            ON notification_deliveries(notification_id)`,
        `CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
            ON notification_deliveries(status)`,
    ],
    38: [
        // Question dispatch tracking — where each owner question was sent
        `CREATE TABLE IF NOT EXISTS owner_question_dispatches (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id     TEXT NOT NULL,
            channel_type    TEXT NOT NULL,
            external_ref    TEXT,
            status          TEXT NOT NULL DEFAULT 'sent',
            created_at      TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_question_dispatches_question
            ON owner_question_dispatches(question_id)`,
        `CREATE INDEX IF NOT EXISTS idx_question_dispatches_status
            ON owner_question_dispatches(status)`,
    ],
    39: [
        // Plugin registry — dynamically loaded tool plugins
        `CREATE TABLE IF NOT EXISTS plugins (
            name TEXT PRIMARY KEY,
            package_name TEXT NOT NULL,
            version TEXT NOT NULL,
            description TEXT DEFAULT '',
            author TEXT DEFAULT '',
            capabilities TEXT NOT NULL DEFAULT '[]',
            status TEXT DEFAULT 'active',
            loaded_at TEXT DEFAULT (datetime('now')),
            config TEXT DEFAULT '{}'
        )`,
        `CREATE TABLE IF NOT EXISTS plugin_capabilities (
            plugin_name TEXT NOT NULL REFERENCES plugins(name) ON DELETE CASCADE,
            capability TEXT NOT NULL,
            granted INTEGER DEFAULT 0,
            granted_at TEXT DEFAULT NULL,
            PRIMARY KEY (plugin_name, capability)
        )`,
    ],
    40: [
        // Container sandbox configurations per agent
        `CREATE TABLE IF NOT EXISTS sandbox_configs (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL UNIQUE,
            image TEXT DEFAULT 'corvid-agent-sandbox:latest',
            cpu_limit REAL DEFAULT 1.0,
            memory_limit_mb INTEGER DEFAULT 512,
            network_policy TEXT DEFAULT 'restricted',
            timeout_seconds INTEGER DEFAULT 600,
            read_only_mounts TEXT DEFAULT '[]',
            work_dir TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
    ],
    41: [
        // Agent marketplace — listings and reviews
        `CREATE TABLE IF NOT EXISTS marketplace_listings (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            long_description TEXT DEFAULT '',
            category TEXT NOT NULL,
            tags TEXT DEFAULT '[]',
            pricing_model TEXT DEFAULT 'free',
            price_credits INTEGER DEFAULT 0,
            instance_url TEXT DEFAULT NULL,
            status TEXT DEFAULT 'draft',
            use_count INTEGER DEFAULT 0,
            avg_rating REAL DEFAULT 0,
            review_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_listings_agent ON marketplace_listings(agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON marketplace_listings(status)`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category ON marketplace_listings(category)`,

        `CREATE TABLE IF NOT EXISTS marketplace_reviews (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            reviewer_agent_id TEXT DEFAULT NULL,
            reviewer_address TEXT DEFAULT NULL,
            rating INTEGER NOT NULL,
            comment TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_listing ON marketplace_reviews(listing_id)`,

        // Cross-instance federation registry
        `CREATE TABLE IF NOT EXISTS federated_instances (
            url TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            last_sync_at TEXT DEFAULT NULL,
            listing_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active'
        )`,
    ],
    42: [
        // Agent reputation — scoring and trust attestation
        `CREATE TABLE IF NOT EXISTS agent_reputation (
            agent_id TEXT PRIMARY KEY,
            overall_score INTEGER DEFAULT 0,
            trust_level TEXT DEFAULT 'untrusted',
            task_completion INTEGER DEFAULT 0,
            peer_rating INTEGER DEFAULT 0,
            credit_pattern INTEGER DEFAULT 0,
            security_compliance INTEGER DEFAULT 0,
            activity_level INTEGER DEFAULT 0,
            attestation_hash TEXT DEFAULT NULL,
            computed_at TEXT DEFAULT (datetime('now'))
        )`,

        `CREATE TABLE IF NOT EXISTS reputation_events (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            score_impact REAL DEFAULT 0,
            metadata TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_reputation_events_agent ON reputation_events(agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_reputation_events_type ON reputation_events(event_type)`,

        `CREATE TABLE IF NOT EXISTS reputation_attestations (
            agent_id TEXT NOT NULL,
            hash TEXT NOT NULL,
            payload TEXT NOT NULL,
            txid TEXT DEFAULT NULL,
            published_at TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (agent_id, hash)
        )`,
    ],
    43: [
        // Multi-tenant isolation
        `CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            owner_email TEXT NOT NULL,
            stripe_customer_id TEXT DEFAULT NULL,
            plan TEXT DEFAULT 'free',
            max_agents INTEGER DEFAULT 3,
            max_concurrent_sessions INTEGER DEFAULT 2,
            sandbox_enabled INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,

        `CREATE TABLE IF NOT EXISTS api_keys (
            key_hash TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            label TEXT DEFAULT 'default',
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id)`,

        // Usage-based billing
        `CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            stripe_subscription_id TEXT NOT NULL,
            plan TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            current_period_start TEXT NOT NULL,
            current_period_end TEXT NOT NULL,
            cancel_at_period_end INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id)`,

        `CREATE TABLE IF NOT EXISTS usage_records (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            credits_used INTEGER DEFAULT 0,
            api_calls INTEGER DEFAULT 0,
            session_count INTEGER DEFAULT 0,
            storage_mb REAL DEFAULT 0,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            reported INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id)`,

        `CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            stripe_invoice_id TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            currency TEXT DEFAULT 'usd',
            status TEXT DEFAULT 'open',
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            paid_at TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id)`,
    ],
    44: [
        // Health snapshots for improvement loop trend analysis
        `CREATE TABLE IF NOT EXISTS health_snapshots (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            tsc_error_count INTEGER DEFAULT 0,
            tsc_passed INTEGER DEFAULT 0,
            tests_passed INTEGER DEFAULT 0,
            test_failure_count INTEGER DEFAULT 0,
            todo_count INTEGER DEFAULT 0,
            fixme_count INTEGER DEFAULT 0,
            hack_count INTEGER DEFAULT 0,
            large_file_count INTEGER DEFAULT 0,
            outdated_dep_count INTEGER DEFAULT 0,
            collected_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_health_snap_agent ON health_snapshots(agent_id, project_id)`,

        // Memory archival support — archived memories are excluded from search
        `ALTER TABLE agent_memories ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`,
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
