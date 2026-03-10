/**
 * Tests for marketplace free trial periods:
 * - TrialService CRUD and lifecycle
 * - Usage-based trial consumption
 * - Time-based trial expiry
 * - Integration with per-use billing (trial bypasses billing)
 * - Integration with subscription billing (trial before subscription)
 * - Route handlers for trial endpoints
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { MarketplaceService } from '../marketplace/service';
import { TrialService } from '../marketplace/trials';
import { grantCredits, getBalance } from '../db/credits';
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

    d.exec(`
        CREATE TABLE IF NOT EXISTS marketplace_trials (
            id              TEXT PRIMARY KEY,
            listing_id      TEXT NOT NULL,
            tenant_id       TEXT NOT NULL,
            uses_remaining  INTEGER DEFAULT NULL,
            expires_at      TEXT DEFAULT NULL,
            status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted')),
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    d.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_trials_listing_tenant ON marketplace_trials(listing_id, tenant_id)');

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

// ─── TrialService Tests ─────────────────────────────────────────────────────

describe('TrialService', () => {
    let svc: MarketplaceService;
    let trials: TrialService;

    beforeEach(() => {
        db = setupDb();
        svc = new MarketplaceService(db, 'UNVERIFIED');
        trials = new TrialService(db);
    });

    describe('startTrial', () => {
        test('creates usage-based trial for per_use listing', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Code Reviewer',
                description: 'AI code review',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
                trialUses: 5,
            });

            const trial = trials.startTrial(listing, 'buyer-1');
            expect(trial).not.toBeNull();
            expect(trial!.listingId).toBe(listing.id);
            expect(trial!.tenantId).toBe('buyer-1');
            expect(trial!.usesRemaining).toBe(5);
            expect(trial!.expiresAt).toBeNull();
            expect(trial!.status).toBe('active');
        });

        test('creates time-based trial for subscription listing', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Data Analyzer',
                description: 'AI data analysis',
                category: 'data',
                pricingModel: 'subscription',
                priceCredits: 100,
                trialDays: 7,
            });

            const trial = trials.startTrial(listing, 'buyer-1');
            expect(trial).not.toBeNull();
            expect(trial!.usesRemaining).toBeNull();
            expect(trial!.expiresAt).not.toBeNull();
            expect(trial!.status).toBe('active');

            // Expiry should be ~7 days from now
            const expiresAt = new Date(trial!.expiresAt! + 'Z');
            const now = new Date();
            const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            expect(diffDays).toBeGreaterThan(6.9);
            expect(diffDays).toBeLessThan(7.1);
        });

        test('creates trial with both uses and days', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Hybrid Trial',
                description: 'Both uses and days',
                category: 'general',
                pricingModel: 'per_use',
                priceCredits: 20,
                trialUses: 10,
                trialDays: 14,
            });

            const trial = trials.startTrial(listing, 'buyer-1');
            expect(trial).not.toBeNull();
            expect(trial!.usesRemaining).toBe(10);
            expect(trial!.expiresAt).not.toBeNull();
        });

        test('returns null for listing without trial config', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'No Trial',
                description: 'Paid listing without trial',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
            });

            const trial = trials.startTrial(listing, 'buyer-1');
            expect(trial).toBeNull();
        });

        test('returns null if trial already exists', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Code Reviewer',
                description: 'AI code review',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
                trialUses: 5,
            });

            const first = trials.startTrial(listing, 'buyer-1');
            expect(first).not.toBeNull();

            const second = trials.startTrial(listing, 'buyer-1');
            expect(second).toBeNull();
        });

        test('allows different buyers to start separate trials', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Code Reviewer',
                description: 'AI code review',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
                trialUses: 5,
            });

            const t1 = trials.startTrial(listing, 'buyer-1');
            const t2 = trials.startTrial(listing, 'buyer-2');
            expect(t1).not.toBeNull();
            expect(t2).not.toBeNull();
            expect(t1!.id).not.toBe(t2!.id);
        });
    });

    describe('consumeTrialUse', () => {
        test('decrements uses_remaining', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Code Reviewer',
                description: 'AI code review',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
                trialUses: 3,
            });

            const trial = trials.startTrial(listing, 'buyer-1')!;
            expect(trial.usesRemaining).toBe(3);

            expect(trials.consumeTrialUse(trial.id)).toBe(true);
            const updated = trials.getTrialById(trial.id)!;
            expect(updated.usesRemaining).toBe(2);
        });

        test('expires trial when uses reach 0', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Code Reviewer',
                description: 'AI code review',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
                trialUses: 1,
            });

            const trial = trials.startTrial(listing, 'buyer-1')!;
            expect(trials.consumeTrialUse(trial.id)).toBe(true);

            const expired = trials.getTrialById(trial.id)!;
            expect(expired.status).toBe('expired');
            expect(expired.usesRemaining).toBe(0);
        });

        test('returns false for expired trial', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Code Reviewer',
                description: 'AI code review',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
                trialUses: 1,
            });

            const trial = trials.startTrial(listing, 'buyer-1')!;
            trials.consumeTrialUse(trial.id); // exhausts trial
            expect(trials.consumeTrialUse(trial.id)).toBe(false);
        });

        test('returns false for nonexistent trial', () => {
            expect(trials.consumeTrialUse('nonexistent')).toBe(false);
        });
    });

    describe('getActiveTrial', () => {
        test('returns active trial', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Code Reviewer',
                description: 'AI code review',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
                trialUses: 5,
            });

            trials.startTrial(listing, 'buyer-1');
            const active = trials.getActiveTrial(listing.id, 'buyer-1');
            expect(active).not.toBeNull();
            expect(active!.status).toBe('active');
        });

        test('returns null for expired trial', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Code Reviewer',
                description: 'AI code review',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
                trialUses: 1,
            });

            const trial = trials.startTrial(listing, 'buyer-1')!;
            trials.consumeTrialUse(trial.id); // exhaust
            const active = trials.getActiveTrial(listing.id, 'buyer-1');
            expect(active).toBeNull();
        });

        test('returns null for time-expired trial', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Expired Time Trial',
                description: 'Time trial',
                category: 'general',
                pricingModel: 'subscription',
                priceCredits: 50,
                trialDays: 7,
            });

            trials.startTrial(listing, 'buyer-1');

            // Manually set expires_at to the past
            db.query(`
                UPDATE marketplace_trials SET expires_at = datetime('now', '-1 day')
                WHERE tenant_id = 'buyer-1'
            `).run();

            const active = trials.getActiveTrial(listing.id, 'buyer-1');
            expect(active).toBeNull();
        });

        test('returns null when no trial exists', () => {
            const active = trials.getActiveTrial('nonexistent', 'buyer-1');
            expect(active).toBeNull();
        });
    });

    describe('convertTrial', () => {
        test('marks trial as converted', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Code Reviewer',
                description: 'AI code review',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
                trialUses: 5,
            });

            const trial = trials.startTrial(listing, 'buyer-1')!;
            const converted = trials.convertTrial(trial.id);
            expect(converted).not.toBeNull();
            expect(converted!.status).toBe('converted');
        });

        test('returns null for nonexistent trial', () => {
            expect(trials.convertTrial('nonexistent')).toBeNull();
        });
    });

    describe('expireTrials (scheduler)', () => {
        test('expires time-based trials past expires_at', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Time Trial',
                description: 'Time trial listing',
                category: 'general',
                pricingModel: 'subscription',
                priceCredits: 50,
                trialDays: 7,
            });

            trials.startTrial(listing, 'buyer-1');
            trials.startTrial(listing, 'buyer-2');

            // Manually expire buyer-1's trial
            db.query(`
                UPDATE marketplace_trials SET expires_at = datetime('now', '-1 day')
                WHERE tenant_id = 'buyer-1'
            `).run();

            const expired = trials.expireTrials();
            expect(expired).toBe(1);

            const t1 = trials.getTrial(listing.id, 'buyer-1')!;
            expect(t1.status).toBe('expired');

            const t2 = trials.getTrial(listing.id, 'buyer-2')!;
            expect(t2.status).toBe('active');
        });

        test('does not expire usage-only trials', () => {
            const listing = svc.createListing({
                agentId: 'agent-1',
                name: 'Usage Trial',
                description: 'Usage trial only',
                category: 'coding',
                pricingModel: 'per_use',
                priceCredits: 10,
                trialUses: 5,
            });

            trials.startTrial(listing, 'buyer-1');
            const expired = trials.expireTrials();
            expect(expired).toBe(0);
        });
    });
});

// ─── Listing Trial Config Tests ─────────────────────────────────────────────

describe('Listing trial configuration', () => {
    let svc: MarketplaceService;

    beforeEach(() => {
        db = setupDb();
        svc = new MarketplaceService(db, 'UNVERIFIED');
    });

    test('createListing with trialUses', () => {
        const listing = svc.createListing({
            agentId: 'agent-1',
            name: 'Trial Listing',
            description: 'Has trial uses',
            category: 'coding',
            pricingModel: 'per_use',
            priceCredits: 10,
            trialUses: 5,
        });

        expect(listing.trialUses).toBe(5);
        expect(listing.trialDays).toBeNull();
    });

    test('createListing with trialDays', () => {
        const listing = svc.createListing({
            agentId: 'agent-1',
            name: 'Trial Listing',
            description: 'Has trial days',
            category: 'data',
            pricingModel: 'subscription',
            priceCredits: 100,
            trialDays: 14,
        });

        expect(listing.trialUses).toBeNull();
        expect(listing.trialDays).toBe(14);
    });

    test('updateListing trial fields', () => {
        const listing = svc.createListing({
            agentId: 'agent-1',
            name: 'No Trial Yet',
            description: 'Will add trial',
            category: 'coding',
            pricingModel: 'per_use',
            priceCredits: 10,
        });

        const updated = svc.updateListing(listing.id, { trialUses: 3 });
        expect(updated!.trialUses).toBe(3);

        // Remove trial
        const removed = svc.updateListing(listing.id, { trialUses: null });
        expect(removed!.trialUses).toBeNull();
    });
});

// ─── Route Tests ──────────────────────────────────────────────────────────

describe('Marketplace trial routes', () => {
    let svc: MarketplaceService;
    let listingId: string;

    beforeEach(() => {
        db = setupDb();
        svc = new MarketplaceService(db, 'UNVERIFIED');
        const listing = svc.createListing({
            agentId: 'agent-1',
            name: 'Trial Agent',
            description: 'Agent with trials',
            category: 'coding',
            pricingModel: 'per_use',
            priceCredits: 10,
            trialUses: 3,
        });
        listingId = listing.id;
    });

    test('POST /api/marketplace/listings/:id/trial starts a trial', async () => {
        const { req, url } = fakeReq('POST', `/api/marketplace/listings/${listingId}/trial`, {
            tenantId: 'buyer-1',
        });

        const res = await handleMarketplaceRoutes(req, url, db, svc, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);

        const body = await res!.json();
        expect(body.listingId).toBe(listingId);
        expect(body.tenantId).toBe('buyer-1');
        expect(body.usesRemaining).toBe(3);
        expect(body.status).toBe('active');
    });

    test('POST /api/marketplace/listings/:id/trial returns 400 for duplicate', async () => {
        const trials = new TrialService(db);
        const listing = svc.getListing(listingId)!;
        trials.startTrial(listing, 'buyer-1');

        const { req, url } = fakeReq('POST', `/api/marketplace/listings/${listingId}/trial`, {
            tenantId: 'buyer-1',
        });

        const res = await handleMarketplaceRoutes(req, url, db, svc, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    test('POST /api/marketplace/listings/:id/trial returns 400 for no-trial listing', async () => {
        const noTrialListing = svc.createListing({
            agentId: 'agent-2',
            name: 'No Trial',
            description: 'No trial available',
            category: 'coding',
            pricingModel: 'per_use',
            priceCredits: 10,
        });

        const { req, url } = fakeReq('POST', `/api/marketplace/listings/${noTrialListing.id}/trial`, {
            tenantId: 'buyer-1',
        });

        const res = await handleMarketplaceRoutes(req, url, db, svc, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });

    test('GET /api/marketplace/listings/:id/trial returns trial status', async () => {
        const trials = new TrialService(db);
        const listing = svc.getListing(listingId)!;
        trials.startTrial(listing, 'buyer-1');

        const { req, url } = fakeReq('GET', `/api/marketplace/listings/${listingId}/trial?tenantId=buyer-1`);

        const res = await handleMarketplaceRoutes(req, url, db, svc, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);

        const body = await res!.json();
        expect(body.status).toBe('active');
        expect(body.usesRemaining).toBe(3);
    });

    test('GET /api/marketplace/listings/:id/trial returns 404 for no trial', async () => {
        const { req, url } = fakeReq('GET', `/api/marketplace/listings/${listingId}/trial?tenantId=buyer-1`);

        const res = await handleMarketplaceRoutes(req, url, db, svc, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    test('GET /api/marketplace/listings/:id/trial returns 400 without tenantId', async () => {
        const { req, url } = fakeReq('GET', `/api/marketplace/listings/${listingId}/trial`);

        const res = await handleMarketplaceRoutes(req, url, db, svc, null);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(400);
    });
});

// ─── Per-Use Billing Integration ────────────────────────────────────────────

describe('Trial integration with per-use billing', () => {
    let svc: MarketplaceService;
    let listingId: string;

    beforeEach(() => {
        db = setupDb();
        svc = new MarketplaceService(db, 'UNVERIFIED');

        const listing = svc.createListing({
            agentId: 'agent-seller',
            name: 'Paid Agent',
            description: 'Requires credits',
            category: 'coding',
            pricingModel: 'per_use',
            priceCredits: 10,
            trialUses: 2,
        });
        listingId = listing.id;

        // Set up seller tenant_id
        db.query("UPDATE marketplace_listings SET tenant_id = 'seller-wallet' WHERE id = ?").run(listingId);

        // Grant buyer credits
        grantCredits(db, 'buyer-wallet', 100, 'test');
    });

    test('trial use does not deduct credits', async () => {
        // Start trial
        const { req: startReq, url: startUrl } = fakeReq('POST', `/api/marketplace/listings/${listingId}/trial`, {
            tenantId: 'buyer-wallet',
        });
        const startRes = await handleMarketplaceRoutes(startReq, startUrl, db, svc, null);
        expect(startRes!.status).toBe(201);

        // Use listing (should use trial)
        const context = { walletAddress: 'buyer-wallet', tenantId: 'buyer-wallet', role: 'operator' as const, authenticated: true };
        const { req: useReq, url: useUrl } = fakeReq('POST', `/api/marketplace/listings/${listingId}/use`);
        const useRes = await handleMarketplaceRoutes(useReq, useUrl, db, svc, null, context);
        expect(useRes).not.toBeNull();
        expect(useRes!.status).toBe(200);

        const useBody = await useRes!.json();
        expect(useBody.ok).toBe(true);
        expect(useBody.creditsDeducted).toBe(0);
        expect(useBody.trial).toBe(true);
        expect(useBody.trialUsesRemaining).toBe(1);

        // Verify buyer credits unchanged
        const balance = getBalance(db, 'buyer-wallet');
        expect(balance.credits).toBe(100);
    });

    test('after trial exhausted, billing kicks in', async () => {
        // Start trial
        const listing = svc.getListing(listingId)!;
        const trials = new TrialService(db);
        trials.startTrial(listing, 'buyer-wallet');

        // Exhaust trial uses
        const trial = trials.getActiveTrial(listingId, 'buyer-wallet')!;
        trials.consumeTrialUse(trial.id);
        trials.consumeTrialUse(trial.id);

        // Now use should bill
        const context = { walletAddress: 'buyer-wallet', tenantId: 'buyer-wallet', role: 'operator' as const, authenticated: true };
        const { req, url } = fakeReq('POST', `/api/marketplace/listings/${listingId}/use`);
        const res = await handleMarketplaceRoutes(req, url, db, svc, null, context);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);

        const body = await res!.json();
        expect(body.creditsDeducted).toBe(10);
        expect(body.trial).toBeUndefined();

        const balance = getBalance(db, 'buyer-wallet');
        expect(balance.credits).toBe(90);
    });
});
