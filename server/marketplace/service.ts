/**
 * MarketplaceService — Listing CRUD, FTS5 search, and credit consumption.
 *
 * Manages agent marketplace listings where agents can publish their
 * capabilities for discovery and invocation by other agents.
 */
import type { Database, SQLQueryBindings } from 'bun:sqlite';
import { queryCount } from '../db/types';
import type {
    MarketplaceListing,
    MarketplaceReview,
    MarketplaceSearchParams,
    MarketplaceSearchResult,
    CreateListingInput,
    UpdateListingInput,
    CreateReviewInput,
    ListingRecord,
    ReviewRecord,
    PricingTier,
    CreateTierInput,
    UpdateTierInput,
    TierRecord,
    ListingBadges,
    QualityGateResult,
} from './types';
import { LISTING_CATEGORIES } from './types';
import { IdentityVerification } from '../reputation/identity-verification';
import type { VerificationTier } from '../reputation/identity-verification';
import { EscrowService } from './escrow';
import { ValidationError } from '../lib/errors';
import { createLogger } from '../lib/logger';

const log = createLogger('Marketplace');

/**
 * Error thrown when a buyer has insufficient credits for a per-use listing.
 */
export class InsufficientCreditsError extends Error {
    listingId: string;
    required: number;

    constructor(listingId: string, required: number) {
        super(`Insufficient credits: listing ${listingId} requires ${required} credits`);
        this.name = 'InsufficientCreditsError';
        this.listingId = listingId;
        this.required = required;
    }
}

/**
 * Result of recording a listing use, including billing outcome.
 */
export interface UseResult {
    success: boolean;
    creditsDeducted: number;
    escrowId?: string;
}

/**
 * Error thrown when a tier's rate limit is exceeded.
 */
export class RateLimitExceededError extends Error {
    tierId: string;
    limit: number;

    constructor(tierId: string, limit: number) {
        super(`Rate limit exceeded: tier ${tierId} allows ${limit} uses per hour`);
        this.name = 'RateLimitExceededError';
        this.tierId = tierId;
        this.limit = limit;
    }
}

/**
 * Error thrown when a listing update is blocked by the verification gate.
 */
export class VerificationGateError extends Error {
    tier: VerificationTier;
    required: VerificationTier;

    constructor(tier: VerificationTier, required: VerificationTier) {
        super(`Publishing blocked: agent tier ${tier} does not meet required ${required}`);
        this.name = 'VerificationGateError';
        this.tier = tier;
        this.required = required;
    }
}

// ─── Row Mappers ─────────────────────────────────────────────────────────────

