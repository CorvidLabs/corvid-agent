/**
 * Marketplace analytics routes — Seller analytics and buyer usage views.
 */
import type { Database } from 'bun:sqlite';
import { MarketplaceAnalytics } from '../marketplace/analytics';
import type { RequestContext } from '../middleware/guards';
import { json, badRequest, notFound, handleRouteError, safeNumParam } from '../lib/response';

export function handleMarketplaceAnalyticsRoutes(
    req: Request,
    url: URL,
    db: Database,
    _context?: RequestContext,
): Response | null {
    const path = url.pathname;
    const method = req.method;

    // ─── Seller Analytics ─────────────────────────────────────────────────────

    const analyticsMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/analytics$/);
    if (analyticsMatch && method === 'GET') {
        try {
            const listingId = analyticsMatch[1];
            const days = safeNumParam(url.searchParams.get('days'), 30);

            // Verify listing exists
            const listing = db.query('SELECT id, tenant_id FROM marketplace_listings WHERE id = ?')
                .get(listingId) as { id: string; tenant_id: string } | null;
            if (!listing) return notFound('Listing not found');

            const analytics = new MarketplaceAnalytics(db);
            return json(analytics.getListingAnalytics(listingId, days));
        } catch (err) {
            return handleRouteError(err);
        }
    }

    // ─── Buyer Usage ──────────────────────────────────────────────────────────

    if (path === '/api/marketplace/usage' && method === 'GET') {
        const tenantId = url.searchParams.get('tenantId');
        if (!tenantId) return badRequest('tenantId query parameter is required');

        try {
            const analytics = new MarketplaceAnalytics(db);
            return json(analytics.getBuyerUsage(tenantId));
        } catch (err) {
            return handleRouteError(err);
        }
    }

    return null;
}
