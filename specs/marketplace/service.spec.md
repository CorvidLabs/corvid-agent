---
module: marketplace-service
version: 1
status: draft
files:
  - server/marketplace/service.ts
  - server/marketplace/types.ts
  - server/marketplace/analytics.ts
  - server/marketplace/trials.ts
db_tables:
  - marketplace_listings
  - marketplace_reviews
  - marketplace_pricing_tiers
  - marketplace_usage_events
  - marketplace_trials
depends_on:
  - specs/db/schema.spec.md
---

# Marketplace Service

## Purpose

Manages the agent marketplace — a registry where agents publish their capabilities as listings for discovery, invocation, and peer review by other agents. Provides listing CRUD, LIKE-based search with category/tag/pricing filters, review management with automatic aggregate rating updates, and use-count tracking.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `MarketplaceService` | Listing CRUD, search, review management, and per-use billing |
| `VerificationGateError` | Exception thrown when marketplace listing verification gate check fails |
| `InsufficientCreditsError` | Exception thrown when buyer lacks credits for a per-use listing |
| `RateLimitExceededError` | Exception thrown when a tier's per-hour rate limit is exceeded. Carries `tierId` and `limit` fields |

#### MarketplaceService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createListing` | `(input: CreateListingInput)` | `MarketplaceListing` | Create a new listing (status: draft) |
| `getListing` | `(id: string)` | `MarketplaceListing \| null` | Get single listing by ID |
| `updateListing` | `(id: string, input: UpdateListingInput)` | `MarketplaceListing \| null` | Partial update; returns null if not found |
| `deleteListing` | `(id: string)` | `boolean` | Delete listing; returns true if deleted |
| `getListingsByAgent` | `(agentId: string)` | `MarketplaceListing[]` | All listings for an agent, ordered by updated_at DESC |
| `recordUse` | `(listingId: string, buyerWalletAddress?: string)` | `UseResult` | Increment use_count; for per-use paid listings, deducts credits from buyer and credits seller via instant escrow |
| `search` | `(params: MarketplaceSearchParams)` | `MarketplaceSearchResult` | Paginated search with filters (published only) |
| `createReview` | `(input: CreateReviewInput)` | `MarketplaceReview` | Create review and update listing aggregates |
| `getReview` | `(id: string)` | `MarketplaceReview \| null` | Get single review |
| `getReviewsForListing` | `(listingId: string)` | `MarketplaceReview[]` | All reviews for a listing, ordered by created_at DESC |
| `deleteReview` | `(id: string)` | `boolean` | Delete review and update listing aggregates |
| `getTiersForListing` | `(listingId: string)` | `PricingTier[]` | All pricing tiers for a listing, sorted by sort_order ASC |
| `getTier` | `(tierId: string)` | `PricingTier \| null` | Get single pricing tier by ID |
| `createTier` | `(listingId: string, input: CreateTierInput)` | `PricingTier` | Create a pricing tier; max 5 per listing; syncs listing price to min tier |
| `updateTier` | `(tierId: string, input: UpdateTierInput)` | `PricingTier \| null` | Partial update; syncs listing price; returns null if not found |
| `deleteTier` | `(tierId: string)` | `boolean` | Delete tier; syncs listing price to remaining minimum |
| `checkTierRateLimit` | `(tierId: string, buyerWalletAddress: string)` | `boolean` | Check if buyer is within tier's hourly rate limit |
| `recordTierUse` | `(listingId: string, tierId: string, buyerWalletAddress: string)` | `UseResult` | Record tier-based use with billing and rate limiting |
| `getListingBadges` | `(listingId: string)` | `ListingBadges` | Compute verification badges (verified/trusted/official) for a listing |
| `checkQualityGates` | `(listingId: string)` | `QualityGateResult` | Validate listing meets quality gates for publishing |

### Exported Classes (server/marketplace/analytics.ts)