function recordToListing(row: ListingRecord): MarketplaceListing {
    return {
        id: row.id,
        agentId: row.agent_id,
        name: row.name,
        description: row.description,
        longDescription: row.long_description,
        category: row.category as MarketplaceListing['category'],
        tags: row.tags ? JSON.parse(row.tags) : [],
        pricingModel: row.pricing_model as MarketplaceListing['pricingModel'],
        priceCredits: row.price_credits,
        instanceUrl: row.instance_url,
        status: row.status as MarketplaceListing['status'],
        useCount: row.use_count,
        avgRating: row.avg_rating,
        reviewCount: row.review_count,
        tenantId: row.tenant_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function recordToReview(row: ReviewRecord): MarketplaceReview {
    return {
        id: row.id,
        listingId: row.listing_id,
        reviewerAgentId: row.reviewer_agent_id,
        reviewerAddress: row.reviewer_address,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.created_at,
    };
}

function recordToTier(row: TierRecord): PricingTier {
    return {
        id: row.id,
        listingId: row.listing_id,
        name: row.name,
        description: row.description,
        priceCredits: row.price_credits,
        billingCycle: row.billing_cycle as PricingTier['billingCycle'],
        rateLimit: row.rate_limit,
        features: row.features ? JSON.parse(row.features) : [],
        sortOrder: row.sort_order,
        createdAt: row.created_at,
    };
}

// ─── Service ─────────────────────────────────────────────────────────────────

/** Default minimum verification tier required to publish a listing */
const DEFAULT_MIN_LISTING_TIER: VerificationTier = 'GITHUB_VERIFIED';

export class MarketplaceService {
    private db: Database;
    private identity: IdentityVerification;
    private escrow: EscrowService;
    private minListingTier: VerificationTier;

    constructor(db: Database, minListingTier: VerificationTier = DEFAULT_MIN_LISTING_TIER) {
        this.db = db;
        this.identity = new IdentityVerification(db);
        this.escrow = new EscrowService(db);
        this.minListingTier = minListingTier;
    }

    // ─── Listings ────────────────────────────────────────────────────────────

    /**
     * Check if an agent meets the minimum verification tier to publish.
     */
    canPublish(agentId: string): { allowed: boolean; tier: VerificationTier; required: VerificationTier } {
        const tier = this.identity.getTier(agentId);
        return {
            allowed: this.identity.meetsMinimumTier(tier, this.minListingTier),
            tier,
            required: this.minListingTier,
        };
    }

    /**
     * Get the verification tier for a listing's agent.
     */
    getListingVerificationTier(listingId: string): VerificationTier | null {
        const listing = this.getListing(listingId);
        if (!listing) return null;
        return this.identity.getTier(listing.agentId);
    }


    // ─── Verification Badges ─────────────────────────────────────────────────

    /**
     * Compute verification badges for a listing.
     * - verified: agent's on-chain reputation score >= 70
     * - trusted: listing has >= 10 reviews with avg rating >= 4.0
     * - official: listing's tenant matches the instance owner
     */
    getListingBadges(listingId: string): ListingBadges {
        const listing = this.getListing(listingId);
        if (!listing) return { verified: false, trusted: false, official: false };

        // Verified: agent reputation score >= 70
        const scoreRow = this.db.query(
            'SELECT overall_score FROM agent_reputation WHERE agent_id = ?',
        ).get(listing.agentId) as { overall_score: number } | null;
        const verified = (scoreRow?.overall_score ?? 0) >= 70;

        // Trusted: >= 10 reviews with avg >= 4.0
        const trusted = listing.reviewCount >= 10 && listing.avgRating >= 4.0;

        // Official: tenant_id matches the instance owner
        const ownerRow = this.db.query(
            "SELECT value FROM settings WHERE key = 'owner_wallet'",
        ).get() as { value: string } | null;
        const official = ownerRow !== null && listing.tenantId === ownerRow.value;

        return { verified, trusted, official };
    }

    // ─── Quality Gates ───────────────────────────────────────────────────────

    /**
     * Check quality gates for publishing a listing (draft → published).
     */
    checkQualityGates(listingId: string): QualityGateResult {
        const listing = this.getListing(listingId);
        if (!listing) return { passed: false, failures: ['Listing not found'] };

        const failures: string[] = [];

        if (!listing.tenantId || listing.tenantId.length === 0) {
            failures.push('Agent must have a valid Algorand wallet');
        }
        if (!listing.name || listing.name.length < 20) {
            failures.push('Name must be at least 20 characters');
        }
        if (!listing.description || listing.description.length < 20) {
            failures.push('Description must be at least 20 characters');
        }
        if (!listing.tags || listing.tags.length === 0) {
            failures.push('At least one tag must be set');
        }
        if (!LISTING_CATEGORIES.includes(listing.category)) {
            failures.push(`Invalid category: ${listing.category}`);
        }

        return { passed: failures.length === 0, failures };
    }

    createListing(input: CreateListingInput): MarketplaceListing {
        const id = crypto.randomUUID();
        const tags = JSON.stringify(input.tags ?? []);

        this.db.query(`
            INSERT INTO marketplace_listings
                (id, agent_id, name, description, long_description, category,
                 tags, pricing_model, price_credits, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
        `).run(
            id,
            input.agentId,
            input.name,
            input.description,
            input.longDescription ?? '',
            input.category,
            tags,
            input.pricingModel ?? 'free',
            input.priceCredits ?? 0,
        );

        log.info('Created marketplace listing', { id, name: input.name, agentId: input.agentId });
        return this.getListing(id)!;
    }

    getListing(id: string): MarketplaceListing | null {
        const row = this.db.query(
            'SELECT * FROM marketplace_listings WHERE id = ?',
        ).get(id) as ListingRecord | null;

        return row ? recordToListing(row) : null;
    }

    updateListing(id: string, input: UpdateListingInput): MarketplaceListing | null {
        const existing = this.getListing(id);
        if (!existing) return null;

        // Enforce verification gate when publishing
        if (input.status === 'published' && existing.status !== 'published') {
            const check = this.canPublish(existing.agentId);
            if (!check.allowed) {
                log.warn('Publishing blocked: insufficient verification tier', {
                    id, agentId: existing.agentId, tier: check.tier, required: check.required,
                });
                throw new VerificationGateError(check.tier, check.required);
            }

            // Apply quality gates before publishing
            const gates = this.checkQualityGates(id);
            if (!gates.passed) {
                log.warn('Publishing blocked: quality gates failed', { id, failures: gates.failures });
                throw new ValidationError(`Quality gates failed: ${gates.failures.join('; ')}`);
            }
        }

        const updates: string[] = [];
        const values: SQLQueryBindings[] = [];

        if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name); }
        if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
        if (input.longDescription !== undefined) { updates.push('long_description = ?'); values.push(input.longDescription); }
        if (input.category !== undefined) { updates.push('category = ?'); values.push(input.category); }
        if (input.tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(input.tags)); }
        if (input.pricingModel !== undefined) { updates.push('pricing_model = ?'); values.push(input.pricingModel); }
        if (input.priceCredits !== undefined) { updates.push('price_credits = ?'); values.push(input.priceCredits); }
        if (input.status !== undefined) { updates.push('status = ?'); values.push(input.status); }

        if (updates.length === 0) return existing;

        updates.push("updated_at = datetime('now')");
        values.push(id);

        this.db.query(
            `UPDATE marketplace_listings SET ${updates.join(', ')} WHERE id = ?`,
        ).run(...values);

        log.info('Updated marketplace listing', { id });
        return this.getListing(id);
    }

    deleteListing(id: string): boolean {
        const result = this.db.query('DELETE FROM marketplace_listings WHERE id = ?').run(id);
        return result.changes > 0;
    }

    getListingsByAgent(agentId: string): MarketplaceListing[] {
        const rows = this.db.query(
            'SELECT * FROM marketplace_listings WHERE agent_id = ? ORDER BY updated_at DESC',
        ).all(agentId) as ListingRecord[];

        return rows.map(recordToListing);
    }

    /**
     * Record a use of a listing. For per-use paid listings, deducts credits
     * from the buyer and credits the seller via instant escrow settlement.
     *
     * @param listingId The listing being used
     * @param buyerWalletAddress Buyer's wallet (required for paid listings)
     * @throws InsufficientCreditsError if buyer lacks credits for a paid listing
     */
    recordUse(listingId: string, buyerWalletAddress?: string): UseResult {
        const listing = this.getListing(listingId);
        if (!listing) {
            // Listing not found — increment anyway for backwards compat
            this.db.query(
                "UPDATE marketplace_listings SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?",
            ).run(listingId);
            return { success: true, creditsDeducted: 0 };
        }

        const isPaid = listing.pricingModel === 'per_use' && listing.priceCredits > 0;

        if (isPaid) {
            if (!buyerWalletAddress) {
                throw new InsufficientCreditsError(listingId, listing.priceCredits);
            }

            const escrowTx = this.escrow.settleInstantUse(
                listingId,
                buyerWalletAddress,
                listing.tenantId,
                listing.priceCredits,
            );

            if (!escrowTx) {
                throw new InsufficientCreditsError(listingId, listing.priceCredits);
            }

            // Increment use count after successful billing
            this.db.query(
                "UPDATE marketplace_listings SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?",
            ).run(listingId);

            log.info('Paid listing use recorded', {
                listingId,
                buyer: buyerWalletAddress,
                credits: listing.priceCredits,
                escrowId: escrowTx.id,
            });

            return { success: true, creditsDeducted: listing.priceCredits, escrowId: escrowTx.id };
        }

        // Free listing — just increment use count
        this.db.query(
            "UPDATE marketplace_listings SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?",
        ).run(listingId);
        return { success: true, creditsDeducted: 0 };
    }

    // ─── Search ──────────────────────────────────────────────────────────────

    search(params: MarketplaceSearchParams): MarketplaceSearchResult {
        const limit = params.limit ?? 20;
        const offset = params.offset ?? 0;

        const conditions: string[] = ["ml.status = 'published'"];
        const values: SQLQueryBindings[] = [];

        if (params.category) {
            conditions.push('ml.category = ?');
            values.push(params.category);
        }

        if (params.pricingModel) {
            conditions.push('ml.pricing_model = ?');
            values.push(params.pricingModel);
        }

        if (params.minRating !== undefined) {
            conditions.push('ml.avg_rating >= ?');
            values.push(params.minRating);
        }

        if (params.tags && params.tags.length > 0) {
            // Match any of the provided tags (JSON array stored as string)
            const tagConditions = params.tags.map(() => "ml.tags LIKE ?");
            conditions.push(`(${tagConditions.join(' OR ')})`);
            for (const tag of params.tags) {
                values.push(`%"${tag}"%`);
            }
        }

        // Full-text search on name + description
        if (params.query) {
            conditions.push('(ml.name LIKE ? OR ml.description LIKE ?)');
            const pattern = `%${params.query}%`;
            values.push(pattern, pattern);
        }

        // Min reviews filter
        if (params.minReviews !== undefined) {
            conditions.push('ml.review_count >= ?');
            values.push(params.minReviews);
        }

        // Price range filters
        if (params.minPrice !== undefined) {
            conditions.push('ml.price_credits >= ?');
            values.push(params.minPrice);
        }
        if (params.maxPrice !== undefined) {
            conditions.push('ml.price_credits <= ?');
            values.push(params.maxPrice);
        }

        // Verification tier filter via LEFT JOIN on agent_identity
        const joins: string[] = [];
        if (params.minVerificationTier) {
            joins.push('LEFT JOIN agent_identity ai ON ai.agent_id = ml.agent_id');
            conditions.push("COALESCE(ai.tier, 'UNVERIFIED') = ?");
            values.push(params.minVerificationTier);
        }

        // Badge filter
        if (params.badge === 'verified') {
            if (!joins.some(j => j.includes('agent_reputation'))) {
                joins.push('INNER JOIN agent_reputation ar ON ar.agent_id = ml.agent_id');
            }
            conditions.push('ar.overall_score >= 70');
        } else if (params.badge === 'trusted') {
            conditions.push('ml.review_count >= 10');
            conditions.push('ml.avg_rating >= 4.0');
        } else if (params.badge === 'official') {
            const ownerRow = this.db.query(
                "SELECT value FROM settings WHERE key = 'owner_wallet'",
            ).get() as { value: string } | null;
            if (ownerRow) {
                conditions.push('ml.tenant_id = ?');
                values.push(ownerRow.value);
            } else {
                conditions.push('1 = 0');
            }
        }

        const joinClause = joins.length > 0 ? ` ${joins.join(' ')}` : '';

        // Prefix conditions with table alias for disambiguation
        const where = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        // Sort order
        let orderBy: string;
        switch (params.sortBy) {
            case 'rating':
                orderBy = 'ml.avg_rating DESC, ml.review_count DESC';
                break;
            case 'popularity':
                orderBy = 'ml.use_count DESC, ml.avg_rating DESC';
                break;
            case 'newest':
                orderBy = 'ml.created_at DESC';
                break;
            case 'price_low':
                orderBy = 'ml.price_credits ASC, ml.avg_rating DESC';
                break;
            case 'price_high':
                orderBy = 'ml.price_credits DESC, ml.avg_rating DESC';
                break;
            default:
                orderBy = 'ml.avg_rating DESC, ml.use_count DESC';
        }

        // Count total
        const total = queryCount(this.db, `SELECT COUNT(*) as cnt FROM marketplace_listings ml${joinClause} ${where}`, ...values);

        // Fetch page
        const rows = this.db.query(
            `SELECT ml.* FROM marketplace_listings ml${joinClause} ${where}
             ORDER BY ${orderBy}
             LIMIT ? OFFSET ?`,
        ).all(...values, limit, offset) as ListingRecord[];

        return {
            listings: rows.map(recordToListing),
            total,
            limit,
            offset,
        };
    }

    // ─── Reviews ─────────────────────────────────────────────────────────────

    createReview(input: CreateReviewInput): MarketplaceReview {
        const id = crypto.randomUUID();

        this.db.query(`
            INSERT INTO marketplace_reviews
                (id, listing_id, reviewer_agent_id, reviewer_address, rating, comment)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            id,
            input.listingId,
            input.reviewerAgentId ?? null,
            input.reviewerAddress ?? null,
            input.rating,
            input.comment,
        );

        // Update listing aggregate stats
        this.updateListingRating(input.listingId);

        log.info('Created review', { id, listingId: input.listingId, rating: input.rating });
        return this.getReview(id)!;
    }

    getReview(id: string): MarketplaceReview | null {
        const row = this.db.query(
            'SELECT * FROM marketplace_reviews WHERE id = ?',
        ).get(id) as ReviewRecord | null;

        return row ? recordToReview(row) : null;
    }

    getReviewsForListing(listingId: string): MarketplaceReview[] {
        const rows = this.db.query(
            'SELECT * FROM marketplace_reviews WHERE listing_id = ? ORDER BY created_at DESC',
        ).all(listingId) as ReviewRecord[];

        return rows.map(recordToReview);
    }

    deleteReview(id: string): boolean {
        const review = this.getReview(id);
        if (!review) return false;

        const result = this.db.query('DELETE FROM marketplace_reviews WHERE id = ?').run(id);
        if (result.changes > 0) {
            this.updateListingRating(review.listingId);
            return true;
        }
        return false;
    }

    // ─── Pricing Tiers ─────────────────────────────────────────────────────

    /** Maximum number of pricing tiers per listing. */
    static readonly MAX_TIERS_PER_LISTING = 5;

    getTiersForListing(listingId: string): PricingTier[] {
        const rows = this.db.query(
            'SELECT * FROM marketplace_pricing_tiers WHERE listing_id = ? ORDER BY sort_order ASC',
        ).all(listingId) as TierRecord[];

        return rows.map(recordToTier);
    }

    getTier(tierId: string): PricingTier | null {
        const row = this.db.query(
            'SELECT * FROM marketplace_pricing_tiers WHERE id = ?',
        ).get(tierId) as TierRecord | null;

        return row ? recordToTier(row) : null;
    }

    createTier(listingId: string, input: CreateTierInput): PricingTier {
        const listing = this.getListing(listingId);
        if (!listing) {
            throw new Error(`Listing ${listingId} not found`);
        }

        const existing = this.getTiersForListing(listingId);
        if (existing.length >= MarketplaceService.MAX_TIERS_PER_LISTING) {
            throw new ValidationError(`Maximum of ${MarketplaceService.MAX_TIERS_PER_LISTING} tiers per listing`);
        }

        const id = crypto.randomUUID();
        const features = JSON.stringify(input.features ?? []);

        this.db.query(`
            INSERT INTO marketplace_pricing_tiers
                (id, listing_id, name, description, price_credits, billing_cycle,
                 rate_limit, features, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            listingId,
            input.name,
            input.description ?? '',
            input.priceCredits,
            input.billingCycle ?? 'one_time',
            input.rateLimit ?? 0,
            features,
            input.sortOrder ?? existing.length,
        );

        // Update listing price_credits to reflect minimum tier price ("starting at")
        this.syncListingPrice(listingId);

        log.info('Created pricing tier', { id, listingId, name: input.name });
        return this.getTier(id)!;
    }

    updateTier(tierId: string, input: UpdateTierInput): PricingTier | null {
        const existing = this.getTier(tierId);
        if (!existing) return null;

        const updates: string[] = [];
        const values: SQLQueryBindings[] = [];

        if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name); }
        if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
        if (input.priceCredits !== undefined) { updates.push('price_credits = ?'); values.push(input.priceCredits); }
        if (input.billingCycle !== undefined) { updates.push('billing_cycle = ?'); values.push(input.billingCycle); }
        if (input.rateLimit !== undefined) { updates.push('rate_limit = ?'); values.push(input.rateLimit); }
        if (input.features !== undefined) { updates.push('features = ?'); values.push(JSON.stringify(input.features)); }
        if (input.sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(input.sortOrder); }

        if (updates.length === 0) return existing;

        values.push(tierId);
        this.db.query(
            `UPDATE marketplace_pricing_tiers SET ${updates.join(', ')} WHERE id = ?`,
        ).run(...values);

        // Sync "starting at" price
        this.syncListingPrice(existing.listingId);

        log.info('Updated pricing tier', { id: tierId });
        return this.getTier(tierId);
    }

    deleteTier(tierId: string): boolean {
        const tier = this.getTier(tierId);
        if (!tier) return false;

        const result = this.db.query('DELETE FROM marketplace_pricing_tiers WHERE id = ?').run(tierId);
        if (result.changes > 0) {
            this.syncListingPrice(tier.listingId);
            return true;
        }
        return false;
    }

    /**
     * Check tier-based rate limit for a buyer on a specific tier.
     * Returns true if the buyer is within the rate limit (or tier has no limit).
     */
    checkTierRateLimit(tierId: string, buyerWalletAddress: string): boolean {
        const tier = this.getTier(tierId);
        if (!tier || tier.rateLimit === 0) return true; // No limit

        // Count uses in the last hour via credit_transactions referencing this tier
        const row = this.db.query(`
            SELECT COUNT(*) as cnt FROM credit_transactions
            WHERE wallet_address = ?
              AND reference LIKE ?
              AND created_at >= datetime('now', '-1 hour')
        `).get(buyerWalletAddress, `tier_use:${tierId}:%`) as { cnt: number };

        return row.cnt < tier.rateLimit;
    }

    /**
     * Record a tier-based use of a listing. Deducts the tier's price_credits
     * from the buyer, enforces rate limits, and credits the seller.
     */
    recordTierUse(listingId: string, tierId: string, buyerWalletAddress: string): UseResult {
        const listing = this.getListing(listingId);
        if (!listing) {
            return { success: false, creditsDeducted: 0 };
        }

        const tier = this.getTier(tierId);
        if (!tier || tier.listingId !== listingId) {
            return { success: false, creditsDeducted: 0 };
        }

        // Check rate limit
        if (!this.checkTierRateLimit(tierId, buyerWalletAddress)) {
            throw new RateLimitExceededError(tierId, tier.rateLimit);
        }

        if (tier.priceCredits > 0) {
            const escrowTx = this.escrow.settleInstantUse(
                listingId,
                buyerWalletAddress,
                listing.tenantId,
                tier.priceCredits,
            );

            if (!escrowTx) {
                throw new InsufficientCreditsError(listingId, tier.priceCredits);
            }

            // Record tier-specific transaction reference for rate limiting
            this.db.query(`
                INSERT INTO credit_transactions
                    (wallet_address, type, amount, balance_after, reference)
                VALUES (?, 'tier_use_tracking', 0, 0, ?)
            `).run(buyerWalletAddress, `tier_use:${tierId}:${crypto.randomUUID()}`);

            // Increment use count
            this.db.query(
                "UPDATE marketplace_listings SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?",
            ).run(listingId);

            log.info('Tier-based paid use recorded', {
                listingId, tierId, buyer: buyerWalletAddress, credits: tier.priceCredits,
            });

            return { success: true, creditsDeducted: tier.priceCredits, escrowId: escrowTx.id };
        }

        // Free tier use
        this.db.query(
            "UPDATE marketplace_listings SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?",
        ).run(listingId);
        return { success: true, creditsDeducted: 0 };
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    /**
     * Sync listing.price_credits to the minimum tier price ("starting at").
     * If no tiers exist, leaves price_credits unchanged.
     */
    private syncListingPrice(listingId: string): void {
        const row = this.db.query(`
            SELECT MIN(price_credits) as min_price
            FROM marketplace_pricing_tiers
            WHERE listing_id = ?
        `).get(listingId) as { min_price: number | null };

        if (row.min_price !== null) {
            this.db.query(`
                UPDATE marketplace_listings
                SET price_credits = ?, updated_at = datetime('now')
                WHERE id = ?
            `).run(row.min_price, listingId);
        }
    }

    private updateListingRating(listingId: string): void {
        const stats = this.db.query(`
            SELECT COUNT(*) as count, COALESCE(AVG(rating), 0) as avg
            FROM marketplace_reviews WHERE listing_id = ?
        `).get(listingId) as { count: number; avg: number };

        this.db.query(`
            UPDATE marketplace_listings
            SET avg_rating = ?, review_count = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(
            Math.round(stats.avg * 100) / 100,
            stats.count,
            listingId,
        );
    }
}
