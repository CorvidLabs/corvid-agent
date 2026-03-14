import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { PermissionBroker, _resetHmacSecretForTesting } from '../permissions/broker';

let db: Database;
let broker: PermissionBroker;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    _resetHmacSecretForTesting();
    process.env.PERMISSION_HMAC_SECRET = 'test-secret-key-for-unit-tests';
    broker = new PermissionBroker(db);
});

afterEach(() => {
    delete process.env.PERMISSION_HMAC_SECRET;
    _resetHmacSecretForTesting();
    db.close();
});

// ─── grant ──────────────────────────────────────────────────────────────────

describe('grant', () => {
    test('creates a signed permission grant', async () => {
        const grant = await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
            reason: 'PR creation needed',
        });

        expect(grant.id).toBeGreaterThan(0);
        expect(grant.agentId).toBe('agent-1');
        expect(grant.action).toBe('git:create_pr');
        expect(grant.grantedBy).toBe('admin');
        expect(grant.reason).toBe('PR creation needed');
        expect(grant.signature).toBeTruthy();
        expect(grant.revokedAt).toBeNull();
        expect(grant.tenantId).toBe('default');
    });

    test('records audit entry on grant', async () => {
        await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
        });

        const audit = db.query('SELECT * FROM audit_log WHERE action = ?').all('permission_grant');
        expect(audit).toHaveLength(1);
    });

    test('supports custom tenant and expiry', async () => {
        const expiresAt = new Date(Date.now() + 3600_000).toISOString();
        const grant = await broker.grant({
            agentId: 'agent-1',
            action: 'msg:send',
            grantedBy: 'admin',
            expiresAt,
            tenantId: 'tenant-abc',
        });

        expect(grant.expiresAt).toBe(expiresAt);
        expect(grant.tenantId).toBe('tenant-abc');
    });
});

// ─── checkAction ────────────────────────────────────────────────────────────

describe('checkAction', () => {
    test('denies when no grant exists', async () => {
        const result = await broker.checkAction('agent-1', 'git:create_pr');
        expect(result.allowed).toBe(false);
        expect(result.grantId).toBeNull();
        expect(result.reason).toContain('No active grant');
    });

    test('allows with exact action match', async () => {
        await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
        });

        const result = await broker.checkAction('agent-1', 'git:create_pr');
        expect(result.allowed).toBe(true);
        expect(result.grantId).toBeGreaterThan(0);
    });

    test('allows with namespace wildcard', async () => {
        await broker.grant({
            agentId: 'agent-1',
            action: 'git:*',
            grantedBy: 'admin',
        });

        const result = await broker.checkAction('agent-1', 'git:create_pr');
        expect(result.allowed).toBe(true);
    });

    test('allows with superuser wildcard', async () => {
        await broker.grant({
            agentId: 'agent-1',
            action: '*',
            grantedBy: 'admin',
        });

        const result = await broker.checkAction('agent-1', 'git:create_pr');
        expect(result.allowed).toBe(true);
    });

    test('denies when grant is revoked', async () => {
        const grant = await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
        });

        broker.revoke({ grantId: grant.id, revokedBy: 'admin' });

        const result = await broker.checkAction('agent-1', 'git:create_pr');
        expect(result.allowed).toBe(false);
    });

    test('denies when grant is expired', async () => {
        const expiredAt = new Date(Date.now() - 60_000).toISOString();
        await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
            expiresAt: expiredAt,
        });

        const result = await broker.checkAction('agent-1', 'git:create_pr');
        expect(result.allowed).toBe(false);
    });

    test('denies with tampered HMAC signature', async () => {
        await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
        });

        // Tamper with the signature in the DB
        db.query('UPDATE permission_grants SET signature = ?').run('tampered-signature');

        const result = await broker.checkAction('agent-1', 'git:create_pr');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('invalid HMAC signature');
    });

    test('respects tenant isolation', async () => {
        await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
            tenantId: 'tenant-a',
        });

        // Same agent, different tenant — should be denied
        const result = await broker.checkAction('agent-1', 'git:create_pr', 'tenant-b');
        expect(result.allowed).toBe(false);

        // Correct tenant — should be allowed
        const result2 = await broker.checkAction('agent-1', 'git:create_pr', 'tenant-a');
        expect(result2.allowed).toBe(true);
    });
});

// ─── checkTool ──────────────────────────────────────────────────────────────

describe('checkTool', () => {
    test('allows unmapped tools by default', async () => {
        const result = await broker.checkTool('agent-1', 'some_unknown_tool');
        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('no permission mapping');
    });

    test('denies mapped tool without grant', async () => {
        const result = await broker.checkTool('agent-1', 'corvid_github_create_pr');
        expect(result.allowed).toBe(false);
    });

    test('allows mapped tool with matching grant', async () => {
        await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
        });

        const result = await broker.checkTool('agent-1', 'corvid_github_create_pr');
        expect(result.allowed).toBe(true);
        expect(result.checkMs).toBeGreaterThanOrEqual(0);
    });

    test('records permission check in audit trail', async () => {
        await broker.checkTool('agent-1', 'corvid_github_create_pr', { sessionId: 'sess-1' });

        const checks = db.query('SELECT * FROM permission_checks').all() as Array<{
            agent_id: string;
            tool_name: string;
            session_id: string;
            allowed: number;
        }>;
        expect(checks).toHaveLength(1);
        expect(checks[0].agent_id).toBe('agent-1');
        expect(checks[0].tool_name).toBe('corvid_github_create_pr');
        expect(checks[0].session_id).toBe('sess-1');
        expect(checks[0].allowed).toBe(0);
    });
});