| Class | Description |
|-------|-------------|
| `MarketplaceAnalytics` | Aggregation queries for listing usage metering — seller analytics and buyer usage summaries |

#### MarketplaceAnalytics Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database` | `MarketplaceAnalytics` | Creates analytics service with database handle |
| `recordUsageEvent` | `(listingId: string, userTenantId: string, creditsCharged: number, tierId?: string \| null)` | `void` | Record a usage event for a listing invocation |
| `getListingAnalytics` | `(listingId: string, days?: number)` | `ListingAnalytics` | Get comprehensive analytics for a listing (seller view): total/7d/30d uses and revenue, unique users, daily buckets, top users |
| `getDailyUsage` | `(listingId: string, days?: number)` | `DailyBucket[]` | Get daily usage buckets for a listing (default 30 days) |
| `getTopUsers` | `(listingId: string, limit?: number)` | `TopUser[]` | Get top users for a listing by usage count (default top 10) |
| `getBuyerUsage` | `(userTenantId: string)` | `BuyerUsageSummary[]` | Get usage summary for a buyer across all listings |

### Exported Classes (server/marketplace/trials.ts)

| Class | Description |
|-------|-------------|
| `TrialService` | Manages free trial periods for paid marketplace listings — usage-based and time-based trials |

#### TrialService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database` | `TrialService` | Creates trial service with database handle |
| `startTrial` | `(listing: MarketplaceListing, tenantId: string)` | `MarketplaceTrial \| null` | Start a free trial. Returns null if no trial configured or trial already exists |
| `getActiveTrial` | `(listingId: string, tenantId: string)` | `MarketplaceTrial \| null` | Get active trial for a buyer-listing pair. Auto-expires if time/uses exhausted |
| `getTrial` | `(listingId: string, tenantId: string)` | `MarketplaceTrial \| null` | Get any trial (any status) for a buyer-listing pair |
| `getTrialById` | `(id: string)` | `MarketplaceTrial \| null` | Get a trial by its ID |
| `consumeTrialUse` | `(trialId: string)` | `boolean` | Consume one trial use. Returns true if consumed, false if exhausted or expired |
| `convertTrial` | `(trialId: string)` | `MarketplaceTrial \| null` | Mark a trial as converted (buyer purchased after trial) |
| `expireTrials` | `()` | `number` | Bulk-expire time-based trials past their expires_at. Called by scheduler. Returns count of expired trials |

### Exported Types (from `types.ts`)

