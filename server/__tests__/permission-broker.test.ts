import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { migrateUp } from '../db/migrate';
import { PermissionBroker } from '../permissions/broker';
import { TOOL_ACTION_MAP } from '../permissions/types';

let db: Database;
let broker: PermissionBroker;
const AGENT_ID = 'agent-test-1';
const AGENT_ID_2 = 'agent-test-2';

beforeEach(async () => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    await migrateUp(db);
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent2', 'test', 'test')`).run(AGENT_ID_2);
    broker = new PermissionBroker(db);
});

afterEach(() => {
    db.close();
});

// ─── TOOL_ACTION_MAP ─────────────────────────────────────────────────────

describe('TOOL_ACTION_MAP', () => {
    test('maps all standard corvid tools to actions', () => {
        expect(TOOL_ACTION_MAP['corvid_send_message']).toBe('msg:send');
        expect(TOOL_ACTION_MAP['corvid_github_create_pr']).toBe('git:create_pr');
        expect(TOOL_ACTION_MAP['corvid_grant_credits']).toBe('credits:grant');
        expect(TOOL_ACTION_MAP['corvid_manage_schedule']).toBe('schedule:manage');
    });

    test('all mapped actions follow namespace:verb format', () => {
        for (const [_tool, action] of Object.entries(TOOL_ACTION_MAP)) {
            expect(action).toMatch(/^[a-z]+:[a-z_]+$/);
        }
    });

    test('has mappings for GitHub tools', () => {
        const githubTools = Object.keys(TOOL_ACTION_MAP).filter(t => t.includes('github'));
        expect(githubTools.length).toBeGreaterThanOrEqual(10);
    });
});

// ─── Grant operations ────────────────────────────────────────────────────

describe('grant', () => {
    test('creates a grant with HMAC signature', async () => {
        const grant = await broker.grant({
            agentId: AGENT_ID,
            action: 'git:create_pr',
            grantedBy: 'owner',
            reason: 'PR creation rights',
        });

        expect(grant.id).toBeGreaterThan(0);
        expect(grant.agentId).toBe(AGENT_ID);
        expect(grant.action).toBe('git:create_pr');
        expect(grant.grantedBy).toBe('owner');
        expect(grant.signature).toBeTruthy();
        expect(grant.signature.length).toBe(64); // SHA-256 hex
        expect(grant.revokedAt).toBeNull();
        expect(grant.tenantId).toBe('default');
    });

    test('creates a grant with expiration', async () => {
        const future = new Date(Date.now() + 3600_000).toISOString();
        const grant = await broker.grant({
            agentId: AGENT_ID,
            action: 'msg:send',
            grantedBy: 'owner',
            expiresAt: future,
        });

        expect(grant.expiresAt).toBe(future);
    });

    test('creates grants for different tenants', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:read', grantedBy: 'owner', tenantId: 'tenant-a' });
        await broker.grant({ agentId: AGENT_ID, action: 'git:read', grantedBy: 'owner', tenantId: 'tenant-b' });

        const grantsA = broker.getGrants(AGENT_ID, 'tenant-a');
        const grantsB = broker.getGrants(AGENT_ID, 'tenant-b');
        expect(grantsA.length).toBe(1);
        expect(grantsB.length).toBe(1);
    });

    test('records audit entry on grant', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:star', grantedBy: 'admin' });

        const auditRow = db.query(
            `SELECT * FROM audit_log WHERE action = 'permission_grant' ORDER BY id DESC LIMIT 1`
        ).get() as any;
        expect(auditRow).toBeTruthy();
        expect(auditRow.actor).toBe('admin');
        expect(auditRow.resource_type).toBe('permission');
    });
});

// ─── Check operations ────────────────────────────────────────────────────

