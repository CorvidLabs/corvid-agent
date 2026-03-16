import { z } from 'zod';

// ─── Marketplace ─────────────────────────────────────────────────────────────

const ListingCategorySchema = z.enum([
    'coding', 'research', 'writing', 'data', 'devops', 'security', 'general',
    'automation', 'analysis', 'communication', 'monitoring', 'blockchain', 'creative',
]);

const PricingModelSchema = z.enum(['free', 'per_use', 'subscription']);

export const CreateListingSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    name: z.string().min(1, 'name is required'),
    description: z.string().min(1, 'description is required'),
    longDescription: z.string().optional(),
    category: ListingCategorySchema,
    tags: z.array(z.string()).optional(),
    pricingModel: PricingModelSchema.optional(),
    priceCredits: z.number().int().min(0).optional(),
    trialUses: z.number().int().min(1).optional(),
    trialDays: z.number().int().min(1).optional(),
});

export const UpdateListingSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    longDescription: z.string().optional(),
    category: ListingCategorySchema.optional(),
    tags: z.array(z.string()).optional(),
    pricingModel: PricingModelSchema.optional(),
    priceCredits: z.number().int().min(0).optional(),
    status: z.enum(['draft', 'published', 'unlisted', 'suspended']).optional(),
    trialUses: z.number().int().min(1).nullable().optional(),
    trialDays: z.number().int().min(1).nullable().optional(),
});

export const CreateReviewSchema = z.object({
    listingId: z.string().optional(), // Usually provided via URL path param
    reviewerAgentId: z.string().optional(),
    reviewerAddress: z.string().optional(),
    rating: z.number().int().min(1, 'rating must be at least 1').max(5, 'rating must be at most 5'),
    comment: z.string().min(1, 'comment is required'),
});

export const RegisterFederationInstanceSchema = z.object({
    url: z.string().url('url must be a valid URL'),
    name: z.string().min(1, 'name is required'),
});

export const SubscribeSchema = z.object({
    subscriberTenantId: z.string().min(1, 'subscriberTenantId is required'),
    billingCycle: z.enum(['daily', 'weekly', 'monthly']),
});

export const CancelSubscriptionSchema = z.object({
    subscriberTenantId: z.string().min(1, 'subscriberTenantId is required'),
});

// ─── Pricing Tiers ──────────────────────────────────────────────────────────

const TierBillingCycleSchema = z.enum(['one_time', 'daily', 'weekly', 'monthly']);

export const CreateTierSchema = z.object({
    name: z.string().min(1, 'name is required'),
    description: z.string().optional(),
    priceCredits: z.number().int().min(0, 'priceCredits must be non-negative'),
    billingCycle: TierBillingCycleSchema.optional(),
    rateLimit: z.number().int().min(0).optional(),
    features: z.array(z.string()).optional(),
    sortOrder: z.number().int().min(0).optional(),
});

export const UpdateTierSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    priceCredits: z.number().int().min(0).optional(),
    billingCycle: TierBillingCycleSchema.optional(),
    rateLimit: z.number().int().min(0).optional(),
    features: z.array(z.string()).optional(),
    sortOrder: z.number().int().min(0).optional(),
});

export const TierUseSchema = z.object({
    tierId: z.string().min(1, 'tierId is required'),
});

export const TierSubscribeSchema = z.object({
    tierId: z.string().min(1, 'tierId is required'),
    subscriberTenantId: z.string().min(1, 'subscriberTenantId is required'),
});

// ─── Trials ──────────────────────────────────────────────────────────────────

export const StartTrialSchema = z.object({
    tenantId: z.string().min(1, 'tenantId is required'),
});
