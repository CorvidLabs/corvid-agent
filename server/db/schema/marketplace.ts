/** Marketplace listings, reviews, subscriptions, trials, escrow, and federation. */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS escrow_transactions (
        id               TEXT PRIMARY KEY,
        listing_id       TEXT NOT NULL,
        buyer_tenant_id  TEXT NOT NULL,
        seller_tenant_id TEXT NOT NULL,
        amount_credits   INTEGER NOT NULL,
        state            TEXT NOT NULL DEFAULT 'FUNDED',
        created_at       TEXT DEFAULT (datetime('now')),
        delivered_at     TEXT DEFAULT NULL,
        released_at      TEXT DEFAULT NULL,
        disputed_at      TEXT DEFAULT NULL,
        resolved_at      TEXT DEFAULT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS federated_instances (
        url           TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        last_sync_at  TEXT DEFAULT NULL,
        listing_count INTEGER DEFAULT 0,
        status        TEXT DEFAULT 'active'
    )`,

    `CREATE TABLE IF NOT EXISTS marketplace_listings (
        id               TEXT PRIMARY KEY,
        agent_id         TEXT NOT NULL,
        name             TEXT NOT NULL,
        description      TEXT NOT NULL,
        long_description TEXT DEFAULT '',
        category         TEXT NOT NULL,
        tags             TEXT DEFAULT '[]',
        pricing_model    TEXT DEFAULT 'free',
        price_credits    INTEGER DEFAULT 0,
        instance_url     TEXT DEFAULT NULL,
        status           TEXT DEFAULT 'draft',
        use_count        INTEGER DEFAULT 0,
        avg_rating       REAL DEFAULT 0,
        review_count     INTEGER DEFAULT 0,
        tenant_id        TEXT NOT NULL DEFAULT 'default',
        trial_uses       INTEGER DEFAULT NULL,
        trial_days       INTEGER DEFAULT NULL,
        created_at       TEXT DEFAULT (datetime('now')),
        updated_at       TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS marketplace_pricing_tiers (
        id            TEXT PRIMARY KEY,
        listing_id    TEXT NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT NOT NULL DEFAULT '',
        price_credits INTEGER NOT NULL DEFAULT 0,
        billing_cycle TEXT NOT NULL DEFAULT 'one_time' CHECK (billing_cycle IN ('one_time', 'daily', 'weekly', 'monthly')),
        rate_limit    INTEGER NOT NULL DEFAULT 0,
        features      TEXT NOT NULL DEFAULT '[]',
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS marketplace_reviews (
        id                TEXT PRIMARY KEY,
        listing_id        TEXT NOT NULL,
        reviewer_agent_id TEXT DEFAULT NULL,
        reviewer_address  TEXT DEFAULT NULL,
        rating            INTEGER NOT NULL,
        comment           TEXT DEFAULT '',
        created_at        TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
        id                   TEXT PRIMARY KEY,
        listing_id           TEXT NOT NULL,
        subscriber_tenant_id TEXT NOT NULL,
        seller_tenant_id     TEXT NOT NULL,
        price_credits        INTEGER NOT NULL,
        billing_cycle        TEXT NOT NULL CHECK (billing_cycle IN ('daily', 'weekly', 'monthly')),
        status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
        current_period_start TEXT NOT NULL,
        current_period_end   TEXT NOT NULL,
        cancelled_at         TEXT DEFAULT NULL,
        created_at           TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS marketplace_trials (
        id             TEXT PRIMARY KEY,
        listing_id     TEXT NOT NULL,
        tenant_id      TEXT NOT NULL,
        uses_remaining INTEGER DEFAULT NULL,
        expires_at     TEXT DEFAULT NULL,
        status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted')),
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS marketplace_usage_events (
        id              TEXT PRIMARY KEY,
        listing_id      TEXT NOT NULL,
        user_tenant_id  TEXT NOT NULL,
        tier_id         TEXT DEFAULT NULL,
        credits_charged INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_escrow_buyer ON escrow_transactions(buyer_tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_escrow_listing ON escrow_transactions(listing_id)`,
    `CREATE INDEX IF NOT EXISTS idx_escrow_seller ON escrow_transactions(seller_tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_escrow_state ON escrow_transactions(state)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_listings_agent ON marketplace_listings(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category ON marketplace_listings(category)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON marketplace_listings(status)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_listings_tenant ON marketplace_listings(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_pricing_tiers_listing ON marketplace_pricing_tiers(listing_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_listing ON marketplace_reviews(listing_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_listing ON marketplace_subscriptions(listing_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_period_end ON marketplace_subscriptions(current_period_end)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_seller ON marketplace_subscriptions(seller_tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_status ON marketplace_subscriptions(status)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_subscriber ON marketplace_subscriptions(subscriber_tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_trials_listing ON marketplace_trials(listing_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_trials_listing_tenant ON marketplace_trials(listing_id, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketplace_trials_tenant ON marketplace_trials(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mue_created ON marketplace_usage_events(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_mue_listing ON marketplace_usage_events(listing_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mue_listing_created ON marketplace_usage_events(listing_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_mue_user ON marketplace_usage_events(user_tenant_id)`,
];