describe('checkTool', () => {
    test('denies access when no grants exist', async () => {
        const result = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
        expect(result.allowed).toBe(false);
        expect(result.grantId).toBeNull();
        expect(result.checkMs).toBeGreaterThanOrEqual(0);
    });

    test('allows access with exact action grant', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });

        const result = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
        expect(result.allowed).toBe(true);
        expect(result.grantId).toBeGreaterThan(0);
    });

    test('allows access with namespace wildcard grant', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:*', grantedBy: 'owner' });

        const result = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
        expect(result.allowed).toBe(true);

        const result2 = await broker.checkTool(AGENT_ID, 'corvid_github_star_repo');
        expect(result2.allowed).toBe(true);
    });

    test('allows access with superuser wildcard', async () => {
        await broker.grant({ agentId: AGENT_ID, action: '*', grantedBy: 'owner' });

        const result = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
        expect(result.allowed).toBe(true);

        const result2 = await broker.checkTool(AGENT_ID, 'corvid_send_message');
        expect(result2.allowed).toBe(true);
    });

    test('denies with wrong namespace wildcard', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'msg:*', grantedBy: 'owner' });

        const result = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
        expect(result.allowed).toBe(false);
    });

    test('allows tools with no action mapping (unmapped tools)', async () => {
        const result = await broker.checkTool(AGENT_ID, 'some_unknown_tool');
        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('no permission mapping');
    });

    test('denies access with expired grant', async () => {
        const past = new Date(Date.now() - 3600_000).toISOString();
        await broker.grant({
            agentId: AGENT_ID,
            action: 'git:create_pr',
            grantedBy: 'owner',
            expiresAt: past,
        });

        const result = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
        expect(result.allowed).toBe(false);
    });

    test('denies access with revoked grant', async () => {
        const grant = await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });
        broker.revoke({ grantId: grant.id, revokedBy: 'admin' });

        const result = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
        expect(result.allowed).toBe(false);
    });

    test('records check in permission_checks table', async () => {
        await broker.checkTool(AGENT_ID, 'corvid_github_create_pr', { sessionId: 'sess-1' });

        const row = db.query(
            `SELECT * FROM permission_checks WHERE agent_id = ? AND tool_name = ?`
        ).get(AGENT_ID, 'corvid_github_create_pr') as any;
        expect(row).toBeTruthy();
        expect(row.action).toBe('git:create_pr');
        expect(row.allowed).toBe(0);
        expect(row.session_id).toBe('sess-1');
    });

    test('check performance is under 10ms for simple lookups', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });

        const result = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
        expect(result.checkMs).toBeLessThan(10);
    });

    test('respects tenant isolation', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner', tenantId: 'tenant-a' });

        const resultA = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr', { tenantId: 'tenant-a' });
        expect(resultA.allowed).toBe(true);

        const resultDefault = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
        expect(resultDefault.allowed).toBe(false);
    });
});

// ─── checkAction (direct action check) ──────────────────────────────────

describe('checkAction', () => {
    test('checks a raw action string', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });

        const result = await broker.checkAction(AGENT_ID, 'git:create_pr');
        expect(result.allowed).toBe(true);

        const result2 = await broker.checkAction(AGENT_ID, 'git:fork');
        expect(result2.allowed).toBe(false);
    });
});

// ─── Revoke operations ──────────────────────────────────────────────────

describe('revoke', () => {
    test('revokes a specific grant by ID', async () => {
        const grant = await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });

        const affected = broker.revoke({ grantId: grant.id, revokedBy: 'admin' });
        expect(affected).toBe(1);

        const grants = broker.getGrants(AGENT_ID);
        expect(grants.length).toBe(0);
    });

    test('revokes all grants for an agent + action', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });
        await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'admin' });
        await broker.grant({ agentId: AGENT_ID, action: 'msg:send', grantedBy: 'owner' });

        const affected = broker.revoke({ agentId: AGENT_ID, action: 'git:create_pr', revokedBy: 'admin' });
        expect(affected).toBe(2);

        const grants = broker.getGrants(AGENT_ID);
        expect(grants.length).toBe(1);
        expect(grants[0].action).toBe('msg:send');
    });

    test('revokes all grants for an agent (no action specified)', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });
        await broker.grant({ agentId: AGENT_ID, action: 'msg:send', grantedBy: 'owner' });

        const affected = broker.revoke({ agentId: AGENT_ID, revokedBy: 'admin' });
        expect(affected).toBe(2);
    });

    test('does not double-revoke', async () => {
        const grant = await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });
        broker.revoke({ grantId: grant.id, revokedBy: 'admin' });

        const affected = broker.revoke({ grantId: grant.id, revokedBy: 'admin' });
        expect(affected).toBe(0);
    });

    test('records audit entry on revoke', async () => {
        const grant = await broker.grant({ agentId: AGENT_ID, action: 'git:star', grantedBy: 'owner' });
        broker.revoke({ grantId: grant.id, revokedBy: 'security-bot', reason: 'policy change' });

        const auditRow = db.query(
            `SELECT * FROM audit_log WHERE action = 'permission_revoke' ORDER BY id DESC LIMIT 1`
        ).get() as any;
        expect(auditRow).toBeTruthy();
        expect(auditRow.actor).toBe('security-bot');
    });
});

