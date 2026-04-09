import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { _resetHmacSecretForTesting, PermissionBroker } from '../permissions/broker';

describe('PermissionBroker', () => {
  let db: Database;
  let broker: PermissionBroker;

  beforeEach(() => {
    _resetHmacSecretForTesting();
    process.env.PERMISSION_HMAC_SECRET = 'test-hmac-secret-for-broker-tests';

    db = new Database(':memory:');
    runMigrations(db);
    broker = new PermissionBroker(db);
  });

  test('grant — creates a permission grant with HMAC signature', async () => {
    const grant = await broker.grant({
      agentId: 'agent-1',
      action: 'git:create_pr',
      grantedBy: 'admin',
      reason: 'CI access',
    });

    expect(grant.agentId).toBe('agent-1');
    expect(grant.action).toBe('git:create_pr');
    expect(grant.grantedBy).toBe('admin');
    expect(grant.reason).toBe('CI access');
    expect(grant.signature).toBeTruthy();
    expect(typeof grant.signature).toBe('string');
    expect(grant.signature.length).toBeGreaterThan(0);
    expect(grant.revokedAt).toBeNull();
    expect(grant.id).toBeGreaterThan(0);
  });

  test('checkAction — allows action with valid grant', async () => {
    await broker.grant({
      agentId: 'agent-1',
      action: 'git:create_pr',
      grantedBy: 'admin',
    });

    const result = await broker.checkAction('agent-1', 'git:create_pr');
    expect(result.allowed).toBe(true);
    expect(result.grantId).toBeGreaterThan(0);
  });

  test('checkAction — denies action with no grant', async () => {
    const result = await broker.checkAction('agent-1', 'git:create_pr');
    expect(result.allowed).toBe(false);
    expect(result.grantId).toBeNull();
  });

  test('checkAction — namespace wildcard matches specific action', async () => {
    await broker.grant({
      agentId: 'agent-1',
      action: 'git:*',
      grantedBy: 'admin',
      reason: 'Full git access',
    });

    const result = await broker.checkAction('agent-1', 'git:create_pr');
    expect(result.allowed).toBe(true);
  });

  test('checkAction — superuser wildcard matches any action', async () => {
    await broker.grant({
      agentId: 'agent-1',
      action: '*',
      grantedBy: 'admin',
      reason: 'Superuser',
    });

    const result = await broker.checkAction('agent-1', 'blockchain:submit_txn');
    expect(result.allowed).toBe(true);
  });

  test('revoke — revoking a grant makes checkAction deny', async () => {
    const grant = await broker.grant({
      agentId: 'agent-1',
      action: 'git:create_pr',
      grantedBy: 'admin',
    });

    broker.revoke({ grantId: grant.id, revokedBy: 'admin', reason: 'no longer needed' });

    const result = await broker.checkAction('agent-1', 'git:create_pr');
    expect(result.allowed).toBe(false);
  });

  test('emergencyRevoke — revokes all grants for an agent', async () => {
    await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });
    await broker.grant({ agentId: 'agent-1', action: 'git:push', grantedBy: 'admin' });
    await broker.grant({ agentId: 'agent-1', action: 'blockchain:submit_txn', grantedBy: 'admin' });

    const count = broker.emergencyRevoke('agent-1', 'security-bot', 'compromised');
    expect(count).toBe(3);

    const r1 = await broker.checkAction('agent-1', 'git:create_pr');
    const r2 = await broker.checkAction('agent-1', 'git:push');
    const r3 = await broker.checkAction('agent-1', 'blockchain:submit_txn');
    expect(r1.allowed).toBe(false);
    expect(r2.allowed).toBe(false);
    expect(r3.allowed).toBe(false);
  });

  test('checkAction — expired grants are denied', async () => {
    // Grant with an expiry in the past
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    await broker.grant({
      agentId: 'agent-1',
      action: 'git:create_pr',
      grantedBy: 'admin',
      expiresAt: pastDate,
    });

    const result = await broker.checkAction('agent-1', 'git:create_pr');
    expect(result.allowed).toBe(false);
  });

  test('checkAction — tampered signature is denied', async () => {
    const grant = await broker.grant({
      agentId: 'agent-1',
      action: 'git:create_pr',
      grantedBy: 'admin',
    });

    // Tamper with the signature directly in the database
    db.query('UPDATE permission_grants SET signature = ? WHERE id = ?').run('deadbeef00000000', grant.id);

    const result = await broker.checkAction('agent-1', 'git:create_pr');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('invalid HMAC signature');
  });

  test('getGrants — returns only active, non-expired grants', async () => {
    await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });
    await broker.grant({ agentId: 'agent-1', action: 'git:push', grantedBy: 'admin' });

    // Create an expired grant
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    await broker.grant({ agentId: 'agent-1', action: 'git:star', grantedBy: 'admin', expiresAt: pastDate });

    // Create and revoke a grant
    const revokable = await broker.grant({ agentId: 'agent-1', action: 'git:unstar', grantedBy: 'admin' });
    broker.revoke({ grantId: revokable.id, revokedBy: 'admin', reason: 'test' });

    const grants = broker.getGrants('agent-1');
    expect(grants).toHaveLength(2);
    const actions = grants.map((g) => g.action).sort();
    expect(actions).toEqual(['git:create_pr', 'git:push']);
  });

  test('getGrantHistory — returns all grants including revoked', async () => {
    await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });
    const revokable = await broker.grant({ agentId: 'agent-1', action: 'git:push', grantedBy: 'admin' });
    broker.revoke({ grantId: revokable.id, revokedBy: 'admin', reason: 'test' });

    const history = broker.getGrantHistory('agent-1');
    expect(history).toHaveLength(2);
    // Should include revoked grants
    const revoked = history.find((g) => g.action === 'git:push');
    expect(revoked).toBeDefined();
    expect(revoked!.revokedAt).toBeTruthy();
  });

  test('checkTool — unmapped tool is allowed by default', async () => {
    const result = await broker.checkTool('agent-1', 'nonexistent_tool_xyz');
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('no permission mapping');
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  test('tenant isolation — grants in one tenant do not leak to another', async () => {
    await broker.grant({
      agentId: 'agent-1',
      action: 'git:create_pr',
      grantedBy: 'admin',
      tenantId: 'tenant-a',
    });

    const result = await broker.checkAction('agent-1', 'git:create_pr', 'tenant-b');
    expect(result.allowed).toBe(false);
  });

  test('revoke by agent+action — only revokes matching grants', async () => {
    await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });
    await broker.grant({ agentId: 'agent-1', action: 'msg:send', grantedBy: 'admin' });

    const affected = broker.revoke({
      agentId: 'agent-1',
      action: 'git:create_pr',
      revokedBy: 'admin',
    });
    expect(affected).toBe(1);

    // msg:send should still be active
    const msgResult = await broker.checkAction('agent-1', 'msg:send');
    expect(msgResult.allowed).toBe(true);
  });

  test('double-revoke returns 0 on second call', async () => {
    const grant = await broker.grant({
      agentId: 'agent-1',
      action: 'git:create_pr',
      grantedBy: 'admin',
    });
    broker.revoke({ grantId: grant.id, revokedBy: 'admin' });
    const second = broker.revoke({ grantId: grant.id, revokedBy: 'admin' });
    expect(second).toBe(0);
  });

  test('checkTool records checks in permission_checks table', async () => {
    await broker.grant({ agentId: 'agent-1', action: 'git:create_pr', grantedBy: 'admin' });
    await broker.checkTool('agent-1', 'corvid_github_create_pr', { sessionId: 'sess-42' });

    const row = db
      .query('SELECT * FROM permission_checks WHERE agent_id = ? AND session_id = ? LIMIT 1')
      .get('agent-1', 'sess-42') as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.tool_name).toBe('corvid_github_create_pr');
    expect(row.allowed).toBe(1);
  });

  test('getRequiredAction returns correct action for mapped tools', () => {
    const action = broker.getRequiredAction('corvid_github_create_pr');
    expect(action).toBe('git:create_pr');
  });

  test('getRequiredAction returns null for unmapped tools', () => {
    expect(broker.getRequiredAction('unknown_tool')).toBeNull();
  });
});
