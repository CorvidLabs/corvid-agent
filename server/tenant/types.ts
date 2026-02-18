/**
 * Multi-tenant isolation types for CorvidAgent Cloud.
 *
 * Every resource in the system is scoped to a tenant. Single-tenant
 * deployments use a default tenant ID so the schema is always consistent.
 */

export interface Tenant {
    id: string;
    name: string;
    slug: string;
    /** Owner email */
    ownerEmail: string;
    /** Stripe customer ID (null for self-hosted) */
    stripeCustomerId: string | null;
    /** Current plan */
    plan: TenantPlan;
    /** Max agents allowed */
    maxAgents: number;
    /** Max concurrent sessions */
    maxConcurrentSessions: number;
    /** Whether sandbox features are enabled */
    sandboxEnabled: boolean;
    status: TenantStatus;
    createdAt: string;
    updatedAt: string;
}

export type TenantPlan = 'free' | 'starter' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'deleted';

export interface TenantLimits {
    maxAgents: number;
    maxConcurrentSessions: number;
    maxCreditsPerMonth: number;
    maxStorageMb: number;
    sandboxEnabled: boolean;
    marketplaceEnabled: boolean;
    federationEnabled: boolean;
}

export const PLAN_LIMITS: Record<TenantPlan, TenantLimits> = {
    free: {
        maxAgents: 3,
        maxConcurrentSessions: 2,
        maxCreditsPerMonth: 1_000,
        maxStorageMb: 100,
        sandboxEnabled: false,
        marketplaceEnabled: false,
        federationEnabled: false,
    },
    starter: {
        maxAgents: 10,
        maxConcurrentSessions: 5,
        maxCreditsPerMonth: 10_000,
        maxStorageMb: 1_000,
        sandboxEnabled: true,
        marketplaceEnabled: true,
        federationEnabled: false,
    },
    pro: {
        maxAgents: 50,
        maxConcurrentSessions: 20,
        maxCreditsPerMonth: 100_000,
        maxStorageMb: 10_000,
        sandboxEnabled: true,
        marketplaceEnabled: true,
        federationEnabled: true,
    },
    enterprise: {
        maxAgents: -1, // unlimited
        maxConcurrentSessions: -1,
        maxCreditsPerMonth: -1,
        maxStorageMb: -1,
        sandboxEnabled: true,
        marketplaceEnabled: true,
        federationEnabled: true,
    },
};

export interface CreateTenantInput {
    name: string;
    slug: string;
    ownerEmail: string;
    plan?: TenantPlan;
}

export interface TenantContext {
    tenantId: string;
    plan: TenantPlan;
    limits: TenantLimits;
}

/** Default tenant ID for self-hosted / single-tenant deployments. */
export const DEFAULT_TENANT_ID = 'default';

// ─── DB Record ───────────────────────────────────────────────────────────────

export interface TenantRecord {
    id: string;
    name: string;
    slug: string;
    owner_email: string;
    stripe_customer_id: string | null;
    plan: string;
    max_agents: number;
    max_concurrent_sessions: number;
    sandbox_enabled: number;
    status: string;
    created_at: string;
    updated_at: string;
}
