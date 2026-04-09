/**
 * Tests for marketplace-analytics route handlers.
 *
 * Covers seller analytics by listing and buyer usage summary.
 */

import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import { handleMarketplaceAnalyticsRoutes } from '../routes/marketplace-analytics';

let db: Database;
let listingId: string;
let tenantId: string;

function fakeReq(method: string, path: string, query?: Record<string, string>): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  return { req: new Request(url.toString(), { method }), url };
}

beforeAll(() => {
  db = new Database(':memory:');
  runMigrations(db);

  tenantId = crypto.randomUUID();
  listingId = crypto.randomUUID();

  // Insert a marketplace listing so we can test analytics
  db.query(`
        INSERT INTO marketplace_listings (id, tenant_id, agent_id, name, description, category, status)
        VALUES (?, ?, 'agent-1', 'Test Listing', 'desc', 'tools', 'active')
    `).run(listingId, tenantId);
});

afterAll(() => db.close());

describe('Marketplace Analytics Routes', () => {
  it('returns null for unmatched paths', () => {
    const { req, url } = fakeReq('GET', '/api/marketplace/other');
    expect(handleMarketplaceAnalyticsRoutes(req, url, db)).toBeNull();
  });

  it('returns null for wrong method on analytics path', () => {
    const { req, url } = fakeReq('POST', `/api/marketplace/listings/${listingId}/analytics`);
    expect(handleMarketplaceAnalyticsRoutes(req, url, db)).toBeNull();
  });

  // ─── Seller Analytics ─────────────────────────────────────────────────────

  it('GET /api/marketplace/listings/:id/analytics — returns 404 for unknown listing', async () => {
    const unknownId = crypto.randomUUID();
    const { req, url } = fakeReq('GET', `/api/marketplace/listings/${unknownId}/analytics`);
    const res = handleMarketplaceAnalyticsRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
  });

  it('GET /api/marketplace/listings/:id/analytics — returns analytics for known listing', async () => {
    const { req, url } = fakeReq('GET', `/api/marketplace/listings/${listingId}/analytics`);
    const res = handleMarketplaceAnalyticsRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Record<string, unknown>;
    // The analytics object should have at least these fields
    expect(data).toHaveProperty('listingId');
    expect(data.listingId).toBe(listingId);
  });

  it('GET /api/marketplace/listings/:id/analytics — respects ?days param', async () => {
    const { req, url } = fakeReq('GET', `/api/marketplace/listings/${listingId}/analytics`, { days: '7' });
    const res = handleMarketplaceAnalyticsRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  // ─── Buyer Usage ──────────────────────────────────────────────────────────

  it('GET /api/marketplace/usage — returns 400 when tenantId is missing', () => {
    const { req, url } = fakeReq('GET', '/api/marketplace/usage');
    const res = handleMarketplaceAnalyticsRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    expect(res!.headers.get('content-type')).toContain('application/json');
  });

  it('GET /api/marketplace/usage — returns buyer usage for known tenant', async () => {
    const { req, url } = fakeReq('GET', '/api/marketplace/usage', { tenantId });
    const res = handleMarketplaceAnalyticsRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/marketplace/usage — returns empty array for unknown tenant', async () => {
    const unknownTenantId = crypto.randomUUID();
    const { req, url } = fakeReq('GET', '/api/marketplace/usage', { tenantId: unknownTenantId });
    const res = handleMarketplaceAnalyticsRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
