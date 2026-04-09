/** Credits, billing, invoices, and subscriptions. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS credit_config (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
    )`,

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

  `CREATE TABLE IF NOT EXISTS credit_transactions (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT NOT NULL,
        type           TEXT NOT NULL,
        amount         INTEGER NOT NULL,
        balance_after  INTEGER NOT NULL,
        reference      TEXT DEFAULT NULL,
        txid           TEXT DEFAULT NULL,
        session_id     TEXT DEFAULT NULL,
        created_at     TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS daily_spending (
        date         TEXT PRIMARY KEY,
        algo_micro   INTEGER DEFAULT 0,
        api_cost_usd REAL DEFAULT 0.0
    )`,

  `CREATE TABLE IF NOT EXISTS invoices (
        id                TEXT PRIMARY KEY,
        tenant_id         TEXT NOT NULL,
        stripe_invoice_id TEXT NOT NULL,
        amount_cents      INTEGER NOT NULL,
        currency          TEXT DEFAULT 'usd',
        status            TEXT DEFAULT 'open',
        period_start      TEXT NOT NULL,
        period_end        TEXT NOT NULL,
        paid_at           TEXT DEFAULT NULL,
        created_at        TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS subscription_items (
        id              TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        stripe_item_id  TEXT NOT NULL,
        stripe_price_id TEXT DEFAULT NULL,
        created_at      TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
    )`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
        id                     TEXT PRIMARY KEY,
        tenant_id              TEXT NOT NULL,
        stripe_subscription_id TEXT NOT NULL,
        plan                   TEXT NOT NULL,
        status                 TEXT DEFAULT 'active',
        current_period_start   TEXT NOT NULL,
        current_period_end     TEXT NOT NULL,
        cancel_at_period_end   INTEGER DEFAULT 0,
        created_at             TEXT DEFAULT (datetime('now')),
        updated_at             TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS usage_records (
        id            TEXT PRIMARY KEY,
        tenant_id     TEXT NOT NULL,
        credits_used  INTEGER DEFAULT 0,
        api_calls     INTEGER DEFAULT 0,
        session_count INTEGER DEFAULT 0,
        storage_mb    REAL DEFAULT 0,
        period_start  TEXT NOT NULL,
        period_end    TEXT NOT NULL,
        reported      INTEGER DEFAULT 0,
        created_at    TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_wallet ON credit_ledger(wallet_address)`,
  `CREATE INDEX IF NOT EXISTS idx_credit_txn_session ON credit_transactions(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_credit_txn_type ON credit_transactions(type)`,
  `CREATE INDEX IF NOT EXISTS idx_credit_txn_wallet ON credit_transactions(wallet_address)`,
  `CREATE INDEX IF NOT EXISTS idx_credit_txn_wallet_type_created ON credit_transactions(wallet_address, type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subscription_items_sub ON subscription_items(subscription_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id)`,
];

export const seedData: string[] = [
  `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('credits_per_algo', '1000')`,
  `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('low_credit_threshold', '50')`,
  `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('reserve_per_group_message', '10')`,
  `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('credits_per_turn', '1')`,
  `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('credits_per_agent_message', '5')`,
  `INSERT OR IGNORE INTO credit_config (key, value) VALUES ('free_credits_on_first_message', '100')`,
];
