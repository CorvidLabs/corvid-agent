/**
 * Tests for marketplace verification gate — listings require minimum tier.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { MarketplaceService } from '../marketplace/service';
import { IdentityVerification } from '../reputation/identity-verification';

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
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Marketplace Verification Gate', () => {
    let svc: MarketplaceService;
    let iv: IdentityVerification;

    beforeEach(() => {
        db = setupDb();
        svc = new MarketplaceService(db); // Default min tier = GITHUB_VERIFIED
        iv = new IdentityVerification(db);
    });

    test('canPublish returns false for UNVERIFIED agent', () => {
        const result = svc.canPublish('unverified-agent');
        expect(result.allowed).toBe(false);
        expect(result.tier).toBe('UNVERIFIED');
        expect(result.required).toBe('GITHUB_VERIFIED');
    });

    test('canPublish returns true for GITHUB_VERIFIED agent', () => {
        iv.setTier('verified-agent', 'GITHUB_VERIFIED');
        const result = svc.canPublish('verified-agent');
        expect(result.allowed).toBe(true);
    });

    test('canPublish returns true for higher tier', () => {
        iv.setTier('established-agent', 'ESTABLISHED');
        const result = svc.canPublish('established-agent');
        expect(result.allowed).toBe(true);
    });

    test('UNVERIFIED agent can create draft but not publish', () => {
        const listing = svc.createListing({
            agentId: 'unverified-agent',
            name: 'Test',
            description: 'Desc',
            category: 'coding',
        });
        expect(listing.status).toBe('draft');

        // Try to publish — should be blocked
        const result = svc.updateListing(listing.id, { status: 'published' });
        expect(result).toBeNull();

        // Verify still in draft
        const check = svc.getListing(listing.id);
        expect(check!.status).toBe('draft');
    });

    test('GITHUB_VERIFIED agent can publish', () => {
        iv.setTier('gh-agent', 'GITHUB_VERIFIED');

        const listing = svc.createListing({
            agentId: 'gh-agent',
            name: 'Verified Listing',
            description: 'Desc',
            category: 'coding',
        });

        const published = svc.updateListing(listing.id, { status: 'published' });
        expect(published).not.toBeNull();
        expect(published!.status).toBe('published');
    });

    test('getListingVerificationTier returns tier for listing', () => {
        iv.setTier('gh-agent', 'GITHUB_VERIFIED');

        const listing = svc.createListing({
            agentId: 'gh-agent',
            name: 'Test',
            description: 'Desc',
            category: 'general',
        });

        const tier = svc.getListingVerificationTier(listing.id);
        expect(tier).toBe('GITHUB_VERIFIED');
    });

    test('getListingVerificationTier returns null for unknown listing', () => {
        expect(svc.getListingVerificationTier('nonexistent')).toBeNull();
    });

    test('custom min tier via constructor', () => {
        // Allow UNVERIFIED to publish
        const lenientSvc = new MarketplaceService(db, 'UNVERIFIED');
        const listing = lenientSvc.createListing({
            agentId: 'any-agent',
            name: 'Open Listing',
            description: 'Desc',
            category: 'general',
        });

        const published = lenientSvc.updateListing(listing.id, { status: 'published' });
        expect(published).not.toBeNull();
        expect(published!.status).toBe('published');
    });

    test('search with minVerificationTier filters results', () => {
        // Create two agents: one verified, one not
        iv.setTier('gh-agent', 'GITHUB_VERIFIED');

        const l1 = svc.createListing({
            agentId: 'gh-agent',
            name: 'Verified',
            description: 'x',
            category: 'coding',
        });
        // Publish directly by setting verified tier
        // Use a lenient service for setup
        const setupSvc = new MarketplaceService(db, 'UNVERIFIED');
        setupSvc.updateListing(l1.id, { status: 'published' });

        const l2 = setupSvc.createListing({
            agentId: 'no-verify',
            name: 'Unverified',
            description: 'x',
            category: 'coding',
        });
        setupSvc.updateListing(l2.id, { status: 'published' });

        // Search with tier filter
        const filtered = svc.search({ minVerificationTier: 'GITHUB_VERIFIED' });
        expect(filtered.total).toBe(1);
        expect(filtered.listings[0].name).toBe('Verified');

        // Search without filter returns both
        const all = svc.search({});
        expect(all.total).toBe(2);
    });
});
