import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleVariantRoutes } from '../routes/variants';
import type { RequestContext } from '../middleware/guards';

let db: Database;

const ownerCtx: RequestContext = { authenticated: true, tenantId: 'default', tenantRole: 'owner' };
const viewerCtx: RequestContext = { authenticated: true, tenantId: 'default', tenantRole: 'viewer' };

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

function seedAgent(db: Database, name = 'TestAgent'): string {
    const id = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name, tenant_id) VALUES (?, ?, 'default')").run(id, name);
    return id;
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => db.close());

describe('Variant Routes — CRUD', () => {
    it('GET /api/variants returns array', async () => {
        const { req, url } = fakeReq('GET', '/api/variants');
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('POST /api/variants rejects missing name', async () => {
        const { req, url } = fakeReq('POST', '/api/variants', {});
        const res = await handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/variants creates variant', async () => {
        const { req, url } = fakeReq('POST', '/api/variants', {
            name: 'Security Auditor',
            description: 'Focused on security review',
        });
        const res = await handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.name).toBe('Security Auditor');
        expect(data.description).toBe('Focused on security review');
        expect(typeof data.id).toBe('string');
    });

    it('POST /api/variants rejects viewer role', async () => {
        const { req, url } = fakeReq('POST', '/api/variants', { name: 'Test' });
        const res = await handleVariantRoutes(req, url, db, viewerCtx);
        expect((res as Response).status).toBe(403);
    });

    it('GET /api/variants/:id returns variant', async () => {
        const { req: postReq, url: postUrl } = fakeReq('POST', '/api/variants', { name: 'MyVariant' });
        const created = await (await handleVariantRoutes(postReq, postUrl, db, ownerCtx) as Response).json();

        const { req, url } = fakeReq('GET', `/api/variants/${created.id}`);
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        const data = await (res as Response).json();
        expect(data.id).toBe(created.id);
        expect(data.name).toBe('MyVariant');
    });

    it('GET /api/variants/:id returns 404 for unknown id', async () => {
        const { req, url } = fakeReq('GET', '/api/variants/nonexistent-id');
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/variants/:id updates variant name', async () => {
        const { req: postReq, url: postUrl } = fakeReq('POST', '/api/variants', { name: 'OldName' });
        const created = await (await handleVariantRoutes(postReq, postUrl, db, ownerCtx) as Response).json();

        const { req, url } = fakeReq('PUT', `/api/variants/${created.id}`, { name: 'NewName' });
        const res = await handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.name).toBe('NewName');
    });

    it('PUT /api/variants/:id returns 404 for unknown id', async () => {
        const { req, url } = fakeReq('PUT', '/api/variants/ghost-id', { name: 'X' });
        const res = await handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(404);
    });

    it('DELETE /api/variants/:id removes variant', async () => {
        const { req: postReq, url: postUrl } = fakeReq('POST', '/api/variants', { name: 'ToDelete' });
        const created = await (await handleVariantRoutes(postReq, postUrl, db, ownerCtx) as Response).json();

        const { req, url } = fakeReq('DELETE', `/api/variants/${created.id}`);
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);
    });

    it('DELETE /api/variants/:id returns 404 for unknown id', async () => {
        const { req, url } = fakeReq('DELETE', '/api/variants/no-such-variant');
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(404);
    });
});

describe('Variant Routes — Agent Assignment', () => {
    it('GET /api/agents/:id/variant returns null when no variant assigned', async () => {
        const agentId = seedAgent(db);
        const { req, url } = fakeReq('GET', `/api/agents/${agentId}/variant`);
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(data).toBeNull();
    });

    it('GET /api/agents/:id/variant returns 404 for unknown agent', async () => {
        const { req, url } = fakeReq('GET', '/api/agents/no-agent/variant');
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(404);
    });

    it('POST /api/agents/:id/variant applies variant to agent', async () => {
        const agentId = seedAgent(db);

        // Create a variant
        const { req: vReq, url: vUrl } = fakeReq('POST', '/api/variants', { name: 'AssignMe' });
        const variant = await (await handleVariantRoutes(vReq, vUrl, db, ownerCtx) as Response).json();

        // Apply it
        const { req, url } = fakeReq('POST', `/api/agents/${agentId}/variant`, { variantId: variant.id });
        const res = await handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);
    });

    it('POST /api/agents/:id/variant returns 404 for unknown agent', async () => {
        const { req: vReq, url: vUrl } = fakeReq('POST', '/api/variants', { name: 'X' });
        const variant = await (await handleVariantRoutes(vReq, vUrl, db, ownerCtx) as Response).json();

        const { req, url } = fakeReq('POST', '/api/agents/ghost/variant', { variantId: variant.id });
        const res = await handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(404);
    });

    it('POST /api/agents/:id/variant returns 404 for unknown variant', async () => {
        const agentId = seedAgent(db);
        const { req, url } = fakeReq('POST', `/api/agents/${agentId}/variant`, { variantId: 'no-such-variant' });
        const res = await handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(404);
    });

    it('GET /api/agents/:id/variant returns assigned variant after apply', async () => {
        const agentId = seedAgent(db);

        const { req: vReq, url: vUrl } = fakeReq('POST', '/api/variants', { name: 'CheckMe' });
        const variant = await (await handleVariantRoutes(vReq, vUrl, db, ownerCtx) as Response).json();

        await handleVariantRoutes(
            ...Object.values(fakeReq('POST', `/api/agents/${agentId}/variant`, { variantId: variant.id })) as [Request, URL],
            db, ownerCtx,
        );

        const { req, url } = fakeReq('GET', `/api/agents/${agentId}/variant`);
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        const data = await (res as Response).json();
        expect(data).not.toBeNull();
        expect(data.id).toBe(variant.id);
    });

    it('DELETE /api/agents/:id/variant removes assignment', async () => {
        const agentId = seedAgent(db);

        const { req: vReq, url: vUrl } = fakeReq('POST', '/api/variants', { name: 'RemoveMe' });
        const variant = await (await handleVariantRoutes(vReq, vUrl, db, ownerCtx) as Response).json();

        await handleVariantRoutes(
            ...Object.values(fakeReq('POST', `/api/agents/${agentId}/variant`, { variantId: variant.id })) as [Request, URL],
            db, ownerCtx,
        );

        const { req, url } = fakeReq('DELETE', `/api/agents/${agentId}/variant`);
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);
    });

    it('DELETE /api/agents/:id/variant returns 404 when no variant assigned', async () => {
        const agentId = seedAgent(db);
        const { req, url } = fakeReq('DELETE', `/api/agents/${agentId}/variant`);
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        expect((res as Response).status).toBe(404);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleVariantRoutes(req, url, db, ownerCtx);
        expect(res).toBeNull();
    });
});