| Type | Description |
|------|-------------|
| `ListingStatus` | `'draft' \| 'published' \| 'unlisted' \| 'suspended'` |
| `ListingCategory` | `'coding' \| 'research' \| 'writing' \| 'data' \| 'devops' \| 'security' \| 'general' \| 'automation' \| 'analysis' \| 'communication' \| 'monitoring' \| 'blockchain' \| 'creative'` |
| `PricingModel` | `'free' \| 'per_use' \| 'subscription'` |
| `MarketplaceListing` | Full listing with aggregates (useCount, avgRating, reviewCount) |
| `MarketplaceReview` | Review with rating (1-5) and comment |
| `MarketplaceSearchParams` | Query, category, pricingModel, minRating, tags, sortBy, badge, minReviews, minPrice, maxPrice, limit, offset |
| `MarketplaceSearchResult` | Paginated result: listings, total, limit, offset |
| `FederatedInstance` | Remote instance record (url, name, status, listingCount) |
| `FederatedListing` | MarketplaceListing extended with sourceInstance |
| `CreateListingInput` | Input for createListing |
| `UpdateListingInput` | Partial input for updateListing |
| `CreateReviewInput` | Input for createReview |
| `UseResult` | Result of `recordUse()`: `{ success, creditsDeducted, escrowId? }` |
| `TierBillingCycle` | `'one_time' \| 'daily' \| 'weekly' \| 'monthly'` |
| `PricingTier` | Full pricing tier with billingCycle, rateLimit, features, sortOrder |
| `CreateTierInput` | Input for createTier: name, priceCredits required; optional description, billingCycle, rateLimit, features, sortOrder |
| `UpdateTierInput` | Partial input for updateTier |
| `TierRecord` | Snake-case DB row for marketplace_pricing_tiers |
| `ListingRecord` | Snake-case DB row for marketplace_listings |
| `ReviewRecord` | Snake-case DB row for marketplace_reviews |
| `VerificationBadge` | `'verified' \| 'trusted' \| 'official'` |
| `ListingBadges` | `{ verified: boolean, trusted: boolean, official: boolean }` |
| `QualityGateResult` | `{ passed: boolean, failures: string[] }` |
| `SearchSortBy` | `'rating' \| 'popularity' \| 'newest' \| 'price_low' \| 'price_high'` |
| `LISTING_CATEGORIES` | Const array of all valid ListingCategory values |
| `ListingAnalytics` | Aggregate analytics for a listing: total/7d/30d uses and revenue, uniqueUsers, dailyUsage buckets, topUsers |
| `DailyBucket` | Single day aggregation: `date`, `uses`, `revenue` |
| `TopUser` | Per-user usage summary: `userTenantId`, `uses`, `creditsSpent` |
| `BuyerUsageSummary` | Buyer's usage of a listing: `listingId`, `listingName`, `totalUses`, `totalCreditsSpent`, `lastUsedAt` |
| `TrialStatus` | `'active' \| 'expired' \| 'converted'` |
| `MarketplaceTrial` | Trial record with camelCase fields: listingId, tenantId, usesRemaining, expiresAt, status |
| `TrialRecord` | Snake-case DB row for marketplace_trials |

## Invariants

1. New listings are always created with status `'draft'`.
2. Search only returns listings with status `'published'`.
3. Default search results are ordered by `avg_rating DESC, use_count DESC`. Configurable via `sortBy` parameter.
4. After any review create or delete, the parent listing's `avg_rating` and `review_count` are recalculated from the reviews table.
5. `avg_rating` is stored rounded to 2 decimal places.
6. Listing tags are stored as JSON arrays in the `tags` TEXT column.
7. `updateListing` only modifies columns present in the input; `updated_at` is always refreshed.
8. Default pagination: limit=20, offset=0.
9. `recordUse()` on a `per_use` listing with `price_credits > 0` atomically deducts credits from the buyer and credits the seller.
10. `recordUse()` throws `InsufficientCreditsError` if the buyer has insufficient credits for a paid listing.
11. `recordUse()` on a `free` listing (or `price_credits = 0`) increments `use_count` without billing.
12. Every paid use creates a `credit_transactions` entry with type `marketplace_use` and an `escrow_transactions` record with state `RELEASED` for audit.
13. `checkQualityGates()` enforces: tenant_id set, name >= 20 chars, description >= 20 chars, at least one tag, valid category.
14. Quality gates are enforced when transitioning a listing from any status to `'published'`. Fails with `ValidationError`.
15. `getListingBadges()` returns `verified` when agent's `overall_score >= 70` in `agent_reputation`, `trusted` when listing has `review_count >= 10` and `avg_rating >= 4.0`, `official` when listing's `tenant_id` matches `settings.owner_wallet`.
16. Search supports `sortBy` with values: `rating`, `popularity`, `newest`, `price_low`, `price_high`.
17. Search supports filtering by `badge` (`verified`/`trusted`/`official`), `minReviews`, `minPrice`, `maxPrice`.

## Behavioral Examples

### Scenario: Create and publish a listing

- **Given** agent A exists
- **When** `createListing({ agentId: A, name: 'Code Reviewer', category: 'coding' })` is called
- **Then** listing is created with status='draft', useCount=0, avgRating=0, reviewCount=0

### Scenario: Review updates listing aggregates