// ─── Emergency revocation ────────────────────────────────────────────────

describe('emergencyRevoke', () => {
    test('revokes all grants for an agent immediately', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });
        await broker.grant({ agentId: AGENT_ID, action: 'msg:send', grantedBy: 'owner' });
        await broker.grant({ agentId: AGENT_ID, action: '*', grantedBy: 'owner' });

        const count = broker.emergencyRevoke(AGENT_ID, 'security-team', 'Compromised agent');
        expect(count).toBe(3);

        const grants = broker.getGrants(AGENT_ID);
        expect(grants.length).toBe(0);
    });

    test('does not affect other agents', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:read', grantedBy: 'owner' });
        await broker.grant({ agentId: AGENT_ID_2, action: 'git:read', grantedBy: 'owner' });

        broker.emergencyRevoke(AGENT_ID, 'security-team', 'Compromised');

        const grants2 = broker.getGrants(AGENT_ID_2);
        expect(grants2.length).toBe(1);
    });

    test('records emergency audit entry', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:read', grantedBy: 'owner' });
        broker.emergencyRevoke(AGENT_ID, 'security-team', 'Compromised');

        const auditRow = db.query(
            `SELECT * FROM audit_log WHERE action = 'permission_emergency_revoke' ORDER BY id DESC LIMIT 1`
        ).get() as any;
        expect(auditRow).toBeTruthy();
        expect(auditRow.actor).toBe('security-team');
        expect(JSON.parse(auditRow.detail).revokedCount).toBe(1);
    });
});

// ─── getGrants / getGrantHistory ────────────────────────────────────────

describe('getGrants', () => {
    test('returns only active (non-revoked, non-expired) grants', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:read', grantedBy: 'owner' });
        const g2 = await broker.grant({ agentId: AGENT_ID, action: 'git:star', grantedBy: 'owner' });
        await broker.grant({
            agentId: AGENT_ID,
            action: 'msg:send',
            grantedBy: 'owner',
            expiresAt: new Date(Date.now() - 1000).toISOString(),
        });
        broker.revoke({ grantId: g2.id, revokedBy: 'admin' });

        const active = broker.getGrants(AGENT_ID);
        expect(active.length).toBe(1);
        expect(active[0].action).toBe('git:read');
    });

    test('getGrantHistory returns all grants including revoked', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:read', grantedBy: 'owner' });
        const g2 = await broker.grant({ agentId: AGENT_ID, action: 'git:star', grantedBy: 'owner' });
        broker.revoke({ grantId: g2.id, revokedBy: 'admin' });

        const history = broker.getGrantHistory(AGENT_ID);
        expect(history.length).toBe(2);
    });
});

// ─── getRequiredAction ──────────────────────────────────────────────────

describe('getRequiredAction', () => {
    test('returns the action for known tools', () => {
        expect(broker.getRequiredAction('corvid_github_create_pr')).toBe('git:create_pr');
        expect(broker.getRequiredAction('corvid_send_message')).toBe('msg:send');
    });

    test('returns null for unknown tools', () => {
        expect(broker.getRequiredAction('unknown_tool')).toBeNull();
    });
});

// ─── HMAC signature verification ────────────────────────────────────────

describe('HMAC integrity', () => {
    test('detects tampered grant signature', async () => {
        const grant = await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });

        // Tamper with the signature in the DB
        db.query('UPDATE permission_grants SET signature = ? WHERE id = ?').run('deadbeef'.repeat(8), grant.id);

        const result = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('invalid HMAC signature');
    });

    test('detects tampered action in grant', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:create_pr', grantedBy: 'owner' });

        // Tamper with the action in the DB (escalate from git:read to git:create_pr)
        db.query('UPDATE permission_grants SET action = ? WHERE agent_id = ?').run('git:fork', AGENT_ID);

        // The grant now says git:fork but signature was for git:create_pr — should fail
        const result = await broker.checkAction(AGENT_ID, 'git:fork');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('invalid HMAC signature');
    });
});

// ─── API routes ─────────────────────────────────────────────────────────