// ─── revoke ─────────────────────────────────────────────────────────────────

describe('revoke', () => {
    test('revokes specific grant by ID', async () => {
        const grant = await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
        });

        const affected = broker.revoke({ grantId: grant.id, revokedBy: 'admin' });
        expect(affected).toBe(1);

        const grants = broker.getGrants('agent-1');
        expect(grants).toHaveLength(0);
    });

    test('revokes all grants for agent+action', async () => {
        await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });
        await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });

        const affected = broker.revoke({
            agentId: 'agent-1',
            action: 'git:create_pr',
            revokedBy: 'admin',
        });
        expect(affected).toBe(2);
    });

    test('does not double-revoke', async () => {
        const grant = await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
        });

        broker.revoke({ grantId: grant.id, revokedBy: 'admin' });
        const affected = broker.revoke({ grantId: grant.id, revokedBy: 'admin' });
        expect(affected).toBe(0);
    });

    test('records audit on revoke', async () => {
        const grant = await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
        });

        broker.revoke({ grantId: grant.id, revokedBy: 'admin', reason: 'no longer needed' });

        const audit = db.query('SELECT * FROM audit_log WHERE action = ?').all('permission_revoke');
        expect(audit).toHaveLength(1);
    });
});

// ─── emergencyRevoke ────────────────────────────────────────────────────────

describe('emergencyRevoke', () => {
    test('revokes ALL grants for an agent', async () => {
        await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });
        await broker.grant({ agentId: 'agent-1', action: 'msg:send', grantedBy: 'admin' });
        await broker.grant({ agentId: 'agent-1', action: 'work:create', grantedBy: 'admin' });

        const count = broker.emergencyRevoke('agent-1', 'security-team', 'compromised agent');
        expect(count).toBe(3);

        const grants = broker.getGrants('agent-1');
        expect(grants).toHaveLength(0);
    });

    test('records emergency revocation audit', async () => {
        await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });
        broker.emergencyRevoke('agent-1', 'security-team', 'incident response');

        const audit = db.query('SELECT * FROM audit_log WHERE action = ?').all('permission_emergency_revoke');
        expect(audit).toHaveLength(1);
    });

    test('returns 0 when agent has no grants', () => {
        const count = broker.emergencyRevoke('nonexistent-agent', 'admin', 'test');
        expect(count).toBe(0);
    });
});

// ─── getGrants / getGrantHistory ────────────────────────────────────────────

describe('getGrants', () => {
    test('returns only active non-expired grants', async () => {
        await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });
        await broker.grant({
            agentId: 'agent-1',
            action: 'msg:send',
            grantedBy: 'admin',
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
        });
        const revoked = await broker.grant({
            agentId: 'agent-1',
            action: 'work:create',
            grantedBy: 'admin',
        });
        broker.revoke({ grantId: revoked.id, revokedBy: 'admin' });

        const grants = broker.getGrants('agent-1');
        expect(grants).toHaveLength(1);
        expect(grants[0].action).toBe('git:create_pr');
    });
});

describe('getGrantHistory', () => {
    test('returns all grants including revoked and expired', async () => {
        await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });
        const g2 = await broker.grant({ agentId: 'agent-1', action: 'msg:send', grantedBy: 'admin' });
        broker.revoke({ grantId: g2.id, revokedBy: 'admin' });

        const history = broker.getGrantHistory('agent-1');
        expect(history).toHaveLength(2);
    });

    test('respects limit', async () => {
        for (let i = 0; i < 5; i++) {
            await broker.grant({ agentId: 'agent-1', action: `git:action_${i}`, grantedBy: 'admin' });
        }

        const history = broker.getGrantHistory('agent-1', 'default', 3);
        expect(history).toHaveLength(3);
    });
});

// ─── getRequiredAction ──────────────────────────────────────────────────────

describe('getRequiredAction', () => {
    test('returns action for mapped tool', () => {
        expect(broker.getRequiredAction('corvid_github_create_pr')).toBe('git:create_pr');
    });

    test('returns null for unmapped tool', () => {
        expect(broker.getRequiredAction('unknown_tool')).toBeNull();
    });
});

// ─── HMAC key behavior ─────────────────────────────────────────────────────

describe('HMAC secret handling', () => {
    test('verification fails after HMAC secret change', async () => {
        process.env.PERMISSION_HMAC_SECRET = 'original-secret';
        _resetHmacSecretForTesting();

        await broker.grant({
            agentId: 'agent-1',
            action: 'git:create_pr',
            grantedBy: 'admin',
        });

        // Change the secret — simulates server restart with new key
        process.env.PERMISSION_HMAC_SECRET = 'new-secret';
        _resetHmacSecretForTesting();

        const result = await broker.checkAction('agent-1', 'git:create_pr');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('invalid HMAC signature');
    });
});
