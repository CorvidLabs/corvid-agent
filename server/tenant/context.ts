/**
 * TenantContext — Propagates tenant scope through request handling.
 *
 * In multi-tenant mode, every request is associated with a tenant.
 * In single-tenant mode, the default tenant is used.
 */
import type { Database } from 'bun:sqlite';
import type { TenantContext, Tenant, TenantRecord, TenantPlan } from './types';
import { DEFAULT_TENANT_ID, PLAN_LIMITS } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('TenantContext');

function recordToTenant(row: TenantRecord): Tenant {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        ownerEmail: row.owner_email,
        stripeCustomerId: row.stripe_customer_id,
        plan: row.plan as TenantPlan,
        maxAgents: row.max_agents,
        maxConcurrentSessions: row.max_concurrent_sessions,
        sandboxEnabled: row.sandbox_enabled === 1,
        status: row.status as Tenant['status'],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class TenantService {
    private db: Database;
    private multiTenant: boolean;

    constructor(db: Database, multiTenant: boolean = false) {
        this.db = db;
        this.multiTenant = multiTenant;
    }

    isMultiTenant(): boolean {
        return this.multiTenant;
    }

    /**
     * Resolve a tenant context from a request.
     * In single-tenant mode, returns the default context.
     * In multi-tenant mode, extracts tenant from auth token or header.
     */
    resolveContext(tenantId?: string): TenantContext {
        if (!this.multiTenant) {
            return {
                tenantId: DEFAULT_TENANT_ID,
                plan: 'enterprise',
                limits: PLAN_LIMITS.enterprise,
            };
        }

        const id = tenantId ?? DEFAULT_TENANT_ID;
        const tenant = this.getTenant(id);

        if (!tenant) {
            return {
                tenantId: id,
                plan: 'free',
                limits: PLAN_LIMITS.free,
            };
        }

        return {
            tenantId: tenant.id,
            plan: tenant.plan,
            limits: PLAN_LIMITS[tenant.plan],
        };
    }

    /**
     * Create a new tenant.
     */
    createTenant(input: {
        name: string;
        slug: string;
        ownerEmail: string;
        plan?: TenantPlan;
    }): Tenant {
        const id = crypto.randomUUID();
        const plan = input.plan ?? 'free';
        const limits = PLAN_LIMITS[plan];

        this.db.query(`
            INSERT INTO tenants
                (id, name, slug, owner_email, plan, max_agents, max_concurrent_sessions, sandbox_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            input.name,
            input.slug,
            input.ownerEmail,
            plan,
            limits.maxAgents,
            limits.maxConcurrentSessions,
            limits.sandboxEnabled ? 1 : 0,
        );

        log.info('Created tenant', { id, name: input.name, plan });
        return this.getTenant(id)!;
    }

    /**
     * Get a tenant by ID.
     */
    getTenant(id: string): Tenant | null {
        const row = this.db.query(
            'SELECT * FROM tenants WHERE id = ?',
        ).get(id) as TenantRecord | null;
        return row ? recordToTenant(row) : null;
    }

    /**
     * Get a tenant by slug.
     */
    getTenantBySlug(slug: string): Tenant | null {
        const row = this.db.query(
            'SELECT * FROM tenants WHERE slug = ?',
        ).get(slug) as TenantRecord | null;
        return row ? recordToTenant(row) : null;
    }

    /**
     * List all tenants.
     */
    listTenants(): Tenant[] {
        const rows = this.db.query(
            'SELECT * FROM tenants ORDER BY created_at DESC',
        ).all() as TenantRecord[];
        return rows.map(recordToTenant);
    }

    /**
     * Update a tenant's plan.
     */
    updatePlan(tenantId: string, plan: TenantPlan): Tenant | null {
        const limits = PLAN_LIMITS[plan];
        this.db.query(`
            UPDATE tenants
            SET plan = ?, max_agents = ?, max_concurrent_sessions = ?,
                sandbox_enabled = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(
            plan,
            limits.maxAgents,
            limits.maxConcurrentSessions,
            limits.sandboxEnabled ? 1 : 0,
            tenantId,
        );
        return this.getTenant(tenantId);
    }

    /**
     * Update tenant's Stripe customer ID.
     */
    setStripeCustomerId(tenantId: string, customerId: string): void {
        this.db.query(
            'UPDATE tenants SET stripe_customer_id = ? WHERE id = ?',
        ).run(customerId, tenantId);
    }

    /**
     * Suspend a tenant.
     */
    suspendTenant(tenantId: string): void {
        this.db.query(
            "UPDATE tenants SET status = 'suspended', updated_at = datetime('now') WHERE id = ?",
        ).run(tenantId);
        log.warn('Tenant suspended', { tenantId });
    }

    /**
     * Check if a tenant can create more agents.
     */
    canCreateAgent(tenantId: string): boolean {
        const tenant = this.getTenant(tenantId);
        if (!tenant) return false;
        if (tenant.maxAgents === -1) return true; // unlimited

        const row = this.db.query(
            'SELECT COUNT(*) as count FROM agents WHERE tenant_id = ?',
        ).get(tenantId) as { count: number } | null;

        return (row?.count ?? 0) < tenant.maxAgents;
    }

    /**
     * Check if a tenant can start more sessions.
     */
    canStartSession(tenantId: string): boolean {
        const tenant = this.getTenant(tenantId);
        if (!tenant) return false;
        if (tenant.maxConcurrentSessions === -1) return true;

        const row = this.db.query(
            "SELECT COUNT(*) as count FROM sessions WHERE tenant_id = ? AND status IN ('running', 'idle')",
        ).get(tenantId) as { count: number } | null;

        return (row?.count ?? 0) < tenant.maxConcurrentSessions;
    }
}
