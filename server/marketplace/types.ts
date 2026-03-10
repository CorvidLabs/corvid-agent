// ─── Marketplace Listing ────────────────────────────────────────────────────

export type ListingStatus = 'draft' | 'published' | 'unlisted' | 'suspended';
export type ListingCategory =
    | 'coding' | 'research' | 'writing' | 'data' | 'devops' | 'security' | 'general'
    | 'automation' | 'analysis' | 'communication' | 'monitoring' | 'blockchain' | 'creative';

/** All valid listing categories. */
export const LISTING_CATEGORIES: readonly ListingCategory[] = [
    'coding', 'research', 'writing', 'data', 'devops', 'security', 'general',
    'automation', 'analysis', 'communication', 'monitoring', 'blockchain', 'creative',
] as const;
export type PricingModel = 'free' | 'per_use' | 'subscription';

export interface MarketplaceListing {
    id: string;
    agentId: string;
    /** Display name for the listing */
    name: string;
    description: string;
    /** Detailed README/docs (markdown) */
    longDescription: string;
    category: ListingCategory;
    tags: string[];
    /** Pricing model */
    pricingModel: PricingModel;
    /** Credits per invocation (for per_use) */
    priceCredits: number;
    /** Source instance URL (for federation) */
    instanceUrl: string | null;
    status: ListingStatus;
    /** Total invocations */
    useCount: number;
    /** Average rating (1-5) */
    avgRating: number;
    /** Total reviews */
    reviewCount: number;
    /** Owning tenant (seller wallet address for billing) */
    tenantId: string;
    /** Number of free trial uses allowed (null = no trial) */
    trialUses: number | null;
    /** Number of free trial days (null = no trial) */
    trialDays: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface MarketplaceReview {
    id: string;
    listingId: string;
    reviewerAgentId: string | null;
    reviewerAddress: string | null;
    rating: number;
    comment: string;
    createdAt: string;
}

// ─── Pricing Tiers ──────────────────────────────────────────────────────────

export type TierBillingCycle = 'one_time' | 'daily' | 'weekly' | 'monthly';

export interface PricingTier {
    id: string;
    listingId: string;
    name: string;
    description: string;
    priceCredits: number;
    billingCycle: TierBillingCycle;
    /** Max uses per hour (0 = unlimited) */
    rateLimit: number;
    /** Feature strings included in this tier */
    features: string[];
    sortOrder: number;
    createdAt: string;
}

export interface CreateTierInput {
    name: string;
    description?: string;
    priceCredits: number;
    billingCycle?: TierBillingCycle;
    rateLimit?: number;
    features?: string[];
    sortOrder?: number;
}

export interface UpdateTierInput {
    name?: string;
    description?: string;
    priceCredits?: number;
    billingCycle?: TierBillingCycle;
    rateLimit?: number;
    features?: string[];
    sortOrder?: number;
}

export interface TierRecord {
    id: string;
    listing_id: string;
    name: string;
    description: string;
    price_credits: number;
    billing_cycle: string;
    rate_limit: number;
    features: string;
    sort_order: number;
    created_at: string;
}

// ─── Verification Badges ────────────────────────────────────────────────────

/** Badge types awarded to listings based on quality signals. */
export type VerificationBadge = 'verified' | 'trusted' | 'official';

export interface ListingBadges {
    /** Agent has on-chain reputation score >= 70 */
    verified: boolean;
    /** Listing has >= 10 reviews with avg rating >= 4.0 */
    trusted: boolean;
    /** Listing is from the instance owner */
    official: boolean;
}

/** Quality gate validation result. */
export interface QualityGateResult {
    passed: boolean;
    failures: string[];
}

/** Sort options for marketplace search. */
export type SearchSortBy = 'rating' | 'popularity' | 'newest' | 'price_low' | 'price_high';

// ─── Search ─────────────────────────────────────────────────────────────────

export interface MarketplaceSearchParams {
    query?: string;
    category?: ListingCategory;
    pricingModel?: PricingModel;
    minRating?: number;
    tags?: string[];
    /** Filter listings to agents with at least this verification tier */
    minVerificationTier?: string;
    /** Sort order for results */
    sortBy?: SearchSortBy;
    /** Filter by verification badge */
    badge?: VerificationBadge;
    /** Minimum number of reviews */
    minReviews?: number;
    /** Minimum price (credits) */
    minPrice?: number;
    /** Maximum price (credits) */
    maxPrice?: number;
    limit?: number;
    offset?: number;
}

export interface MarketplaceSearchResult {
    listings: MarketplaceListing[];
    total: number;
    limit: number;
    offset: number;
}

// ─── Federation ─────────────────────────────────────────────────────────────

export interface FederatedInstance {
    url: string;
    name: string;
    lastSyncAt: string | null;
    listingCount: number;
    status: 'active' | 'unreachable';
}

export interface FederatedListing extends MarketplaceListing {
    sourceInstance: string;
}

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateListingInput {
    agentId: string;
    name: string;
    description: string;
    longDescription?: string;
    category: ListingCategory;
    tags?: string[];
    pricingModel?: PricingModel;
    priceCredits?: number;
}

export interface UpdateListingInput {
    name?: string;
    description?: string;
    longDescription?: string;
    category?: ListingCategory;
    tags?: string[];
    pricingModel?: PricingModel;
    priceCredits?: number;
    status?: ListingStatus;
}

export interface CreateReviewInput {
    listingId: string;
    reviewerAgentId?: string;
    reviewerAddress?: string;
    rating: number;
    comment: string;
}

// ─── DB Records ─────────────────────────────────────────────────────────────

export interface ListingRecord {
    id: string;
    agent_id: string;
    name: string;
    description: string;
    long_description: string;
    category: string;
    tags: string;
    pricing_model: string;
    price_credits: number;
    instance_url: string | null;
    status: string;
    use_count: number;
    avg_rating: number;
    review_count: number;
    tenant_id: string;
    trial_uses: number | null;
    trial_days: number | null;
    created_at: string;
    updated_at: string;
}

export interface ReviewRecord {
    id: string;
    listing_id: string;
    reviewer_agent_id: string | null;
    reviewer_address: string | null;
    rating: number;
    comment: string;
    created_at: string;
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface ListingAnalytics {
    listingId: string;
    totalUses: number;
    uses7d: number;
    uses30d: number;
    revenueAllTime: number;
    revenue7d: number;
    revenue30d: number;
    uniqueUsers: number;
    dailyUsage: DailyBucket[];
    topUsers: TopUser[];
}

export interface DailyBucket {
    date: string;
    uses: number;
    revenue: number;
}

export interface TopUser {
    userTenantId: string;
    uses: number;
    creditsSpent: number;
}

export interface BuyerUsageSummary {
    listingId: string;
    listingName: string;
    totalUses: number;
    totalCreditsSpent: number;
    lastUsedAt: string;
}
