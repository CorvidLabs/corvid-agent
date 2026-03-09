/**
 * Marketplace routes — Listing CRUD, search, reviews, federation, subscriptions.
 */
import type { Database } from 'bun:sqlite';
import { type MarketplaceService, VerificationGateError, InsufficientCreditsError, RateLimitExceededError } from '../marketplace/service';
import type { MarketplaceFederation } from '../marketplace/federation';
import { SubscriptionService } from '../marketplace/subscriptions';
import { TrialService } from '../marketplace/trials';
import type { SubscriptionStatus } from '../marketplace/subscriptions';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import type {
    ListingCategory,
    PricingModel,
    SearchSortBy,
    VerificationBadge,
} from '../marketplace/types';
import { json, badRequest, notFound, handleRouteError, safeNumParam } from '../lib/response';
import { parseBodyOrThrow, ValidationError, CreateListingSchema, UpdateListingSchema, CreateReviewSchema, RegisterFederationInstanceSchema, SubscribeSchema, CancelSubscriptionSchema, CreateTierSchema, UpdateTierSchema, TierUseSchema, TierSubscribeSchema, StartTrialSchema } from '../lib/validation';

export function handleMarketplaceRoutes(
    req: Request,
    url: URL,
    _db: Database,
    marketplace?: MarketplaceService | null,
    federation?: MarketplaceFederation | null,
    context?: RequestContext,
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

        const sortBy = url.searchParams.get('sortBy') as SearchSortBy | undefined;
        const badge = url.searchParams.get('badge') as VerificationBadge | undefined;
        const minReviewsParam = url.searchParams.get('minReviews');
        const minReviews = minReviewsParam !== null ? safeNumParam(minReviewsParam, 0) : undefined;
        const minPriceParam = url.searchParams.get('minPrice');
        const minPrice = minPriceParam !== null ? safeNumParam(minPriceParam, 0) : undefined;
        const maxPriceParam = url.searchParams.get('maxPrice');
        const maxPrice = maxPriceParam !== null ? safeNumParam(maxPriceParam, 0) : undefined;

        return json(marketplace.search({
            query, category, pricingModel, minRating, tags, limit, offset,
            sortBy, badge, minReviews, minPrice, maxPrice,
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
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
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
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleUpdateListing(req, id, marketplace);
        }

        if (method === 'DELETE') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            const deleted = marketplace.deleteListing(id);
            return deleted ? json({ ok: true }) : notFound('Listing not found');
        }
    }

    // ─── Badges & Quality Gates ────────────────────────────────────────────

    const badgesMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/badges$/);
    if (badgesMatch && method === 'GET') {
        const listing = marketplace.getListing(badgesMatch[1]);
        if (!listing) return notFound('Listing not found');
        return json(marketplace.getListingBadges(badgesMatch[1]));
    }

    const gatesMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/quality-gates$/);
    if (gatesMatch && method === 'GET') {
        const listing = marketplace.getListing(gatesMatch[1]);
        if (!listing) return notFound('Listing not found');
        return json(marketplace.checkQualityGates(gatesMatch[1]));
    }

    // Record a use (with per-use credit billing, trial-aware)
    const useMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/use$/);
    if (useMatch && method === 'POST') {
        try {
            const buyerWallet = context?.walletAddress ?? context?.tenantId;
            const listingId = useMatch[1];

            // Check for active trial before billing
            if (buyerWallet) {
                const trials = new TrialService(_db);
                const activeTrial = trials.getActiveTrial(listingId, buyerWallet);
                if (activeTrial) {
                    const consumed = trials.consumeTrialUse(activeTrial.id);
                    if (consumed) {
                        _db.query(
                            "UPDATE marketplace_listings SET use_count = use_count + 1, updated_at = datetime('now') WHERE id = ?",
                        ).run(listingId);
                        const updated = trials.getTrialById(activeTrial.id);
                        return json({ ok: true, creditsDeducted: 0, trial: true, trialUsesRemaining: updated?.usesRemaining ?? 0 });
                    }
                }
            }

            const result = marketplace.recordUse(listingId, buyerWallet);
            return json({ ok: true, creditsDeducted: result.creditsDeducted, escrowId: result.escrowId });
        } catch (err) {
            if (err instanceof InsufficientCreditsError) {
                return json({ error: 'Insufficient credits', required: err.required }, 402);
            }
            return handleRouteError(err);
        }
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
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        const deleted = marketplace.deleteReview(reviewDeleteMatch[1]);
        return deleted ? json({ ok: true }) : notFound('Review not found');
    }

    // ─── Federation ──────────────────────────────────────────────────────────

    if (path === '/api/marketplace/federation/instances' && method === 'GET') {
        return json(federation?.listInstances() ?? []);
    }

    if (path === '/api/marketplace/federation/instances' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('owner')(req, url, context);
            if (denied) return denied;
        }
        return handleRegisterInstance(req, federation);
    }

    if (path === '/api/marketplace/federation/sync' && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleSyncAll(federation);
    }

    const instanceMatch = path.match(/^\/api\/marketplace\/federation\/instances\/(.+)$/);
    if (instanceMatch && method === 'DELETE') {
        if (context) {
            const denied = tenantRoleGuard('owner')(req, url, context);
            if (denied) return denied;
        }
        const removed = federation?.removeInstance(decodeURIComponent(instanceMatch[1]));
        return removed ? json({ ok: true }) : notFound('Instance not found');
    }

    const federatedMatch = path.match(/^\/api\/marketplace\/federated$/);
    if (federatedMatch && method === 'GET') {
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        return json(federation?.getFederatedListings(limit) ?? []);
    }

    // ─── Subscriptions ───────────────────────────────────────────────────────

    const subscribeMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/subscribe$/);
    if (subscribeMatch && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleSubscribe(req, subscribeMatch[1], _db, marketplace);
    }

    const cancelSubMatch = path.match(/^\/api\/marketplace\/subscriptions\/([^/]+)\/cancel$/);
    if (cancelSubMatch && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleCancelSubscription(req, cancelSubMatch[1], _db);
    }

    if (path === '/api/marketplace/subscriptions' && method === 'GET') {
        const tenantId = url.searchParams.get('tenantId');
        if (!tenantId) return badRequest('tenantId query parameter is required');
        const status = url.searchParams.get('status') as SubscriptionStatus | null;
        const subs = new SubscriptionService(_db);
        return json(subs.getBySubscriber(tenantId, status ?? undefined));
    }

    const subscribersMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/subscribers$/);
    if (subscribersMatch && method === 'GET') {
        const subs = new SubscriptionService(_db);
        return json(subs.getSubscribers(subscribersMatch[1]));
    }

    // ─── Pricing Tiers ───────────────────────────────────────────────────

    const tiersMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/tiers$/);
    if (tiersMatch) {
        const listingId = tiersMatch[1];

        if (method === 'GET') {
            return json(marketplace.getTiersForListing(listingId));
        }

        if (method === 'POST') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleCreateTier(req, listingId, marketplace);
        }
    }

    const tierMatch = path.match(/^\/api\/marketplace\/tiers\/([^/]+)$/);
    if (tierMatch) {
        const tierId = tierMatch[1];

        if (method === 'GET') {
            const tier = marketplace.getTier(tierId);
            return tier ? json(tier) : notFound('Tier not found');
        }

        if (method === 'PUT') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            return handleUpdateTier(req, tierId, marketplace);
        }

        if (method === 'DELETE') {
            if (context) {
                const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
                if (denied) return denied;
            }
            const deleted = marketplace.deleteTier(tierId);
            return deleted ? json({ ok: true }) : notFound('Tier not found');
        }
    }

    // Tier-based use (per-use billing with specific tier)
    const tierUseMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/tier-use$/);
    if (tierUseMatch && method === 'POST') {
        return handleTierUse(req, tierUseMatch[1], marketplace, context);
    }

    // Tier-based subscribe (subscription billing with specific tier)
    const tierSubscribeMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/tier-subscribe$/);
    if (tierSubscribeMatch && method === 'POST') {
        if (context) {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
        }
        return handleTierSubscribe(req, tierSubscribeMatch[1], _db, marketplace);
    }


    // ─── Trials ───────────────────────────────────────────────────────────────

    const trialMatch = path.match(/^\/api\/marketplace\/listings\/([^/]+)\/trial$/);
    if (trialMatch) {
        const listingId = trialMatch[1];

        if (method === 'POST') {
            return handleStartTrial(req, listingId, _db, marketplace);
        }

        if (method === 'GET') {
            const tenantId = url.searchParams.get('tenantId');
            if (!tenantId) return badRequest('tenantId query parameter is required');
            const trials = new TrialService(_db);
            const trial = trials.getTrial(listingId, tenantId);
            return trial ? json(trial) : notFound('No trial found');
        }
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
        if (err instanceof ValidationError) return badRequest(err.detail);
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
        if (err instanceof ValidationError) return badRequest(err.detail);
        if (err instanceof VerificationGateError) {
            return json({ error: err.message, tier: err.tier, required: err.required }, 403);
        }
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
        if (err instanceof ValidationError) return badRequest(err.detail);
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
        if (err instanceof ValidationError) return badRequest(err.detail);
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

async function handleSubscribe(
    req: Request,
    listingId: string,
    db: Database,
    marketplace?: MarketplaceService | null,
): Promise<Response> {
    if (!marketplace) return json({ error: 'Marketplace not available' }, 503);

    const subscriptions = new SubscriptionService(db);

    try {
        const body = await parseBodyOrThrow(req, SubscribeSchema);

        // Validate listing exists and uses subscription pricing
        const listing = marketplace.getListing(listingId);
        if (!listing) return notFound('Listing not found');
        if (listing.pricingModel !== 'subscription') {
            return badRequest('Listing does not use subscription pricing');
        }

        // Check for existing active subscription
        if (subscriptions.hasActiveSubscription(listingId, body.subscriberTenantId)) {
            return badRequest('Already subscribed to this listing');
        }

        // If listing has trial_days and buyer hasn't trialled before, start a trial
        if (listing.trialDays) {
            const trials = new TrialService(db);
            const existingTrial = trials.getTrial(listingId, body.subscriberTenantId);
            if (!existingTrial) {
                const trial = trials.startTrial(listing, body.subscriberTenantId);
                if (trial) {
                    return json({ trial: true, ...trial }, 201);
                }
            }
        }

        const sub = subscriptions.subscribe(
            listingId,
            body.subscriberTenantId,
            listing.tenantId, // seller wallet for billing
            listing.priceCredits,
            body.billingCycle,
        );

        if (!sub) {
            return json({ error: 'Insufficient credits' }, 402);
        }

        return json(sub, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

async function handleCancelSubscription(
    req: Request,
    subscriptionId: string,
    db: Database,
): Promise<Response> {
    const subscriptions = new SubscriptionService(db);

    try {
        const body = await parseBodyOrThrow(req, CancelSubscriptionSchema);
        const sub = subscriptions.cancel(subscriptionId, body.subscriberTenantId);
        if (!sub) return notFound('Subscription not found or not owned by tenant');
        return json(sub);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

// ─── Pricing Tier Handlers ──────────────────────────────────────────────────

async function handleCreateTier(
    req: Request,
    listingId: string,
    marketplace: MarketplaceService,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, CreateTierSchema);
        const tier = marketplace.createTier(listingId, body);
        return json(tier, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

async function handleUpdateTier(
    req: Request,
    tierId: string,
    marketplace: MarketplaceService,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, UpdateTierSchema);
        const tier = marketplace.updateTier(tierId, body);
        return tier ? json(tier) : notFound('Tier not found');
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

async function handleTierUse(
    req: Request,
    listingId: string,
    marketplace: MarketplaceService,
    context?: RequestContext,
): Promise<Response> {
    try {
        const body = await parseBodyOrThrow(req, TierUseSchema);
        const buyerWallet = context?.walletAddress ?? context?.tenantId;
        if (!buyerWallet) return badRequest('Buyer wallet address required');

        const result = marketplace.recordTierUse(listingId, body.tierId, buyerWallet);
        if (!result.success) return notFound('Listing or tier not found');
        return json({ ok: true, creditsDeducted: result.creditsDeducted, escrowId: result.escrowId });
    } catch (err) {
        if (err instanceof InsufficientCreditsError) {
            return json({ error: 'Insufficient credits', required: err.required }, 402);
        }
        if (err instanceof RateLimitExceededError) {
            return json({ error: 'Rate limit exceeded', limit: err.limit }, 429);
        }
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}

async function handleTierSubscribe(
    req: Request,
    listingId: string,
    db: Database,
    marketplace: MarketplaceService,
): Promise<Response> {
    const subscriptions = new SubscriptionService(db);

    try {
        const body = await parseBodyOrThrow(req, TierSubscribeSchema);

        const listing = marketplace.getListing(listingId);
        if (!listing) return notFound('Listing not found');

        const tier = marketplace.getTier(body.tierId);
        if (!tier || tier.listingId !== listingId) return notFound('Tier not found for this listing');

        if (tier.billingCycle === 'one_time') {
            return badRequest('Tier uses one-time billing, not subscription. Use tier-use endpoint instead.');
        }

        // Check for existing active subscription
        if (subscriptions.hasActiveSubscription(listingId, body.subscriberTenantId)) {
            return badRequest('Already subscribed to this listing');
        }

        const sub = subscriptions.subscribe(
            listingId,
            body.subscriberTenantId,
            listing.tenantId,
            tier.priceCredits,
            tier.billingCycle as 'daily' | 'weekly' | 'monthly',
        );

        if (!sub) {
            return json({ error: 'Insufficient credits' }, 402);
        }

        return json(sub, 201);
    } catch (err) {
        if (err instanceof ValidationError) return badRequest(err.detail);
        return handleRouteError(err);
    }
}
