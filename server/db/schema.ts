import { Database } from 'bun:sqlite';

const SCHEMA_VERSION = 9;

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
            launch_id   TEXT NOT NULL REFERENCES council_launches(id),
            agent_id    TEXT NOT NULL REFERENCES agents(id),
            agent_name  TEXT NOT NULL,
            round       INTEGER NOT NULL,
            content     TEXT NOT NULL,
            txid        TEXT DEFAULT NULL,
            session_id  TEXT DEFAULT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE INDEX IF NOT EXISTS idx_cdm_launch ON council_discussion_messages(launch_id)`,
    ],
};

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
