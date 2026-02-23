export type ListingStatus = 'draft' | 'published' | 'unlisted' | 'suspended';
export type ListingCategory = 'coding' | 'research' | 'writing' | 'data' | 'devops' | 'security' | 'general';
export type PricingModel = 'free' | 'per_use' | 'subscription';

export interface MarketplaceListing {
    id: string;
    agentId: string;
    name: string;
    description: string;
    longDescription: string;
    category: ListingCategory;
    tags: string[];
    pricingModel: PricingModel;
    priceCredits: number;
    instanceUrl: string | null;
    status: ListingStatus;
    useCount: number;
    avgRating: number;
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

export interface MarketplaceSearchParams {
    query?: string;
    category?: ListingCategory;
    pricingModel?: PricingModel;
    minRating?: number;
    tags?: string[];
    limit?: number;
    offset?: number;
}

export interface MarketplaceSearchResult {
    listings: MarketplaceListing[];
    total: number;
    limit: number;
    offset: number;
}
