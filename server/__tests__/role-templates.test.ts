import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { migrateUp } from '../db/migrate';
import { runMigrations } from '../db/schema';
import { PermissionBroker } from '../permissions/broker';
import {
  applyRoleTemplate,
  getRoleTemplate,
  listRoleTemplates,
  ROLE_TEMPLATES,
  revokeRoleTemplate,
} from '../permissions/role-templates';

let db: Database;
const AGENT_ID = 'agent-role-test-1';

beforeEach(async () => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  await migrateUp(db);
  db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
});

afterEach(() => {
  db.close();
});

// ─── Template definitions ───────────────────────────────────────────────

describe('ROLE_TEMPLATES', () => {
  test('defines owner, operator, viewer, developer, communicator templates', () => {
    const names = ROLE_TEMPLATES.map((t) => t.name);
    expect(names).toContain('owner');
    expect(names).toContain('operator');
    expect(names).toContain('viewer');
    expect(names).toContain('developer');
    expect(names).toContain('communicator');
  });

  test('owner template has superuser wildcard', () => {
    const owner = getRoleTemplate('owner');
    expect(owner).toBeDefined();
    expect(owner!.actions).toContain('*');
  });

  test('viewer template has only read actions', () => {
    const viewer = getRoleTemplate('viewer');
    expect(viewer).toBeDefined();
    for (const action of viewer!.actions) {
      expect(action).toMatch(/:(read|list|discover)$/);
    }
  });

  test('operator template includes git, schedule, work, messaging actions', () => {
    const op = getRoleTemplate('operator');
    expect(op).toBeDefined();
    expect(op!.actions).toContain('git:*');
    expect(op!.actions).toContain('schedule:manage');
    expect(op!.actions).toContain('work:create');
    expect(op!.actions).toContain('msg:send');
  });

  test('developer template includes git and fs actions', () => {
    const dev = getRoleTemplate('developer');
    expect(dev).toBeDefined();
    expect(dev!.actions).toContain('git:*');
    expect(dev!.actions).toContain('fs:read');
    expect(dev!.actions).toContain('work:create');
  });

  test('communicator template includes messaging actions', () => {
    const comm = getRoleTemplate('communicator');
    expect(comm).toBeDefined();
    expect(comm!.actions).toContain('msg:send');
    expect(comm!.actions).toContain('owner:notify');
    expect(comm!.actions).toContain('agent:invoke');
  });

  test('all templates have name, description, and at least one action', () => {
    for (const template of ROLE_TEMPLATES) {
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.actions.length).toBeGreaterThan(0);
    }
  });

  test('all template actions follow namespace:verb or wildcard format', () => {
    for (const template of ROLE_TEMPLATES) {
      for (const action of template.actions) {
        expect(action).toMatch(/^(\*|[a-z]+:(\*|[a-z_]+))$/);
      }
    }
  });
});

// ─── getRoleTemplate ────────────────────────────────────────────────────

describe('getRoleTemplate', () => {
  test('returns template by name', () => {
    const t = getRoleTemplate('operator');
    expect(t).toBeDefined();
    expect(t!.name).toBe('operator');
  });

  test('returns undefined for unknown template', () => {
    expect(getRoleTemplate('nonexistent')).toBeUndefined();
  });
});

// ─── listRoleTemplates ──────────────────────────────────────────────────

describe('listRoleTemplates', () => {
  test('returns all templates', () => {
    const templates = listRoleTemplates();
    expect(templates.length).toBe(ROLE_TEMPLATES.length);
  });
});

// ─── applyRoleTemplate ──────────────────────────────────────────────────

