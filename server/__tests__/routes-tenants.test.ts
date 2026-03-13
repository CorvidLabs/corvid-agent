import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleTenantRoutes } from '../routes/tenants';
import { TenantService } from '../tenant/context';
import type { RequestContext } from '../middleware/guards';

let db: Database;
let tenantService: TenantService;

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

function ownerContext(tenantId: string): RequestContext {
    return { authenticated: true, tenantId, tenantRole: 'owner' };
}

function viewerContext(tenantId: string): RequestContext {
    return { authenticated: true, tenantId, tenantRole: 'viewer' };
}

function defaultContext(): RequestContext {
    return { authenticated: true, tenantId: 'default' };
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    tenantService = new TenantService(db, true);
});

afterAll(() => db.close());

describe('Tenant Routes', () => {
    // ── POST /api/tenants/register ──────────────────────────────────────────

    describe('POST /api/tenants/register', () => {
        it('returns 503 when multi-tenant is disabled', async () => {
            const singleTenantService = new TenantService(db, false);
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'Test', slug: 'test-org', ownerEmail: 'a@b.com',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), singleTenantService);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(503);
        });

        it('returns 503 when tenantService is null', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'Test', slug: 'test-org', ownerEmail: 'a@b.com',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), null);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(503);
        });

        it('rejects missing name', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                slug: 'test-slug', ownerEmail: 'a@b.com',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
            expect(res!.status).toBe(400);
            const data = await res!.json();
            expect(data.error).toContain('name');
        });

        it('rejects missing slug', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'My Org', ownerEmail: 'a@b.com',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
            expect(res!.status).toBe(400);
            const data = await res!.json();
            expect(data.error).toContain('slug');
        });

        it('rejects missing ownerEmail', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'My Org', slug: 'my-org',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
            expect(res!.status).toBe(400);
            const data = await res!.json();
            expect(data.error).toContain('ownerEmail');
        });

        it('rejects invalid slug format (too short)', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'Org', slug: 'ab', ownerEmail: 'a@b.com',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
            expect(res!.status).toBe(400);
            const data = await res!.json();
            expect(data.error).toContain('slug');
        });

        it('rejects invalid slug format (uppercase)', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'Org', slug: 'My-Org', ownerEmail: 'a@b.com',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
            expect(res!.status).toBe(400);
            const data = await res!.json();
            expect(data.error).toContain('slug');
        });

        it('rejects invalid slug format (starts with hyphen)', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'Org', slug: '-my-org', ownerEmail: 'a@b.com',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
            expect(res!.status).toBe(400);
        });

        it('registers a tenant successfully', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'Acme Corp', slug: 'acme-corp', ownerEmail: 'admin@acme.com',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(201);
            const data = await res!.json();
            expect(data.tenant).toBeDefined();
            expect(data.tenant.slug).toBe('acme-corp');
            expect(data.tenant.name).toBe('Acme Corp');
            expect(data.apiKey).toBeDefined();
            expect(typeof data.apiKey).toBe('string');
        });

        it('rejects duplicate slug', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'Another Acme', slug: 'acme-corp', ownerEmail: 'other@acme.com',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
            expect(res!.status).toBe(409);
            const data = await res!.json();
            expect(data.error).toContain('Slug already taken');
        });

        it('defaults to free plan', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'Free Org', slug: 'free-org', ownerEmail: 'free@org.com',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
            expect(res!.status).toBe(201);
            const data = await res!.json();
            expect(data.tenant.plan).toBe('free');
        });

        it('accepts a valid plan', async () => {
            const { req, url } = fakeReq('POST', '/api/tenants/register', {
                name: 'Pro Org', slug: 'pro-org', ownerEmail: 'pro@org.com', plan: 'pro',
            });
            const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
            expect(res!.status).toBe(201);
            const data = await res!.json();
            expect(data.tenant.plan).toBe('pro');
        });
    });

    // ── GET /api/tenants/me ─────────────────────────────────────────────────

    describe('GET /api/tenants/me', () => {
        it('returns tenant info when tenantService is null', async () => {
            const { req, url } = fakeReq('GET', '/api/tenants/me');
            const res = await handleTenantRoutes(req, url, db, defaultContext(), null);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(200);
            const data = await res!.json();
            expect(data.multiTenant).toBe(false);
            expect(data.tenantId).toBe('default');
        });

        it('returns tenant info for existing tenant', async () => {
            // Use the acme-corp tenant created earlier
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = ownerContext(tenant.id);
            const { req, url } = fakeReq('GET', '/api/tenants/me');
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(200);
            const data = await res!.json();
            expect(data.slug).toBe('acme-corp');
            expect(data.multiTenant).toBe(true);
        });

        it('returns fallback for unknown tenant id', async () => {
            const ctx = ownerContext('nonexistent-id');
            const { req, url } = fakeReq('GET', '/api/tenants/me');
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res!.status).toBe(200);
            const data = await res!.json();
            expect(data.tenantId).toBe('nonexistent-id');
            expect(data.multiTenant).toBe(true);
        });
    });

    // ── GET /api/tenants/me/members ─────────────────────────────────────────

    describe('GET /api/tenants/me/members', () => {
        it('returns 403 for non-owner role', async () => {
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = viewerContext(tenant.id);
            const { req, url } = fakeReq('GET', '/api/tenants/me/members');
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(403);
        });

        it('lists members for owner', async () => {
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = ownerContext(tenant.id);
            const { req, url } = fakeReq('GET', '/api/tenants/me/members');
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(200);
            const data = await res!.json();
            expect(data.members).toBeDefined();
            expect(Array.isArray(data.members)).toBe(true);
            // Should have the owner member created during registration
            expect(data.members.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ── POST /api/tenants/me/members ────────────────────────────────────────

    describe('POST /api/tenants/me/members', () => {
        it('returns 403 for non-owner role', async () => {
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = viewerContext(tenant.id);
            const { req, url } = fakeReq('POST', '/api/tenants/me/members', {
                keyHash: 'abc123', role: 'viewer',
            });
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res!.status).toBe(403);
        });

        it('rejects missing keyHash', async () => {
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = ownerContext(tenant.id);
            const { req, url } = fakeReq('POST', '/api/tenants/me/members', { role: 'viewer' });
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res!.status).toBe(400);
            const data = await res!.json();
            expect(data.error).toContain('keyHash');
        });

        it('adds a member with default viewer role', async () => {
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = ownerContext(tenant.id);
            const { req, url } = fakeReq('POST', '/api/tenants/me/members', {
                keyHash: 'new-member-hash',
            });
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res!.status).toBe(201);
            const data = await res!.json();
            expect(data.ok).toBe(true);
            expect(data.keyHash).toBe('new-member-hash');
            expect(data.role).toBe('viewer');
        });

        it('adds a member with explicit role', async () => {
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = ownerContext(tenant.id);
            const { req, url } = fakeReq('POST', '/api/tenants/me/members', {
                keyHash: 'operator-hash', role: 'operator',
            });
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res!.status).toBe(201);
            const data = await res!.json();
            expect(data.role).toBe('operator');
        });

        it('defaults invalid role to viewer', async () => {
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = ownerContext(tenant.id);
            const { req, url } = fakeReq('POST', '/api/tenants/me/members', {
                keyHash: 'bad-role-hash', role: 'superadmin',
            });
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res!.status).toBe(201);
            const data = await res!.json();
            expect(data.role).toBe('viewer');
        });
    });

    // ── DELETE /api/tenants/me/members/:keyHash ─────────────────────────────

    describe('DELETE /api/tenants/me/members/:keyHash', () => {
        it('returns 403 for non-owner role', async () => {
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = viewerContext(tenant.id);
            const { req, url } = fakeReq('DELETE', '/api/tenants/me/members/some-hash');
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res!.status).toBe(403);
        });

        it('returns 404 for non-existent member', async () => {
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = ownerContext(tenant.id);
            const { req, url } = fakeReq('DELETE', '/api/tenants/me/members/does-not-exist');
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(404);
            const data = await res!.json();
            expect(data.error).toContain('not found');
        });

        it('removes an existing member', async () => {
            const tenant = tenantService.getTenantBySlug('acme-corp')!;
            const ctx = ownerContext(tenant.id);

            // First add a member to delete
            db.query(`
                INSERT OR REPLACE INTO tenant_members (tenant_id, key_hash, role, created_at, updated_at)
                VALUES (?, ?, 'viewer', datetime('now'), datetime('now'))
            `).run(tenant.id, 'delete-me-hash');

            const { req, url } = fakeReq('DELETE', '/api/tenants/me/members/delete-me-hash');
            const res = await handleTenantRoutes(req, url, db, ctx, tenantService);
            expect(res).not.toBeNull();
            expect(res!.status).toBe(200);
            const data = await res!.json();
            expect(data.ok).toBe(true);

            // Verify it's actually gone
            const row = db.query(
                'SELECT * FROM tenant_members WHERE tenant_id = ? AND key_hash = ?',
            ).get(tenant.id, 'delete-me-hash');
            expect(row).toBeNull();
        });
    });

    // ── Unmatched routes ────────────────────────────────────────────────────

    it('returns null for unmatched paths', async () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = await handleTenantRoutes(req, url, db, defaultContext(), tenantService);
        expect(res).toBeNull();
    });
});
