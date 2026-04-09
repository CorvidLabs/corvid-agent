/**
 * MarketplaceAnalytics — Aggregation queries for listing usage metering.
 *
 * Provides seller analytics (per-listing usage, revenue, top users) and
 * buyer usage summaries (spend per listing).
 */
import type { Database } from 'bun:sqlite';
import type { BuyerUsageSummary, DailyBucket, ListingAnalytics, TopUser } from './types';

export class MarketplaceAnalytics {
  constructor(private db: Database) {}

  /**
   * Record a usage event for a listing invocation.
   */
  recordUsageEvent(listingId: string, userTenantId: string, creditsCharged: number, tierId?: string | null): void {
    const id = crypto.randomUUID();
    this.db
      .query(`
            INSERT INTO marketplace_usage_events
                (id, listing_id, user_tenant_id, tier_id, credits_charged)
            VALUES (?, ?, ?, ?, ?)
        `)
      .run(id, listingId, userTenantId, tierId ?? null, creditsCharged);
  }

  /**
   * Get comprehensive analytics for a listing (seller view).
   */
  getListingAnalytics(listingId: string, days: number = 30): ListingAnalytics {
    // Total uses (all time)
    const totalRow = this.db
      .query(`
            SELECT COUNT(*) as cnt FROM marketplace_usage_events WHERE listing_id = ?
        `)
      .get(listingId) as { cnt: number };

    // Uses in last 7 days
    const uses7dRow = this.db
      .query(`
            SELECT COUNT(*) as cnt FROM marketplace_usage_events
            WHERE listing_id = ? AND created_at >= datetime('now', '-7 days')
        `)
      .get(listingId) as { cnt: number };

    // Uses in last 30 days
    const uses30dRow = this.db
      .query(`
            SELECT COUNT(*) as cnt FROM marketplace_usage_events
            WHERE listing_id = ? AND created_at >= datetime('now', '-30 days')
        `)
      .get(listingId) as { cnt: number };

    // Revenue (all time, 7d, 30d)
    const revenueAll = this.db
      .query(`
            SELECT COALESCE(SUM(credits_charged), 0) as total FROM marketplace_usage_events
            WHERE listing_id = ?
        `)
      .get(listingId) as { total: number };

    const revenue7d = this.db
      .query(`
            SELECT COALESCE(SUM(credits_charged), 0) as total FROM marketplace_usage_events
            WHERE listing_id = ? AND created_at >= datetime('now', '-7 days')
        `)
      .get(listingId) as { total: number };

    const revenue30d = this.db
      .query(`
            SELECT COALESCE(SUM(credits_charged), 0) as total FROM marketplace_usage_events
            WHERE listing_id = ? AND created_at >= datetime('now', '-30 days')
        `)
      .get(listingId) as { total: number };

    // Unique users
    const uniqueRow = this.db
      .query(`
            SELECT COUNT(DISTINCT user_tenant_id) as cnt FROM marketplace_usage_events
            WHERE listing_id = ?
        `)
      .get(listingId) as { cnt: number };

    // Daily usage buckets
    const dailyUsage = this.getDailyUsage(listingId, days);

    // Top users (top 10)
    const topUsers = this.getTopUsers(listingId, 10);

    return {
      listingId,
      totalUses: totalRow.cnt,
      uses7d: uses7dRow.cnt,
      uses30d: uses30dRow.cnt,
      revenueAllTime: revenueAll.total,
      revenue7d: revenue7d.total,
      revenue30d: revenue30d.total,
      uniqueUsers: uniqueRow.cnt,
      dailyUsage,
      topUsers,
    };
  }

  /**
   * Get daily usage buckets for a listing.
   */
  getDailyUsage(listingId: string, days: number = 30): DailyBucket[] {
    const rows = this.db
      .query(`
            SELECT
                date(created_at) as date,
                COUNT(*) as uses,
                COALESCE(SUM(credits_charged), 0) as revenue
            FROM marketplace_usage_events
            WHERE listing_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY date(created_at)
            ORDER BY date ASC
        `)
      .all(listingId, days) as Array<{ date: string; uses: number; revenue: number }>;

    return rows;
  }

  /**
   * Get top users for a listing by usage count.
   */
  getTopUsers(listingId: string, limit: number = 10): TopUser[] {
    const rows = this.db
      .query(`
            SELECT
                user_tenant_id,
                COUNT(*) as uses,
                COALESCE(SUM(credits_charged), 0) as credits_spent
            FROM marketplace_usage_events
            WHERE listing_id = ?
            GROUP BY user_tenant_id
            ORDER BY uses DESC
            LIMIT ?
        `)
      .all(listingId, limit) as Array<{ user_tenant_id: string; uses: number; credits_spent: number }>;

    return rows.map((r) => ({
      userTenantId: r.user_tenant_id,
      uses: r.uses,
      creditsSpent: r.credits_spent,
    }));
  }

  /**
   * Get usage summary for a buyer across all listings (buyer view).
   */
  getBuyerUsage(userTenantId: string): BuyerUsageSummary[] {
    const rows = this.db
      .query(`
            SELECT
                e.listing_id,
                COALESCE(l.name, 'Unknown Listing') as listing_name,
                COUNT(*) as total_uses,
                COALESCE(SUM(e.credits_charged), 0) as total_credits_spent,
                MAX(e.created_at) as last_used_at
            FROM marketplace_usage_events e
            LEFT JOIN marketplace_listings l ON l.id = e.listing_id
            WHERE e.user_tenant_id = ?
            GROUP BY e.listing_id
            ORDER BY last_used_at DESC
        `)
      .all(userTenantId) as Array<{
      listing_id: string;
      listing_name: string;
      total_uses: number;
      total_credits_spent: number;
      last_used_at: string;
    }>;

    return rows.map((r) => ({
      listingId: r.listing_id,
      listingName: r.listing_name,
      totalUses: r.total_uses,
      totalCreditsSpent: r.total_credits_spent,
      lastUsedAt: r.last_used_at,
    }));
  }
}
