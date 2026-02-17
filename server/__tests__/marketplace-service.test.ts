/**
 * Tests for Agent Marketplace:
 * - service.ts: Listing CRUD, search, reviews
 * - federation.ts: Instance registration, federated listings
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { MarketplaceService } from '../marketplace/service';
import { MarketplaceFederation } from '../marketplace/federation';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);

    // Migration 41 tables
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
        CREATE TABLE IF NOT EXISTS federated_instances (
            url TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            last_sync_at TEXT DEFAULT NULL,
            listing_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active'
        )
    `);

    return d;
}

// ─── Marketplace Service Tests ───────────────────────────────────────────────

describe('MarketplaceService', () => {
    let svc: MarketplaceService;

    beforeEach(() => {
        db = setupDb();
        svc = new MarketplaceService(db);
    });

    // ─── Listings ────────────────────────────────────────────────────────────

    test('createListing returns new listing in draft status', () => {
        const listing = svc.createListing({
            agentId: 'agent-1',
            name: 'Code Reviewer',
            description: 'Automated code review agent',
            category: 'coding',
        });

        expect(listing.id).toBeTruthy();
        expect(listing.name).toBe('Code Reviewer');
        expect(listing.status).toBe('draft');
        expect(listing.agentId).toBe('agent-1');
        expect(listing.category).toBe('coding');
        expect(listing.pricingModel).toBe('free');
        expect(listing.useCount).toBe(0);
    });

    test('getListing returns null for non-existent', () => {
        expect(svc.getListing('nonexistent')).toBeNull();
    });

    test('getListing returns created listing', () => {
        const created = svc.createListing({
            agentId: 'agent-1',
            name: 'Test',
            description: 'Test desc',
            category: 'general',
        });

        const fetched = svc.getListing(created.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.name).toBe('Test');
    });

    test('updateListing modifies fields', () => {
        const created = svc.createListing({
            agentId: 'agent-1',
            name: 'Original',
            description: 'Desc',
            category: 'coding',
        });

        const updated = svc.updateListing(created.id, {
            name: 'Updated',
            status: 'published',
            pricingModel: 'per_use',
            priceCredits: 10,
        });

        expect(updated).not.toBeNull();
        expect(updated!.name).toBe('Updated');
        expect(updated!.status).toBe('published');
        expect(updated!.pricingModel).toBe('per_use');
        expect(updated!.priceCredits).toBe(10);
    });

    test('updateListing returns null for non-existent', () => {
        expect(svc.updateListing('nope', { name: 'x' })).toBeNull();
    });

    test('deleteListing removes listing', () => {
        const created = svc.createListing({
            agentId: 'agent-1',
            name: 'ToDelete',
            description: 'Desc',
            category: 'general',
        });

        expect(svc.deleteListing(created.id)).toBe(true);
        expect(svc.getListing(created.id)).toBeNull();
    });

    test('deleteListing returns false for non-existent', () => {
        expect(svc.deleteListing('nope')).toBe(false);
    });

    test('getListingsByAgent returns only that agent listings', () => {
        svc.createListing({ agentId: 'agent-1', name: 'A1', description: 'd', category: 'coding' });
        svc.createListing({ agentId: 'agent-1', name: 'A2', description: 'd', category: 'coding' });
        svc.createListing({ agentId: 'agent-2', name: 'B1', description: 'd', category: 'coding' });

        const agent1 = svc.getListingsByAgent('agent-1');
        expect(agent1.length).toBe(2);

        const agent2 = svc.getListingsByAgent('agent-2');
        expect(agent2.length).toBe(1);
    });

    test('recordUse increments use count', () => {
        const listing = svc.createListing({
            agentId: 'agent-1',
            name: 'Counter',
            description: 'd',
            category: 'general',
        });

        svc.recordUse(listing.id);
        svc.recordUse(listing.id);

        const updated = svc.getListing(listing.id);
        expect(updated!.useCount).toBe(2);
    });

    // ─── Search ──────────────────────────────────────────────────────────────

    test('search returns only published listings', () => {
        svc.createListing({ agentId: 'a1', name: 'Draft', description: 'x', category: 'coding' });
        const pub = svc.createListing({ agentId: 'a1', name: 'Published', description: 'x', category: 'coding' });
        svc.updateListing(pub.id, { status: 'published' });

        const result = svc.search({});
        expect(result.total).toBe(1);
        expect(result.listings[0].name).toBe('Published');
    });

    test('search filters by category', () => {
        const l1 = svc.createListing({ agentId: 'a1', name: 'Coder', description: 'x', category: 'coding' });
        const l2 = svc.createListing({ agentId: 'a1', name: 'Writer', description: 'x', category: 'writing' });
        svc.updateListing(l1.id, { status: 'published' });
        svc.updateListing(l2.id, { status: 'published' });

        const result = svc.search({ category: 'coding' });
        expect(result.total).toBe(1);
        expect(result.listings[0].name).toBe('Coder');
    });

    test('search with query matches name/description', () => {
        const l1 = svc.createListing({
            agentId: 'a1',
            name: 'Smart Coder',
            description: 'AI coding assistant',
            category: 'coding',
        });
        const l2 = svc.createListing({
            agentId: 'a1',
            name: 'Data Analyst',
            description: 'Crunches numbers',
            category: 'data',
        });
        svc.updateListing(l1.id, { status: 'published' });
        svc.updateListing(l2.id, { status: 'published' });

        const result = svc.search({ query: 'coder' });
        expect(result.total).toBe(1);
        expect(result.listings[0].name).toBe('Smart Coder');
    });

    test('search paginates with limit/offset', () => {
        for (let i = 0; i < 5; i++) {
            const l = svc.createListing({
                agentId: 'a1',
                name: `Agent ${i}`,
                description: 'x',
                category: 'general',
            });
            svc.updateListing(l.id, { status: 'published' });
        }

        const page1 = svc.search({ limit: 2, offset: 0 });
        expect(page1.listings.length).toBe(2);
        expect(page1.total).toBe(5);

        const page2 = svc.search({ limit: 2, offset: 2 });
        expect(page2.listings.length).toBe(2);
    });

    // ─── Reviews ─────────────────────────────────────────────────────────────

    test('createReview updates listing stats', () => {
        const listing = svc.createListing({
            agentId: 'a1',
            name: 'Reviewable',
            description: 'x',
            category: 'general',
        });

        svc.createReview({
            listingId: listing.id,
            reviewerAgentId: 'reviewer-1',
            rating: 5,
            comment: 'Excellent!',
        });

        svc.createReview({
            listingId: listing.id,
            reviewerAgentId: 'reviewer-2',
            rating: 3,
            comment: 'Decent',
        });

        const updated = svc.getListing(listing.id);
        expect(updated!.reviewCount).toBe(2);
        expect(updated!.avgRating).toBe(4); // (5 + 3) / 2
    });

    test('getReviewsForListing returns reviews', () => {
        const listing = svc.createListing({
            agentId: 'a1',
            name: 'R',
            description: 'x',
            category: 'general',
        });

        svc.createReview({ listingId: listing.id, rating: 4, comment: 'Good' });
        svc.createReview({ listingId: listing.id, rating: 5, comment: 'Great' });

        const reviews = svc.getReviewsForListing(listing.id);
        expect(reviews.length).toBe(2);
    });

    test('deleteReview updates listing stats', () => {
        const listing = svc.createListing({
            agentId: 'a1',
            name: 'R',
            description: 'x',
            category: 'general',
        });

        const review = svc.createReview({ listingId: listing.id, rating: 5, comment: 'Great' });
        svc.createReview({ listingId: listing.id, rating: 1, comment: 'Bad' });

        expect(svc.getListing(listing.id)!.reviewCount).toBe(2);

        svc.deleteReview(review.id);
        const updated = svc.getListing(listing.id);
        expect(updated!.reviewCount).toBe(1);
        expect(updated!.avgRating).toBe(1); // Only the 1-star review remains
    });

    test('tags are stored and retrieved correctly', () => {
        const listing = svc.createListing({
            agentId: 'a1',
            name: 'Tagged',
            description: 'x',
            category: 'coding',
            tags: ['typescript', 'bun', 'fast'],
        });

        const fetched = svc.getListing(listing.id);
        expect(fetched!.tags).toEqual(['typescript', 'bun', 'fast']);
    });
});

// ─── Federation Tests ────────────────────────────────────────────────────────

describe('MarketplaceFederation', () => {
    let fed: MarketplaceFederation;

    beforeEach(() => {
        db = setupDb();
        fed = new MarketplaceFederation(db);
    });

    test('registerInstance adds instance', () => {
        const instance = fed.registerInstance('https://remote.example.com', 'Remote');
        expect(instance.url).toBe('https://remote.example.com');
        expect(instance.name).toBe('Remote');
        expect(instance.status).toBe('active');
    });

    test('registerInstance normalizes trailing slashes', () => {
        const instance = fed.registerInstance('https://remote.example.com///', 'Remote');
        expect(instance.url).toBe('https://remote.example.com');
    });

    test('listInstances returns all registered', () => {
        fed.registerInstance('https://a.example.com', 'A');
        fed.registerInstance('https://b.example.com', 'B');

        const list = fed.listInstances();
        expect(list.length).toBe(2);
    });

    test('removeInstance deletes instance', () => {
        fed.registerInstance('https://remove.example.com', 'ToRemove');
        expect(fed.removeInstance('https://remove.example.com')).toBe(true);
        expect(fed.listInstances().length).toBe(0);
    });

    test('removeInstance returns false for non-existent', () => {
        expect(fed.removeInstance('https://nope.example.com')).toBe(false);
    });

    test('getInstance returns null for non-existent', () => {
        expect(fed.getInstance('https://nope.example.com')).toBeNull();
    });

    test('getFederatedListings returns empty when no federated listings', () => {
        const listings = fed.getFederatedListings();
        expect(listings.length).toBe(0);
    });

    test('syncInstance marks unreachable on failure', async () => {
        fed.registerInstance('https://unreachable.invalid', 'Bad');

        await fed.syncInstance('https://unreachable.invalid');

        const instance = fed.getInstance('https://unreachable.invalid');
        expect(instance!.status).toBe('unreachable');
    });
});
