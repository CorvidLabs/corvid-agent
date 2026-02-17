/**
 * Billing types for usage-based pricing via Stripe.
 */

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export interface Subscription {
    id: string;
    tenantId: string;
    stripeSubscriptionId: string;
    plan: string;
    status: SubscriptionStatus;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface UsageRecord {
    id: string;
    tenantId: string;
    /** Credit usage for the billing period */
    creditsUsed: number;
    /** Number of API calls */
    apiCalls: number;
    /** Number of agent sessions */
    sessionCount: number;
    /** Storage used in MB */
    storageMb: number;
    /** Billing period start */
    periodStart: string;
    /** Billing period end */
    periodEnd: string;
    /** Whether this has been reported to Stripe */
    reported: boolean;
    createdAt: string;
}

export interface Invoice {
    id: string;
    tenantId: string;
    stripeInvoiceId: string;
    amountCents: number;
    currency: string;
    status: InvoiceStatus;
    periodStart: string;
    periodEnd: string;
    paidAt: string | null;
    createdAt: string;
}

/** Pricing tiers for credits (per 1,000 credits) */
export interface PricingTier {
    upTo: number | null; // null = unlimited
    pricePerThousandCents: number; // in cents
}

export const CREDIT_PRICING_TIERS: PricingTier[] = [
    { upTo: 10_000, pricePerThousandCents: 100 },      // $1.00 per 1K credits
    { upTo: 100_000, pricePerThousandCents: 80 },       // $0.80 per 1K credits
    { upTo: null, pricePerThousandCents: 50 },           // $0.50 per 1K credits
];

// ─── DB Records ──────────────────────────────────────────────────────────────

export interface SubscriptionRecord {
    id: string;
    tenant_id: string;
    stripe_subscription_id: string;
    plan: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: number;
    created_at: string;
    updated_at: string;
}

export interface UsageRecordRow {
    id: string;
    tenant_id: string;
    credits_used: number;
    api_calls: number;
    session_count: number;
    storage_mb: number;
    period_start: string;
    period_end: string;
    reported: number;
    created_at: string;
}

export interface InvoiceRecord {
    id: string;
    tenant_id: string;
    stripe_invoice_id: string;
    amount_cents: number;
    currency: string;
    status: string;
    period_start: string;
    period_end: string;
    paid_at: string | null;
    created_at: string;
}
