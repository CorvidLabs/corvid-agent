/**
 * Database operations for marketplace listings and reviews.
 * Used by routes that need direct DB access without going through the service.
 */
import type { Database } from 'bun:sqlite';
import type { ListingRecord, ReviewRecord } from '../marketplace/types';

export function getListingRecord(db: Database, id: string): ListingRecord | null {
    return db.query('SELECT * FROM marketplace_listings WHERE id = ?').get(id) as ListingRecord | null;
}

export function listListingRecords(db: Database): ListingRecord[] {
    return db.query('SELECT * FROM marketplace_listings ORDER BY updated_at DESC').all() as ListingRecord[];
}

export function deleteListingRecord(db: Database, id: string): boolean {
    const result = db.query('DELETE FROM marketplace_listings WHERE id = ?').run(id);
    return result.changes > 0;
}

export function getReviewRecord(db: Database, id: string): ReviewRecord | null {
    return db.query('SELECT * FROM marketplace_reviews WHERE id = ?').get(id) as ReviewRecord | null;
}

export function listReviewsForListing(db: Database, listingId: string): ReviewRecord[] {
    return db.query(
        'SELECT * FROM marketplace_reviews WHERE listing_id = ? ORDER BY created_at DESC',
    ).all(listingId) as ReviewRecord[];
}