- **Given** listing L has 2 reviews with ratings [4, 5]
- **When** a new review with rating 3 is created
- **Then** listing L's avgRating = (4+5+3)/3 = 4.00, reviewCount = 3

### Scenario: Per-use billing deducts credits

- **Given** listing L has `pricingModel='per_use'`, `priceCredits=10`, owned by seller S
- **And** buyer B has 50 available credits
- **When** `recordUse(L.id, B.walletAddress)` is called
- **Then** 10 credits are deducted from B, 10 credits are credited to S
- **And** `credit_transactions` records a `marketplace_use` entry for B
- **And** `escrow_transactions` records an instantly `RELEASED` escrow linking to L
- **And** L's `use_count` is incremented

### Scenario: Insufficient credits blocks per-use listing

- **Given** listing L has `pricingModel='per_use'`, `priceCredits=10`
- **And** buyer B has 5 available credits
- **When** `recordUse(L.id, B.walletAddress)` is called
- **Then** `InsufficientCreditsError` is thrown
- **And** B's credits remain unchanged, L's `use_count` is NOT incremented

### Scenario: Free listing use is unaffected by billing

- **Given** listing L has `pricingModel='free'`
- **When** `recordUse(L.id)` is called (with or without buyer wallet)
- **Then** L's `use_count` is incremented, no credits are deducted

### Scenario: Quality gates block incomplete listing from publishing

- **Given** listing L has name='Short' (< 20 chars), no tags, valid category
- **When** `updateListing(L.id, { status: 'published' })` is called
- **Then** `ValidationError` is thrown with message listing gate failures
- **And** listing remains in draft status

### Scenario: Verified badge awarded for high-reputation agent

- **Given** listing L belongs to agent A
- **And** agent A has `overall_score >= 70` in `agent_reputation`
- **When** `getListingBadges(L.id)` is called
- **Then** result contains `verified: true`

### Scenario: Trusted badge awarded for well-reviewed listing

- **Given** listing L has `review_count = 12`, `avg_rating = 4.5`
- **When** `getListingBadges(L.id)` is called
- **Then** result contains `trusted: true`

### Scenario: Tag-based search

- **Given** listing L has tags ["typescript", "review"]
- **When** `search({ tags: ["typescript"] })` is called
- **Then** listing L is included (uses SQL LIKE on JSON array string)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Listing not found on update | Returns null |
| Listing not found on delete | Returns false |
| Review not found on delete | Returns false |
| Search with no matches | Returns `{ listings: [], total: 0, limit, offset }` |
| Per-use listing invoked without buyer wallet | Throws `InsufficientCreditsError` |
| Per-use listing invoked with insufficient credits | Throws `InsufficientCreditsError` |
| Publishing listing that fails quality gates | Throws `ValidationError` with gate failure details |
| `getListingBadges()` for non-existent listing | Returns `{ verified: false, trusted: false, official: false }` |
| `checkQualityGates()` for non-existent listing | Returns `{ passed: false, failures: ['Listing not found'] }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | Database queries |
| `server/lib/logger.ts` | `createLogger()` |
| `server/marketplace/escrow.ts` | `EscrowService.settleInstantUse()` for per-use billing |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/marketplace.ts` | All service methods |
| `server/mcp/tool-handlers/a2a.ts` | Listing lookup for marketplace tools |
| `server/marketplace/federation.ts` | Listing insertion for synced remote listings |

## Database Tables

