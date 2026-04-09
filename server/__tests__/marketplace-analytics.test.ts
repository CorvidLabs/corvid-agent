/**
 * Tests for marketplace usage metering and analytics:
 * - MarketplaceAnalytics: usage event recording, aggregation queries
 * - Analytics routes: seller analytics, buyer usage
 * - Integration with MarketplaceService recordUse/recordTierUse
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { grantCredits } from '../db/credits';
import { runMigrations } from '../db/schema';
import { MarketplaceAnalytics } from '../marketplace/analytics';
import { MarketplaceService } from '../marketplace/service';
import { handleMarketplaceAnalyticsRoutes } from '../routes/marketplace-analytics';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;
let analytics: MarketplaceAnalytics;

function setupDb(): Database {
  const d = new Database(':memory:');
  runMigrations(d);

  // Ensure marketplace tables exist (IF NOT EXISTS is safe)
  d.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_listings (
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
            tenant_id TEXT NOT NULL DEFAULT 'default',
            trial_uses INTEGER DEFAULT NULL,
            trial_days INTEGER DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

  // Add trial columns if not present (concurrent feature may have added them to service.ts)
  try {
    d.exec('ALTER TABLE marketplace_listings ADD COLUMN trial_uses INTEGER DEFAULT NULL');
  } catch {}
  try {
    d.exec('ALTER TABLE marketplace_listings ADD COLUMN trial_days INTEGER DEFAULT NULL');
  } catch {}

  d.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_usage_events (
            id                TEXT PRIMARY KEY,
            listing_id        TEXT NOT NULL,
            user_tenant_id    TEXT NOT NULL,
            tier_id           TEXT DEFAULT NULL,
            credits_charged   INTEGER NOT NULL DEFAULT 0,
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

  d.exec(`
        CREATE TABLE IF NOT EXISTS escrow_transactions (
            id                TEXT PRIMARY KEY,
            listing_id        TEXT NOT NULL,
            buyer_tenant_id   TEXT NOT NULL,
            seller_tenant_id  TEXT NOT NULL,
            amount_credits    INTEGER NOT NULL,
            state             TEXT NOT NULL DEFAULT 'FUNDED',
            created_at        TEXT DEFAULT (datetime('now')),
            delivered_at      TEXT DEFAULT NULL,
            released_at       TEXT DEFAULT NULL,
            disputed_at       TEXT DEFAULT NULL,
            resolved_at       TEXT DEFAULT NULL
        )
    `);

  d.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_reviews (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            reviewer_agent_id TEXT DEFAULT NULL,
            reviewer_address TEXT DEFAULT NULL,
            rating INTEGER NOT NULL,
            comment TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

  d.exec(`
        CREATE TABLE IF NOT EXISTS agent_identity (
            agent_id               TEXT PRIMARY KEY,
            tier                   TEXT NOT NULL DEFAULT 'UNVERIFIED',
            verified_at            TEXT DEFAULT NULL,
            verification_data_hash TEXT DEFAULT NULL,
            updated_at             TEXT DEFAULT (datetime('now'))
        )
    `);

  d.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_pricing_tiers (
            id              TEXT PRIMARY KEY,
            listing_id      TEXT NOT NULL,
            name            TEXT NOT NULL,
            description     TEXT NOT NULL DEFAULT '',
            price_credits   INTEGER NOT NULL DEFAULT 0,
            billing_cycle   TEXT NOT NULL DEFAULT 'one_time',
            rate_limit      INTEGER NOT NULL DEFAULT 0,
            features        TEXT NOT NULL DEFAULT '[]',
            sort_order      INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

  return d;
}

function createTestListing(d: Database, id: string, name: string, pricingModel = 'free', priceCredits = 0): void {
  d.exec(`
        INSERT INTO marketplace_listings (id, agent_id, name, description, category, pricing_model, price_credits, tenant_id, status)
        VALUES ('${id}', 'agent-1', '${name}', 'test', 'coding', '${pricingModel}', ${priceCredits}, 'seller-wallet', 'published')
    `);
}

beforeEach(() => {
  db = setupDb();
  analytics = new MarketplaceAnalytics(db);
});

// ─── MarketplaceAnalytics Service Tests ──────────────────────────────────────

describe('MarketplaceAnalytics', () => {
  describe('recordUsageEvent', () => {
    test('records a usage event', () => {
      analytics.recordUsageEvent('listing-1', 'user-1', 100);

      const rows = db.query('SELECT * FROM marketplace_usage_events').all();
      expect(rows).toHaveLength(1);

      const row = rows[0] as any;
      expect(row.listing_id).toBe('listing-1');
      expect(row.user_tenant_id).toBe('user-1');
      expect(row.credits_charged).toBe(100);
      expect(row.tier_id).toBeNull();
    });

    test('records usage event with tier_id', () => {
      analytics.recordUsageEvent('listing-1', 'user-1', 50, 'tier-1');

      const rows = db.query('SELECT * FROM marketplace_usage_events').all();
      expect(rows).toHaveLength(1);

      const row = rows[0] as any;
      expect(row.tier_id).toBe('tier-1');
    });

    test('records multiple usage events', () => {
      analytics.recordUsageEvent('listing-1', 'user-1', 100);
      analytics.recordUsageEvent('listing-1', 'user-2', 100);
      analytics.recordUsageEvent('listing-1', 'user-1', 50);

      const rows = db.query('SELECT * FROM marketplace_usage_events').all();
      expect(rows).toHaveLength(3);
    });
  });

  describe('getListingAnalytics', () => {
    test('returns zero analytics for listing with no usage', () => {
      createTestListing(db, 'listing-1', 'Test Listing');

      const result = analytics.getListingAnalytics('listing-1');
      expect(result.listingId).toBe('listing-1');
      expect(result.totalUses).toBe(0);
      expect(result.uses7d).toBe(0);
      expect(result.uses30d).toBe(0);
      expect(result.revenueAllTime).toBe(0);
      expect(result.revenue7d).toBe(0);
      expect(result.revenue30d).toBe(0);
      expect(result.uniqueUsers).toBe(0);
      expect(result.dailyUsage).toHaveLength(0);
      expect(result.topUsers).toHaveLength(0);
    });

    test('returns correct aggregate analytics', () => {
      createTestListing(db, 'listing-1', 'Test Listing');

      // Record some usage events
      analytics.recordUsageEvent('listing-1', 'user-1', 100);
      analytics.recordUsageEvent('listing-1', 'user-2', 200);
      analytics.recordUsageEvent('listing-1', 'user-1', 150);

      const result = analytics.getListingAnalytics('listing-1');
      expect(result.totalUses).toBe(3);
      expect(result.uses7d).toBe(3);
      expect(result.uses30d).toBe(3);
      expect(result.revenueAllTime).toBe(450);
      expect(result.revenue7d).toBe(450);
      expect(result.revenue30d).toBe(450);
      expect(result.uniqueUsers).toBe(2);
    });

    test('returns top users sorted by usage count', () => {
      createTestListing(db, 'listing-1', 'Test Listing');

      analytics.recordUsageEvent('listing-1', 'user-1', 100);
      analytics.recordUsageEvent('listing-1', 'user-1', 100);
      analytics.recordUsageEvent('listing-1', 'user-1', 100);
      analytics.recordUsageEvent('listing-1', 'user-2', 200);

      const result = analytics.getListingAnalytics('listing-1');
      expect(result.topUsers).toHaveLength(2);
      expect(result.topUsers[0].userTenantId).toBe('user-1');
      expect(result.topUsers[0].uses).toBe(3);
      expect(result.topUsers[0].creditsSpent).toBe(300);
      expect(result.topUsers[1].userTenantId).toBe('user-2');
      expect(result.topUsers[1].uses).toBe(1);
    });

    test('returns daily usage buckets', () => {
      createTestListing(db, 'listing-1', 'Test Listing');

      analytics.recordUsageEvent('listing-1', 'user-1', 100);
      analytics.recordUsageEvent('listing-1', 'user-2', 200);

      const result = analytics.getListingAnalytics('listing-1');
      expect(result.dailyUsage.length).toBeGreaterThanOrEqual(1);

      const today = result.dailyUsage[result.dailyUsage.length - 1];
      expect(today.uses).toBe(2);
      expect(today.revenue).toBe(300);
    });
  });

  describe('getBuyerUsage', () => {
    test('returns empty array for user with no usage', () => {
      const result = analytics.getBuyerUsage('unknown-user');
      expect(result).toHaveLength(0);
    });

    test('returns usage summary per listing', () => {
      createTestListing(db, 'listing-1', 'Listing A');
      createTestListing(db, 'listing-2', 'Listing B');

      analytics.recordUsageEvent('listing-1', 'user-1', 100);
      analytics.recordUsageEvent('listing-1', 'user-1', 50);
      analytics.recordUsageEvent('listing-2', 'user-1', 200);

      const result = analytics.getBuyerUsage('user-1');
      expect(result).toHaveLength(2);

      // Results sorted by last_used_at DESC
      const listing1 = result.find((r) => r.listingId === 'listing-1');
      expect(listing1).toBeDefined();
      expect(listing1!.listingName).toBe('Listing A');
      expect(listing1!.totalUses).toBe(2);
      expect(listing1!.totalCreditsSpent).toBe(150);

      const listing2 = result.find((r) => r.listingId === 'listing-2');
      expect(listing2).toBeDefined();
      expect(listing2!.listingName).toBe('Listing B');
      expect(listing2!.totalUses).toBe(1);
      expect(listing2!.totalCreditsSpent).toBe(200);
    });
  });

  describe('getDailyUsage', () => {
    test('returns empty for no events', () => {
      const result = analytics.getDailyUsage('nonexistent', 7);
      expect(result).toHaveLength(0);
    });
  });

  describe('getTopUsers', () => {
    test('respects limit parameter', () => {
      for (let i = 0; i < 15; i++) {
        analytics.recordUsageEvent('listing-1', `user-${i}`, 10);
      }

      const result = analytics.getTopUsers('listing-1', 5);
      expect(result).toHaveLength(5);
    });
  });
});

// ─── Route Tests ─────────────────────────────────────────────────────────────

describe('Marketplace Analytics Routes', () => {
  describe('GET /api/marketplace/listings/:id/analytics', () => {
    test('returns analytics for existing listing', () => {
      createTestListing(db, 'listing-1', 'Test Listing');
      analytics.recordUsageEvent('listing-1', 'user-1', 100);

      const req = new Request('http://localhost/api/marketplace/listings/listing-1/analytics');
      const url = new URL(req.url);
      const res = handleMarketplaceAnalyticsRoutes(req, url, db);

      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);
    });

    test('returns 404 for non-existent listing', () => {
      const req = new Request('http://localhost/api/marketplace/listings/nonexistent/analytics');
      const url = new URL(req.url);
      const res = handleMarketplaceAnalyticsRoutes(req, url, db);

      expect(res).not.toBeNull();
      expect(res!.status).toBe(404);
    });

    test('supports days query parameter', () => {
      createTestListing(db, 'listing-1', 'Test Listing');

      const req = new Request('http://localhost/api/marketplace/listings/listing-1/analytics?days=7');
      const url = new URL(req.url);
      const res = handleMarketplaceAnalyticsRoutes(req, url, db);

      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);
    });

    test('returns null for non-matching paths', () => {
      const req = new Request('http://localhost/api/other/path');
      const url = new URL(req.url);
      const res = handleMarketplaceAnalyticsRoutes(req, url, db);

      expect(res).toBeNull();
    });
  });

  describe('GET /api/marketplace/usage', () => {
    test('returns buyer usage', () => {
      createTestListing(db, 'listing-1', 'Test');
      analytics.recordUsageEvent('listing-1', 'buyer-1', 50);

      const req = new Request('http://localhost/api/marketplace/usage?tenantId=buyer-1');
      const url = new URL(req.url);
      const res = handleMarketplaceAnalyticsRoutes(req, url, db);

      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);
    });

    test('returns 400 without tenantId', () => {
      const req = new Request('http://localhost/api/marketplace/usage');
      const url = new URL(req.url);
      const res = handleMarketplaceAnalyticsRoutes(req, url, db);

      expect(res).not.toBeNull();
      expect(res!.status).toBe(400);
    });
  });
});

// ─── Integration Tests ──────────────────────────────────────────────────────

describe('MarketplaceService usage event integration', () => {
  test('recordUse creates usage event for paid listing', () => {
    const service = new MarketplaceService(db, 'UNVERIFIED');

    const listing = service.createListing({
      agentId: 'agent-1',
      name: 'Paid Service',
      description: 'test',
      category: 'coding',
      pricingModel: 'per_use',
      priceCredits: 50,
    });

    grantCredits(db, 'buyer-wallet', 1000);

    service.recordUse(listing.id, 'buyer-wallet');

    const events = db.query('SELECT * FROM marketplace_usage_events WHERE listing_id = ?').all(listing.id) as any[];
    expect(events).toHaveLength(1);
    expect(events[0].user_tenant_id).toBe('buyer-wallet');
    expect(events[0].credits_charged).toBe(50);
  });

  test('recordUse creates usage event for free listing', () => {
    const service = new MarketplaceService(db, 'UNVERIFIED');

    const listing = service.createListing({
      agentId: 'agent-1',
      name: 'Free Service',
      description: 'test',
      category: 'coding',
    });

    service.recordUse(listing.id, 'buyer-wallet');

    const events = db.query('SELECT * FROM marketplace_usage_events WHERE listing_id = ?').all(listing.id) as any[];
    expect(events).toHaveLength(1);
    expect(events[0].credits_charged).toBe(0);
  });

  test('recordTierUse creates usage event with tier_id', () => {
    const service = new MarketplaceService(db, 'UNVERIFIED');

    const listing = service.createListing({
      agentId: 'agent-1',
      name: 'Tiered Service',
      description: 'test',
      category: 'coding',
      pricingModel: 'per_use',
      priceCredits: 10,
    });

    const tier = service.createTier(listing.id, {
      name: 'Pro',
      priceCredits: 100,
      billingCycle: 'one_time',
    });

    grantCredits(db, 'buyer-wallet', 1000);

    service.recordTierUse(listing.id, tier.id, 'buyer-wallet');

    const events = db.query('SELECT * FROM marketplace_usage_events WHERE listing_id = ?').all(listing.id) as any[];
    expect(events).toHaveLength(1);
    expect(events[0].tier_id).toBe(tier.id);
    expect(events[0].credits_charged).toBe(100);
  });
});
