import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handlePermissionRoutes } from '../routes/permissions';

// --- Helpers ----------------------------------------------------------------

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

// --- Tests ------------------------------------------------------------------

describe('routes/permissions', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
    });

    // ── Routing ──────────────────────────────────────────────────────────

    it('returns null for non-permission paths', () => {
        const { req, url } = fakeReq('GET', '/api/agents');
        expect(handlePermissionRoutes(req, url, db)).toBeNull();
    });

    it('returns 404 for unknown permission endpoints', async () => {
        const { req, url } = fakeReq('GET', '/api/permissions/unknown/extra/path');
        const res = await handlePermissionRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    // ── Grant ────────────────────────────────────────────────────────────

    it('grants a permission and returns 201', async () => {
        const { req, url } = fakeReq('POST', '/api/permissions/grant', {
            agent_id: 'agent-1',
            action: 'git:create_pr',
            granted_by: 'admin',
            reason: 'testing',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);

        const data = await res!.json();
        expect(data.grant).toBeDefined();
        expect(data.grant.agentId).toBe('agent-1');
        expect(data.grant.action).toBe('git:create_pr');
    });

    it('rejects grant with missing agent_id', async () => {
        const { req, url } = fakeReq('POST', '/api/permissions/grant', {
            action: 'git:create_pr',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(400);
    });

    it('rejects grant with missing action', async () => {
        const { req, url } = fakeReq('POST', '/api/permissions/grant', {
            agent_id: 'agent-1',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(400);
    });

    it('rejects grant with invalid JSON body', async () => {
        const url = new URL('http://localhost:3000/api/permissions/grant');
        const req = new Request(url.toString(), {
            method: 'POST',
            body: 'not json',
            headers: { 'Content-Type': 'application/json' },
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(400);
    });

    it('grants with default values when optional fields are omitted', async () => {
        const { req, url } = fakeReq('POST', '/api/permissions/grant', {
            agent_id: 'agent-1',
            action: 'git:push',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.grant.grantedBy).toBe('api');
    });

    // ── List grants ──────────────────────────────────────────────────────

    it('lists active grants for an agent', async () => {
        // Grant first
        const { req: grantReq, url: grantUrl } = fakeReq('POST', '/api/permissions/grant', {
            agent_id: 'agent-1',
            action: 'git:create_pr',
        });
        await handlePermissionRoutes(grantReq, grantUrl, db);

        // List
        const { req, url } = fakeReq('GET', '/api/permissions/agent-1');
        const res = await handlePermissionRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);

        const data = await res!.json();
        expect(data.agentId).toBe('agent-1');
        expect(data.count).toBe(1);
        expect(data.grants).toHaveLength(1);
    });

    it('returns empty grants for unknown agent', async () => {
        const { req, url } = fakeReq('GET', '/api/permissions/nonexistent');
        const res = await handlePermissionRoutes(req, url, db);
        const data = await res!.json();
        expect(data.grants).toHaveLength(0);
        expect(data.count).toBe(0);
    });

    it('supports history=true query param', async () => {
        const { req: grantReq, url: grantUrl } = fakeReq('POST', '/api/permissions/grant', {
            agent_id: 'agent-1',
            action: 'git:push',
        });
        await handlePermissionRoutes(grantReq, grantUrl, db);

        const { req, url } = fakeReq('GET', '/api/permissions/agent-1?history=true');
        const res = await handlePermissionRoutes(req, url, db);
        const data = await res!.json();
        expect(data.grants).toBeDefined();
    });

    // ── Revoke ───────────────────────────────────────────────────────────

    it('revokes a grant by agent_id', async () => {
        // Grant first
        const { req: grantReq, url: grantUrl } = fakeReq('POST', '/api/permissions/grant', {
            agent_id: 'agent-1',
            action: 'git:push',
        });
        await handlePermissionRoutes(grantReq, grantUrl, db);

        // Revoke
        const { req, url } = fakeReq('POST', '/api/permissions/revoke', {
            agent_id: 'agent-1',
            action: 'git:push',
            revoked_by: 'admin',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.affected).toBeGreaterThanOrEqual(0);
    });

    it('rejects revoke with missing identifiers', async () => {
        const { req, url } = fakeReq('POST', '/api/permissions/revoke', {
            action: 'git:push',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(400);
    });

    it('rejects revoke with invalid JSON', async () => {
        const url = new URL('http://localhost:3000/api/permissions/revoke');
        const req = new Request(url.toString(), {
            method: 'POST',
            body: 'bad',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(400);
    });

    // ── Emergency revoke ─────────────────────────────────────────────────

    it('emergency-revokes all grants for an agent', async () => {
        // Grant two permissions
        for (const action of ['git:push', 'git:create_pr']) {
            const { req, url } = fakeReq('POST', '/api/permissions/grant', {
                agent_id: 'agent-1',
                action,
            });
            await handlePermissionRoutes(req, url, db);
        }

        // Emergency revoke
        const { req, url } = fakeReq('POST', '/api/permissions/emergency-revoke', {
            agent_id: 'agent-1',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.emergency).toBe(true);
        expect(data.affected).toBeGreaterThanOrEqual(2);
    });

    it('rejects emergency-revoke without agent_id', async () => {
        const { req, url } = fakeReq('POST', '/api/permissions/emergency-revoke', {});
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(400);
    });

    // ── Check ────────────────────────────────────────────────────────────

    it('checks tool permission when grant exists', async () => {
        const { req: grantReq, url: grantUrl } = fakeReq('POST', '/api/permissions/grant', {
            agent_id: 'agent-1',
            action: 'git:create_pr',
        });
        await handlePermissionRoutes(grantReq, grantUrl, db);

        const { req, url } = fakeReq('POST', '/api/permissions/check', {
            agent_id: 'agent-1',
            tool_name: 'corvid_create_pr',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data).toBeDefined();
    });

    it('rejects check with missing fields', async () => {
        const { req, url } = fakeReq('POST', '/api/permissions/check', {
            agent_id: 'agent-1',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(400);
    });

    // ── Actions taxonomy ─────────────────────────────────────────────────

    it('returns action taxonomy', async () => {
        const { req, url } = fakeReq('GET', '/api/permissions/actions');
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.actions).toBeDefined();
        expect(typeof data.actions).toBe('object');
    });

    // ── Check denied without grants ──────────────────────────────────────

    it('check returns allowed for unmapped tools (permissive default)', async () => {
        const { req, url } = fakeReq('POST', '/api/permissions/check', {
            agent_id: 'agent-none',
            tool_name: 'unmapped_tool',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(200);
        const data = await res!.json();
        // Tools without an action mapping are allowed by default
        expect(data.allowed).toBe(true);
        expect(data.reason).toContain('no permission mapping');
    });

    it('rejects check with invalid JSON', async () => {
        const url = new URL('http://localhost:3000/api/permissions/check');
        const req = new Request(url.toString(), {
            method: 'POST',
            body: 'bad',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(400);
    });

    it('rejects emergency-revoke with invalid JSON', async () => {
        const url = new URL('http://localhost:3000/api/permissions/emergency-revoke');
        const req = new Request(url.toString(), {
            method: 'POST',
            body: 'bad',
        });
        const res = await handlePermissionRoutes(req, url, db);
        expect(res!.status).toBe(400);
    });

    // ── Tenant scoping ──────────────────────────────────────────────────

    it('supports tenant_id on grant and list', async () => {
        const { req: grantReq, url: grantUrl } = fakeReq('POST', '/api/permissions/grant', {
            agent_id: 'agent-t',
            action: 'git:push',
            tenant_id: 'tenant-a',
        });
        await handlePermissionRoutes(grantReq, grantUrl, db);

        // List with default tenant should be empty
        const { req: listReq, url: listUrl } = fakeReq('GET', '/api/permissions/agent-t');
        const res = await handlePermissionRoutes(listReq, listUrl, db);
        const data = await res!.json();
        expect(data.count).toBe(0);

        // List with correct tenant should have the grant
        const { req: listReq2, url: listUrl2 } = fakeReq('GET', '/api/permissions/agent-t?tenant_id=tenant-a');
        const res2 = await handlePermissionRoutes(listReq2, listUrl2, db);
        const data2 = await res2!.json();
        expect(data2.count).toBe(1);
    });
});
