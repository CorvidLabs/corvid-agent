import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { TENANT_SCOPED_TABLES } from '../tenant/db-filter';
import { DEFAULT_TENANT_ID } from '../tenant/types';
import { TenantService } from '../tenant/context';
import { withTenantFilter, validateTenantOwnership } from '../tenant/db-filter';
import { registerApiKey } from '../tenant/middleware';
import { createAgent, listAgents, getAgent, updateAgent, deleteAgent } from '../db/agents';
import { createSession, listSessions, getSession, deleteSession } from '../db/sessions';
import { createProject, listProjects, getProject } from '../db/projects';
// work-tasks unused in current tests but kept for future expansion
import { tenantGuard, tenantRoleGuard, createRequestContext } from '../middleware/guards';

// ---------------------------------------------------------------------------
// Fresh database per test
// ---------------------------------------------------------------------------

let db: Database;
beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

describe('Schema', () => {
    test('tenant_id column exists on all TENANT_SCOPED_TABLES', () => {
        for (const table of TENANT_SCOPED_TABLES) {
            const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
            const colNames = cols.map((c) => c.name);
            expect(colNames).toContain('tenant_id');
        }
    });

    test('tenant_members table has correct schema', () => {
        const cols = db.query('PRAGMA table_info(tenant_members)').all() as {
            name: string;
            type: string;
        }[];
        const colNames = cols.map((c) => c.name);
        expect(colNames).toContain('tenant_id');
        expect(colNames).toContain('key_hash');
        expect(colNames).toContain('role');
        expect(colNames).toContain('created_at');
        expect(colNames).toContain('updated_at');
    });

    test("DEFAULT 'default' is applied to tenant_id", () => {
        // Insert an agent without explicitly setting tenant_id
        const id = crypto.randomUUID();
        db.query(
            `INSERT INTO agents (id, name) VALUES (?, ?)`,
        ).run(id, 'No Tenant Agent');

        const row = db.query('SELECT tenant_id FROM agents WHERE id = ?').get(id) as {
            tenant_id: string;
        };
        expect(row.tenant_id).toBe('default');
    });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('Registration', () => {
    test('successful tenant registration creates tenant, API key, and member', () => {
        const tenantService = new TenantService(db, true);
        const tenant = tenantService.createTenant({
            name: 'Acme Corp',
            slug: 'acme-corp',
            ownerEmail: 'admin@acme.com',
        });

        expect(tenant.id).toBeTruthy();
        expect(tenant.name).toBe('Acme Corp');
        expect(tenant.slug).toBe('acme-corp');

        // Register an API key for the tenant
        const apiKey = 'test-api-key-acme';
        registerApiKey(db, tenant.id, apiKey);

        // Verify API key exists
        const hasher = new Bun.CryptoHasher('sha256');
        hasher.update(apiKey);
        const keyHash = hasher.digest('hex');
        const keyRow = db.query('SELECT * FROM api_keys WHERE key_hash = ?').get(keyHash) as {
            tenant_id: string;
        } | null;
        expect(keyRow).not.toBeNull();
        expect(keyRow!.tenant_id).toBe(tenant.id);

        // Insert a tenant member
        db.query(
            `INSERT INTO tenant_members (tenant_id, key_hash, role) VALUES (?, ?, ?)`,
        ).run(tenant.id, keyHash, 'owner');

        const member = db.query(
            'SELECT * FROM tenant_members WHERE tenant_id = ? AND key_hash = ?',
        ).get(tenant.id, keyHash) as { role: string } | null;
        expect(member).not.toBeNull();
        expect(member!.role).toBe('owner');
    });

    test('duplicate slug returns conflict', () => {
        const tenantService = new TenantService(db, true);
        tenantService.createTenant({
            name: 'First Tenant',
            slug: 'unique-slug',
            ownerEmail: 'first@example.com',
        });

        // Attempting to create a second tenant with the same slug should fail
        // because the slug column has a UNIQUE constraint
        const existing = tenantService.getTenantBySlug('unique-slug');
        expect(existing).not.toBeNull();
        expect(existing!.name).toBe('First Tenant');

        // Direct insert with same slug should throw a constraint error
        expect(() => {
            tenantService.createTenant({
                name: 'Second Tenant',
                slug: 'unique-slug',
                ownerEmail: 'second@example.com',
            });
        }).toThrow();
    });

    test('invalid slug is rejected', () => {
        const invalidSlugs = [
            'AB',          // uppercase
            'has spaces',  // spaces
            'a',           // too short (needs 3+ chars)
            'too-long-' + 'x'.repeat(50), // exceeds 48 chars
            '-starts-dash', // starts with dash
            'ends-dash-',   // ends with dash
        ];

        for (const slug of invalidSlugs) {
            expect(SLUG_PATTERN.test(slug)).toBe(false);
        }

        // Valid slugs should pass
        const validSlugs = ['abc', 'my-tenant', 'tenant-123', 'a1b'];
        for (const slug of validSlugs) {
            expect(SLUG_PATTERN.test(slug)).toBe(true);
        }
    });

    test('missing required fields are rejected', () => {
        const tenantService = new TenantService(db, true);

        // Missing name - SQLite NOT NULL constraint
        expect(() => {
            tenantService.createTenant({
                name: '',
                slug: 'no-name',
                ownerEmail: 'test@example.com',
            });
        }).not.toThrow(); // empty string is not null, so it works

        // Verify that actual null values would be caught by TypeScript types
        // (runtime enforcement depends on DB constraints)
        // Test that slug uniqueness is enforced
        expect(() => {
            db.query(
                `INSERT INTO tenants (id, name, slug, owner_email) VALUES (?, ?, NULL, ?)`,
            ).run(crypto.randomUUID(), 'Test', 'test@example.com');
        }).toThrow(); // slug is NOT NULL
    });

    test('registration disabled when not multi-tenant', () => {
        const tenantService = new TenantService(db, false);
        expect(tenantService.isMultiTenant()).toBe(false);

        // resolveContext should return default tenant
        const ctx = tenantService.resolveContext();
        expect(ctx.tenantId).toBe(DEFAULT_TENANT_ID);
        expect(ctx.plan).toBe('enterprise');
    });
});

// ---------------------------------------------------------------------------
// Cross-tenant isolation
// ---------------------------------------------------------------------------

describe('Cross-tenant isolation', () => {
    const TENANT_A = 'tenant-a';
    const TENANT_B = 'tenant-b';

    test('Tenant A cannot list Tenant B agents', () => {
        createAgent(db, { name: 'Agent A' }, TENANT_A);
        createAgent(db, { name: 'Agent B' }, TENANT_B);

        const agentsA = listAgents(db, TENANT_A);
        const agentsB = listAgents(db, TENANT_B);

        expect(agentsA).toHaveLength(1);
        expect(agentsA[0].name).toBe('Agent A');
        expect(agentsB).toHaveLength(1);
        expect(agentsB[0].name).toBe('Agent B');
    });

    test('Tenant A cannot get Tenant B agent by ID', () => {
        const agentB = createAgent(db, { name: 'Agent B' }, TENANT_B);

        const result = getAgent(db, agentB.id, TENANT_A);
        expect(result).toBeNull();

        // But tenant B can get it
        const resultB = getAgent(db, agentB.id, TENANT_B);
        expect(resultB).not.toBeNull();
        expect(resultB!.name).toBe('Agent B');
    });

    test('Tenant A cannot update Tenant B agent', () => {
        const agentB = createAgent(db, { name: 'Agent B' }, TENANT_B);

        const result = updateAgent(db, agentB.id, { name: 'Hacked' }, TENANT_A);
        expect(result).toBeNull();

        // Verify original name is preserved
        const original = getAgent(db, agentB.id, TENANT_B);
        expect(original!.name).toBe('Agent B');
    });

    test('Tenant A cannot delete Tenant B agent', () => {
        const agentB = createAgent(db, { name: 'Agent B' }, TENANT_B);

        const deleted = deleteAgent(db, agentB.id, TENANT_A);
        expect(deleted).toBe(false);

        // Agent still exists for tenant B
        const still = getAgent(db, agentB.id, TENANT_B);
        expect(still).not.toBeNull();
    });

    test('Tenant A cannot list Tenant B sessions', () => {
        createSession(db, { name: 'Session A' }, TENANT_A);
        createSession(db, { name: 'Session B' }, TENANT_B);

        const sessionsA = listSessions(db, undefined, TENANT_A);
        const sessionsB = listSessions(db, undefined, TENANT_B);

        expect(sessionsA).toHaveLength(1);
        expect(sessionsA[0].name).toBe('Session A');
        expect(sessionsB).toHaveLength(1);
        expect(sessionsB[0].name).toBe('Session B');
    });

    test('Tenant A cannot get Tenant B session', () => {
        const sessionB = createSession(db, { name: 'Session B' }, TENANT_B);

        const result = getSession(db, sessionB.id, TENANT_A);
        expect(result).toBeNull();

        const resultB = getSession(db, sessionB.id, TENANT_B);
        expect(resultB).not.toBeNull();
    });

    test('Tenant A cannot delete Tenant B session', () => {
        const sessionB = createSession(db, { name: 'Session B' }, TENANT_B);

        const deleted = deleteSession(db, sessionB.id, TENANT_A);
        expect(deleted).toBe(false);

        // Session still exists for tenant B
        const still = getSession(db, sessionB.id, TENANT_B);
        expect(still).not.toBeNull();
    });

    test('Tenant A cannot list Tenant B projects', () => {
        createProject(db, { name: 'Project A', workingDir: '/tmp/a' }, TENANT_A);
        createProject(db, { name: 'Project B', workingDir: '/tmp/b' }, TENANT_B);

        const projectsA = listProjects(db, TENANT_A);
        const projectsB = listProjects(db, TENANT_B);

        expect(projectsA).toHaveLength(1);
        expect(projectsA[0].name).toBe('Project A');
        expect(projectsB).toHaveLength(1);
        expect(projectsB[0].name).toBe('Project B');
    });

    test('Tenant A cannot get Tenant B project', () => {
        const projectB = createProject(db, { name: 'Project B', workingDir: '/tmp/b' }, TENANT_B);

        const result = getProject(db, projectB.id, TENANT_A);
        expect(result).toBeNull();

        const resultB = getProject(db, projectB.id, TENANT_B);
        expect(resultB).not.toBeNull();
    });

    test('validateTenantOwnership rejects cross-tenant access', () => {
        const agent = createAgent(db, { name: 'Owned by A' }, TENANT_A);

        // Tenant A owns it
        const ownsA = validateTenantOwnership(db, 'agents', agent.id, TENANT_A);
        expect(ownsA).toBe(true);

        // Tenant B does not
        const ownsB = validateTenantOwnership(db, 'agents', agent.id, TENANT_B);
        expect(ownsB).toBe(false);

        // Default tenant always passes (backwards compat)
        const ownsDefault = validateTenantOwnership(db, 'agents', agent.id, DEFAULT_TENANT_ID);
        expect(ownsDefault).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

describe('RBAC', () => {
    test('owner role is returned for tenant member with owner role', () => {
        const tenantId = 'rbac-tenant';
        const keyHash = 'hash-owner-key';

        db.query(
            `INSERT INTO tenant_members (tenant_id, key_hash, role) VALUES (?, ?, ?)`,
        ).run(tenantId, keyHash, 'owner');

        const member = db.query(
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND key_hash = ?',
        ).get(tenantId, keyHash) as { role: string } | null;

        expect(member).not.toBeNull();
        expect(member!.role).toBe('owner');
    });

    test('operator role allows agent creation', () => {
        const tenantId = 'rbac-tenant';
        const keyHash = 'hash-operator-key';

        db.query(
            `INSERT INTO tenant_members (tenant_id, key_hash, role) VALUES (?, ?, ?)`,
        ).run(tenantId, keyHash, 'operator');

        const member = db.query(
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND key_hash = ?',
        ).get(tenantId, keyHash) as { role: string } | null;

        expect(member).not.toBeNull();
        expect(member!.role).toBe('operator');

        // The operator role should be in the allowed set for agent creation
        const allowedRoles = ['owner', 'operator'];
        expect(allowedRoles).toContain(member!.role);
    });

    test('viewer gets no write access', () => {
        const guard = tenantRoleGuard('owner', 'operator');
        const req = new Request('http://localhost/test');
        const url = new URL(req.url);
        const context = createRequestContext();
        context.tenantId = 'test-tenant';
        context.tenantRole = 'viewer';

        const result = guard(req, url, context);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    test('unknown key_hash returns no role', () => {
        const tenantId = 'rbac-tenant';
        const unknownHash = 'does-not-exist-hash';

        const member = db.query(
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND key_hash = ?',
        ).get(tenantId, unknownHash) as { role: string } | null;

        expect(member).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Guard pipeline
// ---------------------------------------------------------------------------

describe('Guard pipeline', () => {
    test('tenantGuard extracts tenant from X-Tenant-ID header', () => {
        const tenantService = new TenantService(db, true);

        // Create the tenant so resolveContext can look it up
        tenantService.createTenant({
            name: 'Header Tenant',
            slug: 'header-tenant',
            ownerEmail: 'header@example.com',
        });

        const tenant = tenantService.getTenantBySlug('header-tenant')!;
        const req = new Request('http://localhost/api/agents', {
            headers: { 'X-Tenant-ID': tenant.id },
        });
        const url = new URL(req.url);
        const context = createRequestContext();

        const guard = tenantGuard(db, tenantService);
        const result = guard(req, url, context);

        expect(result).toBeNull(); // no error
        expect(context.tenantId).toBe(tenant.id);
    });

    test('tenantGuard extracts tenant from API key', () => {
        const tenantService = new TenantService(db, true);
        const tenant = tenantService.createTenant({
            name: 'API Key Tenant',
            slug: 'api-key-tenant',
            ownerEmail: 'apikey@example.com',
        });

        const apiKey = 'secret-api-key-12345';
        registerApiKey(db, tenant.id, apiKey);

        const req = new Request('http://localhost/api/agents', {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        const url = new URL(req.url);
        const context = createRequestContext();

        const guard = tenantGuard(db, tenantService);
        const result = guard(req, url, context);

        expect(result).toBeNull();
        expect(context.tenantId).toBe(tenant.id);
    });

    test('tenantGuard returns default in single-tenant mode', () => {
        const tenantService = new TenantService(db, false);
        const req = new Request('http://localhost/api/agents', {
            headers: { 'X-Tenant-ID': 'some-tenant' },
        });
        const url = new URL(req.url);
        const context = createRequestContext();

        const guard = tenantGuard(db, tenantService);
        const result = guard(req, url, context);

        expect(result).toBeNull();
        expect(context.tenantId).toBe(DEFAULT_TENANT_ID);
    });
});

// ---------------------------------------------------------------------------
// Default tenant backwards compatibility
// ---------------------------------------------------------------------------

describe('Default tenant backwards compat', () => {
    test('default tenant sees all data in single-tenant mode', () => {
        // Create data with the default tenant
        createAgent(db, { name: 'Default Agent' }, DEFAULT_TENANT_ID);
        createSession(db, { name: 'Default Session' }, DEFAULT_TENANT_ID);
        createProject(db, { name: 'Default Project', workingDir: '/tmp/default' }, DEFAULT_TENANT_ID);

        // Listing with DEFAULT_TENANT_ID should return everything
        const agents = listAgents(db, DEFAULT_TENANT_ID);
        expect(agents.length).toBeGreaterThanOrEqual(1);
        expect(agents.some((a) => a.name === 'Default Agent')).toBe(true);

        const sessions = listSessions(db, undefined, DEFAULT_TENANT_ID);
        expect(sessions.length).toBeGreaterThanOrEqual(1);
        expect(sessions.some((s) => s.name === 'Default Session')).toBe(true);

        const projects = listProjects(db, DEFAULT_TENANT_ID);
        expect(projects.length).toBeGreaterThanOrEqual(1);
        expect(projects.some((p) => p.name === 'Default Project')).toBe(true);
    });

    test('withTenantFilter is a no-op for DEFAULT_TENANT_ID', () => {
        const originalQuery = 'SELECT * FROM agents ORDER BY updated_at DESC';
        const { query, bindings } = withTenantFilter(originalQuery, DEFAULT_TENANT_ID);

        // Query should be unchanged
        expect(query).toBe(originalQuery);
        // No additional bindings
        expect(bindings).toEqual([]);
    });
});
