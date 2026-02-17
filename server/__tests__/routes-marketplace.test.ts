import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleMarketplaceRoutes } from '../routes/marketplace';
import { MarketplaceService } from '../marketplace/service';
import { MarketplaceFederation } from '../marketplace/federation';

let db: Database;
let marketplace: MarketplaceService;
let federation: MarketplaceFederation;
let agentId: string;

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    // Seed an agent (marketplace_listings.agent_id is NOT a FK in the schema,
    // but we create one for realistic testing)
    agentId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Test Agent')").run(agentId);

    marketplace = new MarketplaceService(db);
    federation = new MarketplaceFederation(db);
});

afterAll(() => db.close());

describe('Marketplace Routes', () => {
    // ─── Service unavailable when marketplace is not provided ─────────────────

    it('returns 503 when marketplace service is not available', async () => {
        const { req, url } = fakeReq('GET', '/api/marketplace/listings');
        const res = await handleMarketplaceRoutes(req, url, db, undefined, undefined);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
        const data = await res!.json();
        expect(data.error).toContain('Marketplace not available');
    });

    it('returns null for non-marketplace paths when service is unavailable', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleMarketplaceRoutes(req, url, db, undefined, undefined);
        expect(res).toBeNull();
    });

    // ─── Listings CRUD ───────────────────────────────────────────────────────

    let listingId: string;

    it('POST /api/marketplace/listings creates a listing', async () => {
        const { req, url } = fakeReq('POST', '/api/marketplace/listings', {
            agentId,
            name: 'Code Reviewer',
            description: 'AI-powered code reviews',
            category: 'coding',
        });
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.name).toBe('Code Reviewer');
        expect(data.description).toBe('AI-powered code reviews');
        expect(data.category).toBe('coding');
        expect(data.agentId).toBe(agentId);
        expect(data.status).toBe('draft');
        listingId = data.id;
    });

    it('POST /api/marketplace/listings rejects missing required fields', async () => {
        const { req, url } = fakeReq('POST', '/api/marketplace/listings', {
            name: 'No Agent',
        });
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toBeDefined();
    });

    it('GET /api/marketplace/listings returns listings', async () => {
        const { req, url } = fakeReq('GET', '/api/marketplace/listings');
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        // Returns a search result since getListingsByAgent is not called
        expect(data).toBeDefined();
    });

    it('GET /api/marketplace/listings?agentId=... filters by agent', async () => {
        const { req, url } = fakeReq('GET', `/api/marketplace/listings?agentId=${agentId}`);
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data[0].agentId).toBe(agentId);
    });

    it('GET /api/marketplace/listings/:id returns a specific listing', async () => {
        const { req, url } = fakeReq('GET', `/api/marketplace/listings/${listingId}`);
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.id).toBe(listingId);
        expect(data.name).toBe('Code Reviewer');
    });

    it('GET /api/marketplace/listings/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('GET', '/api/marketplace/listings/nonexistent');
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res!.status).toBe(404);
    });

    it('PUT /api/marketplace/listings/:id updates a listing', async () => {
        const { req, url } = fakeReq('PUT', `/api/marketplace/listings/${listingId}`, {
            name: 'Code Reviewer Pro',
            status: 'published',
        });
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.name).toBe('Code Reviewer Pro');
        expect(data.status).toBe('published');
    });

    // ─── Search ──────────────────────────────────────────────────────────────

    it('GET /api/marketplace/search returns search results', async () => {
        const { req, url } = fakeReq('GET', '/api/marketplace/search?q=Code&category=coding');
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.listings).toBeDefined();
        expect(Array.isArray(data.listings)).toBe(true);
        expect(data.total).toBeGreaterThanOrEqual(1);
        expect(data.listings[0].name).toContain('Code Reviewer');
    });

    // ─── Reviews ─────────────────────────────────────────────────────────────

    it('POST /api/marketplace/listings/:id/reviews creates a review', async () => {
        const { req, url } = fakeReq('POST', `/api/marketplace/listings/${listingId}/reviews`, {
            rating: 5,
            comment: 'Excellent code reviews!',
            reviewerAgentId: agentId,
        });
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.rating).toBe(5);
        expect(data.comment).toBe('Excellent code reviews!');
        expect(data.listingId).toBe(listingId);
    });

    it('POST /api/marketplace/listings/:id/reviews rejects invalid rating', async () => {
        const { req, url } = fakeReq('POST', `/api/marketplace/listings/${listingId}/reviews`, {
            rating: 10,
            comment: 'Invalid rating',
        });
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('rating');
    });

    it('GET /api/marketplace/listings/:id/reviews returns reviews', async () => {
        const { req, url } = fakeReq('GET', `/api/marketplace/listings/${listingId}/reviews`);
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data[0].rating).toBe(5);
    });

    // ─── Federation ──────────────────────────────────────────────────────────

    it('GET /api/marketplace/federation/instances returns instances', async () => {
        const { req, url } = fakeReq('GET', '/api/marketplace/federation/instances');
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
    });

    // ─── Delete ──────────────────────────────────────────────────────────────

    it('DELETE /api/marketplace/listings/:id deletes a listing', async () => {
        // Create one to delete
        const createBody = { agentId, name: 'Delete Me', description: 'Temp', category: 'general' as const };
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/marketplace/listings', createBody);
        const cRes = await handleMarketplaceRoutes(cReq, cUrl, db, marketplace, federation)!;
        const created = await cRes!.json();

        const { req, url } = fakeReq('DELETE', `/api/marketplace/listings/${created.id}`);
        const res = await handleMarketplaceRoutes(req, url, db, marketplace, federation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.ok).toBe(true);

        // Verify deleted
        const { req: gReq, url: gUrl } = fakeReq('GET', `/api/marketplace/listings/${created.id}`);
        const gRes = await handleMarketplaceRoutes(gReq, gUrl, db, marketplace, federation)!;
        expect(gRes!.status).toBe(404);
    });
});