describe('applyRoleTemplate', () => {
  test('creates grants for all actions in the template', async () => {
    const result = await applyRoleTemplate(db, AGENT_ID, 'viewer', 'owner');

    const viewer = getRoleTemplate('viewer')!;
    expect(result.template.name).toBe('viewer');
    expect(result.grants.length).toBe(viewer.actions.length);
    expect(result.skipped).toBe(0);

    // Verify each grant was created
    const broker = new PermissionBroker(db);
    const grants = broker.getGrants(AGENT_ID);
    expect(grants.length).toBe(viewer.actions.length);
  });

  test('skips duplicate grants when applied twice', async () => {
    await applyRoleTemplate(db, AGENT_ID, 'viewer', 'owner');
    const result = await applyRoleTemplate(db, AGENT_ID, 'viewer', 'owner');

    expect(result.grants.length).toBe(0);
    expect(result.skipped).toBe(getRoleTemplate('viewer')!.actions.length);
  });

  test('owner template grants superuser access', async () => {
    const result = await applyRoleTemplate(db, AGENT_ID, 'owner', 'admin');

    expect(result.grants.length).toBe(1);
    expect(result.grants[0].action).toBe('*');

    // Verify agent can use any tool
    const broker = new PermissionBroker(db);
    const check = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
    expect(check.allowed).toBe(true);
  });

  test('throws for unknown template name', async () => {
    expect(applyRoleTemplate(db, AGENT_ID, 'unknown', 'owner')).rejects.toThrow('Unknown role template: "unknown"');
  });

  test('applies with custom reason and expiration', async () => {
    const expires = new Date(Date.now() + 3600_000).toISOString();
    const result = await applyRoleTemplate(db, AGENT_ID, 'viewer', 'owner', {
      reason: 'Temporary read access',
      expiresAt: expires,
    });

    for (const grant of result.grants) {
      expect(grant.reason).toBe('Temporary read access');
      expect(grant.expiresAt).toBe(expires);
    }
  });

  test('applies with tenant isolation', async () => {
    await applyRoleTemplate(db, AGENT_ID, 'viewer', 'owner', { tenantId: 'tenant-a' });
    await applyRoleTemplate(db, AGENT_ID, 'operator', 'owner', { tenantId: 'tenant-b' });

    const broker = new PermissionBroker(db);
    const grantsA = broker.getGrants(AGENT_ID, 'tenant-a');
    const grantsB = broker.getGrants(AGENT_ID, 'tenant-b');

    expect(grantsA.length).toBe(getRoleTemplate('viewer')!.actions.length);
    expect(grantsB.length).toBe(getRoleTemplate('operator')!.actions.length);
  });

  test('operator can use git tools but not credits:grant', async () => {
    await applyRoleTemplate(db, AGENT_ID, 'operator', 'owner');

    const broker = new PermissionBroker(db);
    const gitCheck = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
    expect(gitCheck.allowed).toBe(true);

    const creditCheck = await broker.checkTool(AGENT_ID, 'corvid_grant_credits');
    expect(creditCheck.allowed).toBe(false);
  });

  test('viewer cannot use write tools', async () => {
    await applyRoleTemplate(db, AGENT_ID, 'viewer', 'owner');

    const broker = new PermissionBroker(db);
    const readCheck = await broker.checkTool(AGENT_ID, 'corvid_github_list_prs');
    expect(readCheck.allowed).toBe(true);

    const writeCheck = await broker.checkTool(AGENT_ID, 'corvid_github_create_pr');
    expect(writeCheck.allowed).toBe(false);

    const msgCheck = await broker.checkTool(AGENT_ID, 'corvid_send_message');
    expect(msgCheck.allowed).toBe(false);
  });
});

// ─── revokeRoleTemplate ─────────────────────────────────────────────────

describe('revokeRoleTemplate', () => {
  test('revokes all grants from a role template', async () => {
    await applyRoleTemplate(db, AGENT_ID, 'viewer', 'owner');

    const broker = new PermissionBroker(db);
    expect(broker.getGrants(AGENT_ID).length).toBeGreaterThan(0);

    const result = revokeRoleTemplate(db, AGENT_ID, 'viewer', 'admin');

    expect(result.template.name).toBe('viewer');
    expect(result.revoked).toBe(getRoleTemplate('viewer')!.actions.length);
    expect(broker.getGrants(AGENT_ID).length).toBe(0);
  });

  test('throws for unknown template name', () => {
    expect(() => revokeRoleTemplate(db, AGENT_ID, 'unknown', 'admin')).toThrow('Unknown role template: "unknown"');
  });

  test('returns 0 revoked if no matching grants exist', () => {
    const result = revokeRoleTemplate(db, AGENT_ID, 'viewer', 'admin');
    expect(result.revoked).toBe(0);
  });

  test('only revokes grants for specified tenant', async () => {
    await applyRoleTemplate(db, AGENT_ID, 'viewer', 'owner', { tenantId: 'tenant-a' });
    await applyRoleTemplate(db, AGENT_ID, 'viewer', 'owner', { tenantId: 'tenant-b' });

    revokeRoleTemplate(db, AGENT_ID, 'viewer', 'admin', { tenantId: 'tenant-a' });

    const broker = new PermissionBroker(db);
    expect(broker.getGrants(AGENT_ID, 'tenant-a').length).toBe(0);
    expect(broker.getGrants(AGENT_ID, 'tenant-b').length).toBe(getRoleTemplate('viewer')!.actions.length);
  });
});