describe('permission routes', () => {
    // Import the route handler for direct testing
    const { handlePermissionRoutes } = require('../routes/permissions') as typeof import('../routes/permissions');

    test('GET /api/permissions/actions returns action map', () => {
        const url = new URL('http://localhost/api/permissions/actions');
        const req = new Request(url, { method: 'GET' });
        const res = handlePermissionRoutes(req, url, db);
        expect(res).toBeTruthy();
    });

    test('POST /api/permissions/grant creates a grant', async () => {
        const url = new URL('http://localhost/api/permissions/grant');
        const req = new Request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_id: AGENT_ID, action: 'git:read', granted_by: 'test' }),
        });
        const res = await handlePermissionRoutes(req, url, db) as Response;
        expect(res.status).toBe(201);

        const body = await res.json();
        expect(body.grant.agentId).toBe(AGENT_ID);
        expect(body.grant.action).toBe('git:read');
    });

    test('POST /api/permissions/check returns check result', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:read', grantedBy: 'owner' });

        const url = new URL('http://localhost/api/permissions/check');
        const req = new Request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_id: AGENT_ID, tool_name: 'corvid_github_list_prs' }),
        });
        const res = await handlePermissionRoutes(req, url, db) as Response;
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.allowed).toBe(true);
    });

    test('POST /api/permissions/revoke revokes a grant', async () => {
        const grant = await broker.grant({ agentId: AGENT_ID, action: 'git:read', grantedBy: 'owner' });

        const url = new URL('http://localhost/api/permissions/revoke');
        const req = new Request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grant_id: grant.id, revoked_by: 'test' }),
        });
        const res = await handlePermissionRoutes(req, url, db) as Response;
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.affected).toBe(1);
    });

    test('POST /api/permissions/emergency-revoke revokes all', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:read', grantedBy: 'owner' });
        await broker.grant({ agentId: AGENT_ID, action: 'msg:send', grantedBy: 'owner' });

        const url = new URL('http://localhost/api/permissions/emergency-revoke');
        const req = new Request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_id: AGENT_ID, revoked_by: 'security', reason: 'test' }),
        });
        const res = await handlePermissionRoutes(req, url, db) as Response;
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.affected).toBe(2);
        expect(body.emergency).toBe(true);
    });

    test('GET /api/permissions/:agentId lists grants', async () => {
        await broker.grant({ agentId: AGENT_ID, action: 'git:read', grantedBy: 'owner' });
        await broker.grant({ agentId: AGENT_ID, action: 'msg:send', grantedBy: 'owner' });

        const url = new URL(`http://localhost/api/permissions/${AGENT_ID}`);
        const req = new Request(url, { method: 'GET' });
        const res = handlePermissionRoutes(req, url, db) as Response;
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.grants.length).toBe(2);
        expect(body.count).toBe(2);
    });

    test('returns 400 for missing required fields', async () => {
        const url = new URL('http://localhost/api/permissions/grant');
        const req = new Request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_id: AGENT_ID }),
        });
        const res = await handlePermissionRoutes(req, url, db) as Response;
        expect(res.status).toBe(400);
    });

    test('returns null for non-permission paths', () => {
        const url = new URL('http://localhost/api/other');
        const req = new Request(url, { method: 'GET' });
        const res = handlePermissionRoutes(req, url, db);
        expect(res).toBeNull();
    });
});

// ─── Migration ──────────────────────────────────────────────────────────

describe('migration 065', () => {
    test('permission_grants table exists with correct schema', () => {
        const info = db.query(`PRAGMA table_info(permission_grants)`).all() as any[];
        const columns = info.map(r => r.name);
        expect(columns).toContain('id');
        expect(columns).toContain('agent_id');
        expect(columns).toContain('action');
        expect(columns).toContain('granted_by');
        expect(columns).toContain('signature');
        expect(columns).toContain('expires_at');
        expect(columns).toContain('revoked_at');
        expect(columns).toContain('tenant_id');
    });

    test('permission_checks table exists with correct schema', () => {
        const info = db.query(`PRAGMA table_info(permission_checks)`).all() as any[];
        const columns = info.map(r => r.name);
        expect(columns).toContain('id');
        expect(columns).toContain('agent_id');
        expect(columns).toContain('tool_name');
        expect(columns).toContain('action');
        expect(columns).toContain('allowed');
        expect(columns).toContain('grant_id');
        expect(columns).toContain('check_ms');
        expect(columns).toContain('session_id');
    });
});
