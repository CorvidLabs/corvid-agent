/**
 * Marketplace routes — Listing CRUD, search, reviews, federation.
 */
import type { Database } from 'bun:sqlite';
import type { MarketplaceService } from '../marketplace/service';
import type { MarketplaceFederation } from '../marketplace/federation';
import type {
    ListingCategory,
    PricingModel,
} from '../marketplace/types';
import { json, badRequest, notFound, handleRouteError, safeNumParam } from '../lib/response';
import { parseBodyOrThrow, ValidationError, CreateListingSchema, UpdateListingSchema, CreateReviewSchema, RegisterFederationInstanceSchema } from '../lib/validation';

export function handleMarketplaceRoutes(
    req: Request,
    url: URL,
    _db: Database,
    marketplace?: MarketplaceService | null,
    federation?: MarketplaceFederation | null,
): Response | Promise<Response> | null {
    if (!marketplace) {
        // Only match marketplace paths, return null for non-marketplace paths
        if (!url.pathname.startsWith('/api/marketplace')) return null;
        return json({ error: 'Marketplace not available' }, 503);
    }

    const path = url.pathname;
    const method = req.method;

    // ─── Search ──────────────────────────────────────────────────────────────

    if (path === '/api/marketplace/search' && method === 'GET') {
        const query = url.searchParams.get('q') ?? undefined;
        const category = url.searchParams.get('category') as ListingCategory | undefined;
        const pricingModel = url.searchParams.get('pricing') as PricingModel | undefined;
        const minRatingParam = url.searchParams.get('minRating');
        const minRating = minRatingParam !== null ? safeNumParam(minRatingParam, 0) : undefined;
        const tags = url.searchParams.get('tags')?.split(',').filter(Boolean) ?? undefined;
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam !== null ? safeNumParam(limitParam, 50) : undefined;
        const offsetParam = url.searchParams.get('offset');
        const offset = offsetParam !== null ? safeNumParam(offsetParam, 0) : undefined;

        return json(marketplace.search({
            query, category, pricingModel, minRating, tags, limit, offset,
        }));
    }

    // ─── Listings CRUD ───────────────────────────────────────────────────────

    if (path === '/api/marketplace/listings' && method === 'GET') {
        const agentId = url.searchParams.get('agentId');
        if (agentId) {
            return json(marketplace.getListingsByAgent(agentId));
        }
        return json(marketplace.search({ limit: 100 }));
    }

    if (path === '/api/marketplace/listings' && method === 'POST') {
        return handleCreateListing(req, marketplace);
    }

    const listingMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)$/);
    if (listingMatch) {
        const id = listingMatch[1];

        if (method === 'GET') {
            const listing = marketplace.getListing(id);
            return listing ? json(listing) : notFound('Listing not found');
        }

        if (method === 'PUT') {
            return handleUpdateListing(req, id, marketplace);
        }

        if (method === 'DELETE') {
            const deleted = marketplace.deleteListing(id);
            return deleted ? json({ ok: true }) : notFound('Listing not found');
        }
    }

    // Record a use
    const useMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/use$/);
    if (useMatch && method === 'POST') {
        marketplace.recordUse(useMatch[1]);
        return json({ ok: true });
    }

    // ─── Reviews ─────────────────────────────────────────────────────────────

    const reviewsMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/reviews$/);
    if (reviewsMatch) {
        const listingId = reviewsMatch[1];

        if (method === 'GET') {
            return json(marketplace.getReviewsForListing(listingId));
        }

        if (method === 'POST') {
            return handleCreateReview(req, listingId, marketplace);
        }
    }

    const reviewDeleteMatch = path.match(/^\/api\/marketplace\/reviews\/([^/]+)$/);
    if (reviewDeleteMatch && method === 'DELETE') {
        const deleted = marketplace.deleteReview(reviewDeleteMatch[1]);
        return deleted ? json({ ok: true }) : notFound('Review not found');
    }

    // ─── Federation ──────────────────────────────────────────────────────────

    if (path === '/api/marketplace/federation/instances' && method === 'GET') {
        return json(federation?.listInstances() ?? []);
    }

    if (path === '/api/marketplace/federation/instances' && method === 'POST') {
        return handleRegisterInstance(req, federation);
    }

    if (path === '/api/marketplace/federation/sync' && method === 'POST') {
        return handleSyncAll(federation);
    }

    const instanceMatch = path.match(/^\/api\/marketplace\/federation\/instances\/(.+)$/);
    if (instanceMatch && method === 'DELETE') {
        const removed = federation?.removeInstance(decodeURIComponent(instanceMatch[1]));
        return removed ? json({ ok: true }) : notFound('Instance not found');
    }

    const federatedMatch = path.match(/^\/api\/marketplace\/federated$/);
    if (federatedMatch && method === 'GET') {
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        return json(federation?.getFederatedListings(limit) ?? []);
    }

    return null;
}

async function handleCreateListing(
    req: Request,
    marketplace: MarketplaceService,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, CreateListingSchema);
        const listing = marketplace.createListing(body);
        return json(listing, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.message);
        return handleRouteError(err);
    }
}

async function handleUpdateListing(
    req: Request,
    id: string,
    marketplace: MarketplaceService,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, UpdateListingSchema);
        const listing = marketplace.updateListing(id, body);
        return listing ? json(listing) : notFound('Listing not found');
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.message);
        return handleRouteError(err);
    }
}

async function handleCreateReview(
    req: Request,
    listingId: string,
    marketplace: MarketplaceService,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, CreateReviewSchema);
        const review = marketplace.createReview({
            ...body,
            listingId, // override any listingId in body with the URL param
        });
        return json(review, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.message);
        return handleRouteError(err);
    }
}

async function handleRegisterInstance(
    req: Request,
    federation?: MarketplaceFederation | null,
): Promise<Response> {
    if (!federation) return json({ error: 'Federation not available' }, 503);

    try {
        const body = await parseBodyOrThrow(req, RegisterFederationInstanceSchema);
        const instance = federation.registerInstance(body.url, body.name);
        return json(instance, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.message);
        return handleRouteError(err);
    }
}

async function handleSyncAll(
    federation?: MarketplaceFederation | null,
): Promise<Response> {
    if (!federation) return json({ error: 'Federation not available' }, 503);

    try {
        const result = await federation.syncAll();
        return json(result);
    } catch (err) {
        return handleRouteError(err);
    }
}