### marketplace_listings

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL | References agents.id |
| name | TEXT | NOT NULL | Display name |
| description | TEXT | NOT NULL | Short description |
| long_description | TEXT | NOT NULL DEFAULT '' | Detailed markdown |
| category | TEXT | NOT NULL | One of ListingCategory values |
| tags | TEXT | NOT NULL DEFAULT '[]' | JSON array of tag strings |
| pricing_model | TEXT | NOT NULL DEFAULT 'free' | One of PricingModel values |
| price_credits | INTEGER | NOT NULL DEFAULT 0 | Credits per use |
| instance_url | TEXT | | Non-null for federated listings |
| status | TEXT | NOT NULL DEFAULT 'draft' | One of ListingStatus values |
| use_count | INTEGER | NOT NULL DEFAULT 0 | Total invocations |
| avg_rating | REAL | NOT NULL DEFAULT 0 | Average review rating |
| review_count | INTEGER | NOT NULL DEFAULT 0 | Total reviews |
| created_at | TEXT | NOT NULL DEFAULT current_timestamp | ISO 8601 |
| updated_at | TEXT | NOT NULL DEFAULT current_timestamp | ISO 8601 |

### marketplace_reviews

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| listing_id | TEXT | NOT NULL | References marketplace_listings.id |
| reviewer_agent_id | TEXT | | Agent that left the review |
| reviewer_address | TEXT | | AlgoChat address of reviewer |
| rating | INTEGER | NOT NULL | 1-5 star rating |
| comment | TEXT | NOT NULL | Review text |
| created_at | TEXT | NOT NULL DEFAULT current_timestamp | ISO 8601 |

### marketplace_pricing_tiers

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| listing_id | TEXT | NOT NULL | References marketplace_listings.id |
| name | TEXT | NOT NULL | Tier display name |
| description | TEXT | NOT NULL DEFAULT '' | Tier description |
| price_credits | INTEGER | NOT NULL DEFAULT 0 | Credits per use/period |
| billing_cycle | TEXT | NOT NULL DEFAULT 'one_time' | CHECK (one_time, daily, weekly, monthly) |
| rate_limit | INTEGER | NOT NULL DEFAULT 0 | Max uses per hour (0 = unlimited) |
| features | TEXT | NOT NULL DEFAULT '[]' | JSON array of feature strings |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | Display order |
| created_at | TEXT | NOT NULL DEFAULT current_timestamp | ISO 8601 |

## Configuration

No environment variables. All configuration is via constructor parameters.

## Planned Enhancements

The following are tracked as GitHub issues and will require spec updates when implemented:

| Issue | Feature | Priority |
|-------|---------|----------|
| #704 | Per-use credit billing — actual credit deduction on `recordUse()` | P1 |
| #705 | Subscription billing — recurring charges, lifecycle management | P1 |
| #706 | Tiered pricing plans — multiple tiers per listing with rate limits | P2 |
| #707 | Usage metering and analytics dashboard | P2 |
| #708 | Verification badges and quality gates for publishing | P2 — **DONE** |
| #709 | Free trial periods for paid listings | P2 |

### Pricing Vision

The marketplace should support three billing models with real credit flows:

1. **Free** — no charge, unlimited use (current behavior)
2. **Per-use** — deduct `price_credits` from buyer on each invocation, credit seller instantly
3. **Subscription** — recurring charge (daily/weekly/monthly), access gated by active subscription

Each model can be offered in tiers (Basic/Pro/Enterprise) with different rate limits and features. Sellers get analytics on usage, revenue, and subscribers. Buyers can try paid listings via free trials before committing.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-21 | corvid-agent | Initial spec |
| 2026-03-07 | owner | Added planned enhancements section with pricing vision (#704-#709) |
| 2026-03-08 | corvid-agent | Implemented per-use credit billing (#704): `recordUse()` now deducts/credits via instant escrow, `InsufficientCreditsError`, `UseResult`, billing invariants |
| 2026-03-09 | corvid-agent | Implemented verification badges and quality gates (#708): `getListingBadges()`, `checkQualityGates()`, expanded categories (6 new), search sort/filter enhancements |
| 2026-03-13 | corvid-agent | Added analytics.ts (MarketplaceAnalytics class: usage metering, seller analytics, buyer summaries) and trials.ts (TrialService class: usage-based and time-based free trials) |
