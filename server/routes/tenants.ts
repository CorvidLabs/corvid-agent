/**
 * Tenant routes — registration, tenant info, and member management.
 */
import type { Database } from 'bun:sqlite';
import type { TenantService } from '../tenant/context';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import { registerApiKey } from '../tenant/middleware';
import { json } from '../lib/response';
import { createLogger } from '../lib/logger';
import { randomBytes } from 'node:crypto';
import type { TenantRole } from '../tenant/types';

const log = createLogger('TenantRoutes');

/** Slug format: lowercase alphanumeric + hyphens, 3-48 chars. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export async function handleTenantRoutes(
    req: Request,
    url: URL,
    db: Database,
    context: RequestContext,
    tenantService: TenantService | null,
): Promise<Response | null> {
    const path = url.pathname;
    const method = req.method;

    // POST /api/tenants/register — public, no auth required
    if (path === '/api/tenants/register' && method === 'POST') {
        return handleRegister(req, db, tenantService);
    }

    // GET /api/tenants/me — current tenant info
    if (path === '/api/tenants/me' && method === 'GET') {
        return handleGetCurrentTenant(context, tenantService);
    }

    // GET /api/tenants/me/members — list members (owner only)
    if (path === '/api/tenants/me/members' && method === 'GET') {
        const denied = tenantRoleGuard('owner')(req, url, context);
        if (denied) return denied;
        return handleListMembers(db, context);
    }

    // POST /api/tenants/me/members — add member (owner only)
    if (path === '/api/tenants/me/members' && method === 'POST') {
        const denied = tenantRoleGuard('owner')(req, url, context);
        if (denied) return denied;
        return handleAddMember(req, db, context);
    }

    // DELETE /api/tenants/me/members/:keyHash — remove member (owner only)
    const memberDeleteMatch = path.match(/^\/api\/tenants\/me\/members\/([^/]+)$/);
    if (memberDeleteMatch && method === 'DELETE') {
        const denied = tenantRoleGuard('owner')(req, url, context);
        if (denied) return denied;
        return handleRemoveMember(db, context, memberDeleteMatch[1]);
    }

    return null;
}

async function handleRegister(
    req: Request,
    db: Database,
    tenantService: TenantService | null,
): Promise<Response> {
    // Multi-tenant must be enabled
    if (!tenantService || !tenantService.isMultiTenant()) {
        return json({ error: 'Multi-tenant mode is not enabled' }, 503);
    }

    let body: { name?: string; slug?: string; ownerEmail?: string; plan?: string };
    try {
        body = await req.json() as typeof body;
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    const { name, slug, ownerEmail, plan } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return json({ error: 'name is required' }, 400);
    }
    if (!slug || typeof slug !== 'string') {
        return json({ error: 'slug is required' }, 400);
    }
    if (!ownerEmail || typeof ownerEmail !== 'string' || !ownerEmail.includes('@')) {
        return json({ error: 'ownerEmail must be a valid email' }, 400);
    }

    // Validate slug format
    if (!SLUG_PATTERN.test(slug)) {
        return json({ error: 'slug must be 3-48 chars, lowercase alphanumeric and hyphens only' }, 400);
    }

    // Check slug uniqueness
    const existing = tenantService.getTenantBySlug(slug);
    if (existing) {
        return json({ error: 'Slug already taken' }, 409);
    }

    // Create tenant
    const validPlans = ['free', 'starter', 'pro', 'enterprise'] as const;
    const tenantPlan = plan && validPlans.includes(plan as typeof validPlans[number])
        ? plan as typeof validPlans[number]
        : 'free';

    const tenant = tenantService.createTenant({
        name: name.trim(),
        slug,
        ownerEmail: ownerEmail.trim(),
        plan: tenantPlan,
    });

    // Generate API key
    const apiKey = randomBytes(32).toString('base64url');
    registerApiKey(db, tenant.id, apiKey);

    // Insert owner row in tenant_members
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(apiKey);
    const keyHash = hasher.digest('hex');

    db.query(`
        INSERT INTO tenant_members (tenant_id, key_hash, role, created_at, updated_at)
        VALUES (?, ?, 'owner', datetime('now'), datetime('now'))
    `).run(tenant.id, keyHash);

    log.info('Tenant registered', { tenantId: tenant.id, slug });

    return json({ tenant, apiKey }, 201);
}

function handleGetCurrentTenant(
    context: RequestContext,
    tenantService: TenantService | null,
): Response {
    if (!tenantService) {
        return json({ tenantId: 'default', plan: 'free', multiTenant: false });
    }

    const tenant = tenantService.getTenant(context.tenantId);
    if (!tenant) {
        return json({
            tenantId: context.tenantId,
            plan: context.tenantContext?.plan ?? 'free',
            multiTenant: tenantService.isMultiTenant(),
        });
    }

    return json({
        ...tenant,
        multiTenant: tenantService.isMultiTenant(),
        role: context.tenantRole ?? null,
    });
}

function handleListMembers(db: Database, context: RequestContext): Response {
    const rows = db.query(
        'SELECT tenant_id, key_hash, role, created_at, updated_at FROM tenant_members WHERE tenant_id = ?',
    ).all(context.tenantId) as Array<{
        tenant_id: string;
        key_hash: string;
        role: string;
        created_at: string;
        updated_at: string;
    }>;

    const members = rows.map((r) => ({
        tenantId: r.tenant_id,
        keyHash: r.key_hash,
        role: r.role as TenantRole,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    }));

    return json({ members });
}

async function handleAddMember(
    req: Request,
    db: Database,
    context: RequestContext,
): Promise<Response> {
    let body: { keyHash?: string; role?: string };
    try {
        body = await req.json() as typeof body;
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    const { keyHash, role } = body;
    if (!keyHash || typeof keyHash !== 'string') {
        return json({ error: 'keyHash is required' }, 400);
    }

    const validRoles: TenantRole[] = ['owner', 'operator', 'viewer'];
    const memberRole = role && validRoles.includes(role as TenantRole)
        ? role as TenantRole
        : 'viewer';

    db.query(`
        INSERT OR REPLACE INTO tenant_members (tenant_id, key_hash, role, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).run(context.tenantId, keyHash, memberRole);

    return json({ ok: true, keyHash, role: memberRole }, 201);
}

function handleRemoveMember(
    db: Database,
    context: RequestContext,
    keyHash: string,
): Response {
    const result = db.query(
        'DELETE FROM tenant_members WHERE tenant_id = ? AND key_hash = ?',
    ).run(context.tenantId, keyHash);

    if (result.changes === 0) {
        return json({ error: 'Member not found' }, 404);
    }

    return json({ ok: true });
}
