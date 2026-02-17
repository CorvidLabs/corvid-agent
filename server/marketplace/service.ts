/**
 * MarketplaceService — Listing CRUD, FTS5 search, and credit consumption.
 *
 * Manages agent marketplace listings where agents can publish their
 * capabilities for discovery and invocation by other agents.
 */
import type { Database, SQLQueryBindings } from 'bun:sqlite';
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
} from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('Marketplace');

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

// ─── Service ─────────────────────────────────────────────────────────────────

export class MarketplaceService {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    // ─── Listings ────────────────────────────────────────────────────────────

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
     * Record a use of a listing (increment use count).
     */
    recordUse(listingId: string): void {
        this.db.query(
            "UPDATE marketplace_listings SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?",
        ).run(listingId);
    }

    // ─── Search ──────────────────────────────────────────────────────────────

    search(params: MarketplaceSearchParams): MarketplaceSearchResult {
        const limit = params.limit ?? 20;
        const offset = params.offset ?? 0;

        const conditions: string[] = ["status = 'published'"];
        const values: SQLQueryBindings[] = [];

        if (params.category) {
            conditions.push('category = ?');
            values.push(params.category);
        }

        if (params.pricingModel) {
            conditions.push('pricing_model = ?');
            values.push(params.pricingModel);
        }

        if (params.minRating !== undefined) {
            conditions.push('avg_rating >= ?');
            values.push(params.minRating);
        }

        if (params.tags && params.tags.length > 0) {
            // Match any of the provided tags (JSON array stored as string)
            const tagConditions = params.tags.map(() => "tags LIKE ?");
            conditions.push(`(${tagConditions.join(' OR ')})`);
            for (const tag of params.tags) {
                values.push(`%"${tag}"%`);
            }
        }

        // Full-text search on name + description
        if (params.query) {
            conditions.push('(name LIKE ? OR description LIKE ?)');
            const pattern = `%${params.query}%`;
            values.push(pattern, pattern);
        }

        const where = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        // Count total
        const countRow = this.db.query(
            `SELECT COUNT(*) as total FROM marketplace_listings ${where}`,
        ).get(...values) as { total: number };

        // Fetch page
        const rows = this.db.query(
            `SELECT * FROM marketplace_listings ${where}
             ORDER BY avg_rating DESC, use_count DESC
             LIMIT ? OFFSET ?`,
        ).all(...values, limit, offset) as ListingRecord[];

        return {
            listings: rows.map(recordToListing),
            total: countRow.total,
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

    // ─── Private ─────────────────────────────────────────────────────────────

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
