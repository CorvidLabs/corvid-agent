/**
 * Tests for marketplace pricing tiers:
 * - Tier CRUD on MarketplaceService
 * - Rate limiting per tier
 * - Tier-based billing (per-use and subscription)
 * - Route handlers for tier endpoints
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { getBalance, grantCredits } from '../db/credits';
import { runMigrations } from '../db/schema';
import { MarketplaceFederation } from '../marketplace/federation';
import { InsufficientCreditsError, MarketplaceService, RateLimitExceededError } from '../marketplace/service';
import { handleMarketplaceRoutes } from '../routes/marketplace';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;

function setupDb(): Database {
  const d = new Database(':memory:');
  runMigrations(d);

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
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
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

  return d;
}

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  const opts: RequestInit = { method };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json' };
  }
  return { req: new Request(url.toString(), opts), url };
}

// ─── Service Tests ──────────────────────────────────────────────────────────

describe('MarketplaceService — Pricing Tiers', () => {
  let svc: MarketplaceService;
  let listingId: string;

  beforeEach(() => {
    db = setupDb();
    svc = new MarketplaceService(db, 'UNVERIFIED');

    const listing = svc.createListing({
      agentId: 'agent-1',
      name: 'Code Reviewer',
      description: 'Automated code review',
      category: 'coding',
      pricingModel: 'per_use',
      priceCredits: 10,
    });
    listingId = listing.id;
  });

  // ─── CRUD ────────────────────────────────────────────────────────────

  test('createTier creates a new pricing tier', () => {
    const tier = svc.createTier(listingId, {
      name: 'Basic',
      priceCredits: 5,
    });

    expect(tier.id).toBeTruthy();
    expect(tier.listingId).toBe(listingId);
    expect(tier.name).toBe('Basic');
    expect(tier.priceCredits).toBe(5);
    expect(tier.billingCycle).toBe('one_time');
    expect(tier.rateLimit).toBe(0);
    expect(tier.features).toEqual([]);
    expect(tier.sortOrder).toBe(0);
  });

  test('createTier with all fields', () => {
    const tier = svc.createTier(listingId, {
      name: 'Pro',
      description: 'Professional tier with priority access',
      priceCredits: 50,
      billingCycle: 'monthly',
      rateLimit: 1000,
      features: ['priority-queue', 'detailed-reports'],
      sortOrder: 1,
    });

    expect(tier.name).toBe('Pro');
    expect(tier.description).toBe('Professional tier with priority access');
    expect(tier.priceCredits).toBe(50);
    expect(tier.billingCycle).toBe('monthly');
    expect(tier.rateLimit).toBe(1000);
    expect(tier.features).toEqual(['priority-queue', 'detailed-reports']);
    expect(tier.sortOrder).toBe(1);
  });

  test('createTier throws for nonexistent listing', () => {
    expect(() =>
      svc.createTier('nonexistent', {
        name: 'Basic',
        priceCredits: 5,
      }),
    ).toThrow('Listing nonexistent not found');
  });

  test('createTier enforces max 5 tiers per listing', () => {
    for (let i = 0; i < 5; i++) {
      svc.createTier(listingId, { name: `Tier ${i}`, priceCredits: i * 10 });
    }

    expect(() =>
      svc.createTier(listingId, {
        name: 'Too Many',
        priceCredits: 100,
      }),
    ).toThrow('Maximum of 5 tiers per listing');
  });

  test('getTiersForListing returns tiers sorted by sort_order', () => {
    svc.createTier(listingId, { name: 'Pro', priceCredits: 50, sortOrder: 2 });
    svc.createTier(listingId, { name: 'Basic', priceCredits: 5, sortOrder: 0 });
    svc.createTier(listingId, { name: 'Standard', priceCredits: 20, sortOrder: 1 });

    const tiers = svc.getTiersForListing(listingId);
    expect(tiers).toHaveLength(3);
    expect(tiers[0].name).toBe('Basic');
    expect(tiers[1].name).toBe('Standard');
    expect(tiers[2].name).toBe('Pro');
  });

  test('getTiersForListing returns empty for listing with no tiers', () => {
    expect(svc.getTiersForListing(listingId)).toEqual([]);
  });

  test('getTier returns null for nonexistent', () => {
    expect(svc.getTier('nonexistent')).toBeNull();
  });

  test('updateTier updates fields', () => {
    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });
    const updated = svc.updateTier(tier.id, {
      name: 'Starter',
      priceCredits: 10,
      rateLimit: 100,
      features: ['basic-support'],
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Starter');
    expect(updated!.priceCredits).toBe(10);
    expect(updated!.rateLimit).toBe(100);
    expect(updated!.features).toEqual(['basic-support']);
  });

  test('updateTier returns null for nonexistent', () => {
    expect(svc.updateTier('nonexistent', { name: 'X' })).toBeNull();
  });

  test('updateTier with no changes returns existing tier', () => {
    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });
    const same = svc.updateTier(tier.id, {});
    expect(same).not.toBeNull();
    expect(same!.name).toBe('Basic');
  });

  test('deleteTier removes the tier', () => {
    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });
    expect(svc.deleteTier(tier.id)).toBe(true);
    expect(svc.getTier(tier.id)).toBeNull();
  });

  test('deleteTier returns false for nonexistent', () => {
    expect(svc.deleteTier('nonexistent')).toBe(false);
  });

  // ─── Price Sync ──────────────────────────────────────────────────────

  test('createTier syncs listing price_credits to minimum tier price', () => {
    svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });
    svc.createTier(listingId, { name: 'Pro', priceCredits: 50 });

    const listing = svc.getListing(listingId)!;
    expect(listing.priceCredits).toBe(5); // Min of tiers
  });

  test('deleteTier updates listing price to remaining minimum', () => {
    const basic = svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });
    svc.createTier(listingId, { name: 'Pro', priceCredits: 50 });

    svc.deleteTier(basic.id);

    const listing = svc.getListing(listingId)!;
    expect(listing.priceCredits).toBe(50);
  });

  test('updateTier syncs listing price', () => {
    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });
    svc.createTier(listingId, { name: 'Pro', priceCredits: 50 });

    svc.updateTier(tier.id, { priceCredits: 25 });

    const listing = svc.getListing(listingId)!;
    expect(listing.priceCredits).toBe(25); // New min
  });

  // ─── Rate Limiting ──────────────────────────────────────────────────

  test('checkTierRateLimit returns true when no limit', () => {
    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 5, rateLimit: 0 });
    expect(svc.checkTierRateLimit(tier.id, 'buyer-1')).toBe(true);
  });

  test('checkTierRateLimit returns true when under limit', () => {
    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 5, rateLimit: 10 });
    expect(svc.checkTierRateLimit(tier.id, 'buyer-1')).toBe(true);
  });

  test('checkTierRateLimit returns false when at limit', () => {
    const tier = svc.createTier(listingId, { name: 'Limited', priceCredits: 5, rateLimit: 2 });

    // Simulate 2 uses by inserting tracking records
    for (let i = 0; i < 2; i++) {
      db.query(`
                INSERT INTO credit_transactions
                    (wallet_address, type, amount, balance_after, reference)
                VALUES (?, 'tier_use_tracking', 0, 0, ?)
            `).run('buyer-1', `tier_use:${tier.id}:${crypto.randomUUID()}`);
    }

    expect(svc.checkTierRateLimit(tier.id, 'buyer-1')).toBe(false);
  });

  // ─── Tier-Based Use ─────────────────────────────────────────────────

  test('recordTierUse deducts credits for paid tier', () => {
    grantCredits(db, 'buyer-1', 100, 'test_setup');

    // Set seller wallet on listing
    db.query("UPDATE marketplace_listings SET tenant_id = 'seller-1' WHERE id = ?").run(listingId);

    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 15 });

    const result = svc.recordTierUse(listingId, tier.id, 'buyer-1');
    expect(result.success).toBe(true);
    expect(result.creditsDeducted).toBe(15);
    expect(result.escrowId).toBeTruthy();

    const balance = getBalance(db, 'buyer-1');
    expect(balance.credits).toBe(85);
  });

  test('recordTierUse works for free tier', () => {
    const tier = svc.createTier(listingId, { name: 'Free', priceCredits: 0 });
    const result = svc.recordTierUse(listingId, tier.id, 'buyer-1');
    expect(result.success).toBe(true);
    expect(result.creditsDeducted).toBe(0);
  });

  test('recordTierUse throws InsufficientCreditsError', () => {
    grantCredits(db, 'buyer-1', 5, 'test_setup');
    db.query("UPDATE marketplace_listings SET tenant_id = 'seller-1' WHERE id = ?").run(listingId);

    const tier = svc.createTier(listingId, { name: 'Expensive', priceCredits: 100 });

    expect(() => svc.recordTierUse(listingId, tier.id, 'buyer-1')).toThrow(InsufficientCreditsError);
  });

  test('recordTierUse throws RateLimitExceededError when limit hit', () => {
    grantCredits(db, 'buyer-1', 1000, 'test_setup');
    db.query("UPDATE marketplace_listings SET tenant_id = 'seller-1' WHERE id = ?").run(listingId);

    const tier = svc.createTier(listingId, { name: 'Limited', priceCredits: 5, rateLimit: 1 });

    // First use should succeed
    svc.recordTierUse(listingId, tier.id, 'buyer-1');

    // Second use should hit rate limit
    expect(() => svc.recordTierUse(listingId, tier.id, 'buyer-1')).toThrow(RateLimitExceededError);
  });

  test('recordTierUse fails for wrong listing', () => {
    const otherListing = svc.createListing({
      agentId: 'agent-2',
      name: 'Other',
      description: 'Other',
      category: 'general',
    });
    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });

    const result = svc.recordTierUse(otherListing.id, tier.id, 'buyer-1');
    expect(result.success).toBe(false);
  });

  test('recordTierUse increments use_count', () => {
    const tier = svc.createTier(listingId, { name: 'Free', priceCredits: 0 });
    svc.recordTierUse(listingId, tier.id, 'buyer-1');
    svc.recordTierUse(listingId, tier.id, 'buyer-1');

    const listing = svc.getListing(listingId)!;
    expect(listing.useCount).toBe(2);
  });
});

// ─── Route Tests ────────────────────────────────────────────────────────────

describe('Pricing Tier Routes', () => {
  let svc: MarketplaceService;
  let federation: MarketplaceFederation;
  let listingId: string;

  beforeEach(() => {
    db = setupDb();
    db.exec(`
            CREATE TABLE IF NOT EXISTS federated_instances (
                url TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                last_sync_at TEXT DEFAULT NULL,
                listing_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active'
            )
        `);

    svc = new MarketplaceService(db, 'UNVERIFIED');
    federation = new MarketplaceFederation(db);

    const listing = svc.createListing({
      agentId: 'agent-1',
      name: 'Test Service',
      description: 'Test',
      category: 'coding',
      pricingModel: 'per_use',
      priceCredits: 10,
    });
    listingId = listing.id;
  });

  test('GET /api/marketplace/listings/:id/tiers returns tiers', async () => {
    svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });
    svc.createTier(listingId, { name: 'Pro', priceCredits: 50 });

    const { req, url } = fakeReq('GET', `/api/marketplace/listings/${listingId}/tiers`);
    const res = await handleMarketplaceRoutes(req, url, db, svc, federation)!;
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('Basic');
    expect(data[1].name).toBe('Pro');
  });

  test('POST /api/marketplace/listings/:id/tiers creates a tier', async () => {
    const { req, url } = fakeReq('POST', `/api/marketplace/listings/${listingId}/tiers`, {
      name: 'Enterprise',
      priceCredits: 200,
      billingCycle: 'monthly',
      rateLimit: 5000,
      features: ['dedicated-support', 'custom-model'],
    });
    const res = await handleMarketplaceRoutes(req, url, db, svc, federation)!;
    expect(res.status).toBe(201);

    const tier = await res.json();
    expect(tier.name).toBe('Enterprise');
    expect(tier.priceCredits).toBe(200);
    expect(tier.billingCycle).toBe('monthly');
    expect(tier.rateLimit).toBe(5000);
    expect(tier.features).toEqual(['dedicated-support', 'custom-model']);
  });

  test('GET /api/marketplace/tiers/:id returns a tier', async () => {
    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });

    const { req, url } = fakeReq('GET', `/api/marketplace/tiers/${tier.id}`);
    const res = await handleMarketplaceRoutes(req, url, db, svc, federation)!;
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe('Basic');
  });

  test('GET /api/marketplace/tiers/:id returns 404 for nonexistent', async () => {
    const { req, url } = fakeReq('GET', '/api/marketplace/tiers/nonexistent');
    const res = await handleMarketplaceRoutes(req, url, db, svc, federation)!;
    expect(res.status).toBe(404);
  });

  test('PUT /api/marketplace/tiers/:id updates a tier', async () => {
    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });

    const { req, url } = fakeReq('PUT', `/api/marketplace/tiers/${tier.id}`, {
      name: 'Starter',
      priceCredits: 10,
    });
    const res = await handleMarketplaceRoutes(req, url, db, svc, federation)!;
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe('Starter');
    expect(data.priceCredits).toBe(10);
  });

  test('DELETE /api/marketplace/tiers/:id deletes a tier', async () => {
    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 5 });

    const { req, url } = fakeReq('DELETE', `/api/marketplace/tiers/${tier.id}`);
    const res = await handleMarketplaceRoutes(req, url, db, svc, federation)!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('DELETE /api/marketplace/tiers/:id returns 404 for nonexistent', async () => {
    const { req, url } = fakeReq('DELETE', '/api/marketplace/tiers/nonexistent');
    const res = await handleMarketplaceRoutes(req, url, db, svc, federation)!;
    expect(res.status).toBe(404);
  });

  test('POST /api/marketplace/listings/:id/tier-use with valid tier', async () => {
    grantCredits(db, 'buyer-1', 100, 'test_setup');
    db.query("UPDATE marketplace_listings SET tenant_id = 'seller-1' WHERE id = ?").run(listingId);

    const tier = svc.createTier(listingId, { name: 'Basic', priceCredits: 15 });

    const { req, url } = fakeReq('POST', `/api/marketplace/listings/${listingId}/tier-use`, {
      tierId: tier.id,
    });
    const context = { tenantId: 'buyer-1', walletAddress: 'buyer-1', role: 'operator' as const, authenticated: true };
    const res = await handleMarketplaceRoutes(req, url, db, svc, federation, context)!;
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.creditsDeducted).toBe(15);
  });

  test('POST /api/marketplace/listings/:id/tier-use returns 429 on rate limit', async () => {
    grantCredits(db, 'buyer-1', 1000, 'test_setup');
    db.query("UPDATE marketplace_listings SET tenant_id = 'seller-1' WHERE id = ?").run(listingId);

    const tier = svc.createTier(listingId, { name: 'Limited', priceCredits: 5, rateLimit: 1 });

    const context = { tenantId: 'buyer-1', walletAddress: 'buyer-1', role: 'operator' as const, authenticated: true };

    // First use succeeds
    const { req: req1, url: url1 } = fakeReq('POST', `/api/marketplace/listings/${listingId}/tier-use`, {
      tierId: tier.id,
    });
    const res1 = await handleMarketplaceRoutes(req1, url1, db, svc, federation, context)!;
    expect(res1.status).toBe(200);

    // Second use hits rate limit
    const { req: req2, url: url2 } = fakeReq('POST', `/api/marketplace/listings/${listingId}/tier-use`, {
      tierId: tier.id,
    });
    const res2 = await handleMarketplaceRoutes(req2, url2, db, svc, federation, context)!;
    expect(res2.status).toBe(429);
  });
});
