/** Agent core tables + indexes. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS agents (
        id                        TEXT PRIMARY KEY,
        name                      TEXT NOT NULL,
        description               TEXT DEFAULT '',
        system_prompt             TEXT DEFAULT '',
        append_prompt             TEXT DEFAULT '',
        model                     TEXT DEFAULT '',
        allowed_tools             TEXT DEFAULT '',
        disallowed_tools          TEXT DEFAULT '',
        permission_mode           TEXT DEFAULT 'default',
        max_budget_usd            REAL DEFAULT NULL,
        algochat_enabled          INTEGER DEFAULT 1,
        algochat_auto             INTEGER DEFAULT 1,
        custom_flags              TEXT DEFAULT '{}',
        wallet_address            TEXT DEFAULT NULL,
        wallet_mnemonic_encrypted TEXT DEFAULT NULL,
        wallet_funded_algo        REAL DEFAULT 0,
        default_project_id        TEXT DEFAULT NULL,
        mcp_tool_permissions      TEXT DEFAULT NULL,
        provider                  TEXT DEFAULT '',
        voice_enabled             INTEGER DEFAULT 0,
        voice_preset              TEXT DEFAULT 'alloy',
        display_color             TEXT DEFAULT NULL,
        display_icon              TEXT DEFAULT NULL,
        avatar_url                TEXT DEFAULT NULL,
        conversation_mode               TEXT NOT NULL DEFAULT 'private',
        conversation_rate_limit_window  INTEGER NOT NULL DEFAULT 3600,
        conversation_rate_limit_max     INTEGER NOT NULL DEFAULT 10,
        disabled                  INTEGER DEFAULT 0,
        tenant_id                 TEXT NOT NULL DEFAULT 'default',
        created_at                TEXT DEFAULT (datetime('now')),
        updated_at                TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS agent_daily_spending (
        agent_id   TEXT    NOT NULL,
        date       TEXT    NOT NULL,
        algo_micro INTEGER NOT NULL DEFAULT 0,
        usdc_micro INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (agent_id, date),
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )`,

  `CREATE TABLE IF NOT EXISTS agent_identity (
        agent_id               TEXT PRIMARY KEY,
        tier                   TEXT NOT NULL DEFAULT 'UNVERIFIED',
        verified_at            TEXT DEFAULT NULL,
        verification_data_hash TEXT DEFAULT NULL,
        updated_at             TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS agent_messages (
        id               TEXT PRIMARY KEY,
        from_agent_id    TEXT NOT NULL,
        to_agent_id      TEXT NOT NULL,
        content          TEXT NOT NULL,
        payment_micro    INTEGER DEFAULT 0,
        txid             TEXT DEFAULT NULL,
        status           TEXT DEFAULT 'pending',
        response         TEXT DEFAULT NULL,
        response_txid    TEXT DEFAULT NULL,
        session_id       TEXT DEFAULT NULL,
        thread_id        TEXT DEFAULT NULL,
        provider         TEXT DEFAULT '',
        model            TEXT DEFAULT '',
        fire_and_forget  INTEGER DEFAULT 0,
        message_version  INTEGER DEFAULT 1,
        error_code       TEXT DEFAULT NULL,
        created_at       TEXT DEFAULT (datetime('now')),
        completed_at     TEXT DEFAULT NULL
    )`,

  `CREATE TABLE IF NOT EXISTS personas (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        archetype        TEXT DEFAULT 'custom',
        traits           TEXT NOT NULL DEFAULT '[]',
        voice_guidelines TEXT DEFAULT '',
        background       TEXT DEFAULT '',
        example_messages TEXT DEFAULT '[]',
        created_at       TEXT DEFAULT (datetime('now')),
        updated_at       TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS agent_persona_assignments (
        agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (agent_id, persona_id)
    )`,

  `CREATE TABLE IF NOT EXISTS agent_skills (
        agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        bundle_id  TEXT NOT NULL REFERENCES skill_bundles(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (agent_id, bundle_id)
    )`,

  `CREATE TABLE IF NOT EXISTS agent_variants (
        id               TEXT PRIMARY KEY,
        name             TEXT UNIQUE NOT NULL,
        description      TEXT DEFAULT '',
        skill_bundle_ids TEXT NOT NULL DEFAULT '[]',
        persona_ids      TEXT NOT NULL DEFAULT '[]',
        preset           INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS agent_variant_assignments (
        agent_id   TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
        variant_id TEXT NOT NULL REFERENCES agent_variants(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS agent_spending_caps (
        agent_id               TEXT PRIMARY KEY,
        daily_limit_microalgos INTEGER NOT NULL DEFAULT 5000000,
        daily_limit_usdc       INTEGER NOT NULL DEFAULT 0,
        created_at             TEXT DEFAULT (datetime('now')),
        updated_at             TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )`,

  `CREATE TABLE IF NOT EXISTS agent_usdc_revenue (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id       TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        amount_micro   INTEGER NOT NULL,
        from_address   TEXT NOT NULL,
        txid           TEXT NOT NULL UNIQUE,
        forward_txid   TEXT DEFAULT NULL,
        forward_status TEXT NOT NULL DEFAULT 'pending',
        created_at     TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS agent_conversation_allowlist (
        agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        address    TEXT NOT NULL,
        label      TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (agent_id, address)
    )`,

  `CREATE TABLE IF NOT EXISTS agent_conversation_blocklist (
        agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        address    TEXT NOT NULL,
        reason     TEXT DEFAULT 'manual',
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (agent_id, address)
    )`,

  `CREATE TABLE IF NOT EXISTS agent_conversation_rate_limits (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id   TEXT NOT NULL,
        address    TEXT NOT NULL,
        message_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_agent_daily_spending_date ON agent_daily_spending(date)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_identity_tier ON agent_identity(tier)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_messages_from ON agent_messages(from_agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_messages_status ON agent_messages(status)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_messages_thread ON agent_messages(thread_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_persona_assignments_agent ON agent_persona_assignments(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_variant_assignments_variant ON agent_variant_assignments(variant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_usdc_revenue_agent ON agent_usdc_revenue(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_usdc_revenue_status ON agent_usdc_revenue(forward_status)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_conv_allow_agent ON agent_conversation_allowlist(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_conv_block_agent ON agent_conversation_blocklist(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_conv_rate_agent_addr ON agent_conversation_rate_limits(agent_id, address)`,
];
