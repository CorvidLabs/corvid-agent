// ─── Marketplace Listing ────────────────────────────────────────────────────

export type ListingStatus = 'draft' | 'published' | 'unlisted' | 'suspended';
export type ListingCategory = 'coding' | 'research' | 'writing' | 'data' | 'devops' | 'security' | 'general';
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

// ─── Search ─────────────────────────────────────────────────────────────────

export interface MarketplaceSearchParams {
    query?: string;
    category?: ListingCategory;
    pricingModel?: PricingModel;
    minRating?: number;
    tags?: string[];
    /** Filter listings to agents with at least this verification tier */
    minVerificationTier?: string;
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
