import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleBillingRoutes } from '../routes/billing';
import { BillingService } from '../billing/service';
import { UsageMeter } from '../billing/meter';

let db: Database;
let billing: BillingService;
let meter: UsageMeter;
let tenantId: string;

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

    // Seed a tenant
    tenantId = crypto.randomUUID();
    db.query(
        "INSERT INTO tenants (id, name, slug, owner_email) VALUES (?, 'Test Tenant', 'test-tenant', 'test@example.com')",
    ).run(tenantId);

    billing = new BillingService(db);
    meter = new UsageMeter(db, billing);
});

afterAll(() => db.close());

describe('Billing Routes', () => {
    // ─── Service unavailable ─────────────────────────────────────────────────

    it('returns 503 when billing service is not available', async () => {
        const { req, url } = fakeReq('GET', '/api/billing/calculate?credits=100');
        const res = await handleBillingRoutes(req, url, db, undefined, undefined);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
        const data = await res!.json();
        expect(data.error).toContain('Billing not available');
    });

    it('returns null for non-billing paths when service is unavailable', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleBillingRoutes(req, url, db, undefined, undefined);
        expect(res).toBeNull();
    });

    // ─── Cost Calculator ─────────────────────────────────────────────────────

    it('GET /api/billing/calculate returns cost for credits', async () => {
        const { req, url } = fakeReq('GET', '/api/billing/calculate?credits=100');
        const res = await handleBillingRoutes(req, url, db, billing, meter)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.credits).toBe(100);
        expect(typeof data.costCents).toBe('number');
        expect(data.costCents).toBeGreaterThanOrEqual(0);
    });

    it('GET /api/billing/calculate rejects negative credits', async () => {
        const { req, url } = fakeReq('GET', '/api/billing/calculate?credits=-10');
        const res = await handleBillingRoutes(req, url, db, billing, meter)!;
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('Invalid credits');
    });

    // ─── Subscription ────────────────────────────────────────────────────────

    it('POST /api/billing/subscription creates a subscription', async () => {
        const { req, url } = fakeReq('POST', '/api/billing/subscription', {
            tenantId,
            stripeSubscriptionId: 'sub_test_123',
            plan: 'pro',
            periodStart: '2026-01-01T00:00:00Z',
            periodEnd: '2026-02-01T00:00:00Z',
        });
        const res = await handleBillingRoutes(req, url, db, billing, meter)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.tenantId).toBe(tenantId);
        expect(data.plan).toBe('pro');
        expect(data.status).toBe('active');
        expect(data.stripeSubscriptionId).toBe('sub_test_123');
    });

    it('POST /api/billing/subscription rejects missing fields', async () => {
        const { req, url } = fakeReq('POST', '/api/billing/subscription', {
            tenantId,
        });
        const res = await handleBillingRoutes(req, url, db, billing, meter)!;
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toBeDefined();
    });

    it('GET /api/billing/subscription/:id returns subscription', async () => {
        const { req, url } = fakeReq('GET', `/api/billing/subscription/${tenantId}`);
        const res = await handleBillingRoutes(req, url, db, billing, meter)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.tenantId).toBe(tenantId);
        expect(data.plan).toBe('pro');
    });

    it('GET /api/billing/subscription/:id returns 404 for unknown tenant', async () => {
        const { req, url } = fakeReq('GET', '/api/billing/subscription/nonexistent');
        const res = await handleBillingRoutes(req, url, db, billing, meter)!;
        expect(res!.status).toBe(404);
    });

    // ─── Usage ───────────────────────────────────────────────────────────────

    it('GET /api/billing/usage/:tenantId returns usage data', async () => {
        const { req, url } = fakeReq('GET', `/api/billing/usage/${tenantId}`);
        const res = await handleBillingRoutes(req, url, db, billing, meter)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        // current and history are returned even if null/empty
        expect('current' in data).toBe(true);
        expect('history' in data).toBe(true);
        expect('summary' in data).toBe(true);
    });

    // ─── Invoices ────────────────────────────────────────────────────────────

    it('GET /api/billing/invoices/:tenantId returns invoices', async () => {
        // Create an invoice directly via the service for testing
        billing.createInvoice(tenantId, 'inv_test_123', 5000, '2026-01-01', '2026-02-01');

        const { req, url } = fakeReq('GET', `/api/billing/invoices/${tenantId}`);
        const res = await handleBillingRoutes(req, url, db, billing, meter)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data[0].tenantId).toBe(tenantId);
        expect(data[0].amountCents).toBe(5000);
    });
});
