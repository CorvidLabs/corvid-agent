---
module: marketplace-service
version: 1
status: draft
files:
  - server/marketplace/service.ts
  - server/marketplace/types.ts
db_tables:
  - marketplace_listings
  - marketplace_reviews
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
| `MarketplaceService` | Listing CRUD, search, and review management |

#### MarketplaceService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createListing` | `(input: CreateListingInput)` | `MarketplaceListing` | Create a new listing (status: draft) |
| `getListing` | `(id: string)` | `MarketplaceListing \| null` | Get single listing by ID |
| `updateListing` | `(id: string, input: UpdateListingInput)` | `MarketplaceListing \| null` | Partial update; returns null if not found |
| `deleteListing` | `(id: string)` | `boolean` | Delete listing; returns true if deleted |
| `getListingsByAgent` | `(agentId: string)` | `MarketplaceListing[]` | All listings for an agent, ordered by updated_at DESC |
| `recordUse` | `(listingId: string)` | `void` | Increment use_count |
| `search` | `(params: MarketplaceSearchParams)` | `MarketplaceSearchResult` | Paginated search with filters (published only) |
| `createReview` | `(input: CreateReviewInput)` | `MarketplaceReview` | Create review and update listing aggregates |
| `getReview` | `(id: string)` | `MarketplaceReview \| null` | Get single review |
| `getReviewsForListing` | `(listingId: string)` | `MarketplaceReview[]` | All reviews for a listing, ordered by created_at DESC |
| `deleteReview` | `(id: string)` | `boolean` | Delete review and update listing aggregates |

### Exported Types (from `types.ts`)

| Type | Description |
|------|-------------|
| `ListingStatus` | `'draft' \| 'published' \| 'unlisted' \| 'suspended'` |
| `ListingCategory` | `'coding' \| 'research' \| 'writing' \| 'data' \| 'devops' \| 'security' \| 'general'` |
| `PricingModel` | `'free' \| 'per_use' \| 'subscription'` |
| `MarketplaceListing` | Full listing with aggregates (useCount, avgRating, reviewCount) |
| `MarketplaceReview` | Review with rating (1-5) and comment |
| `MarketplaceSearchParams` | Query, category, pricingModel, minRating, tags, limit, offset |
| `MarketplaceSearchResult` | Paginated result: listings, total, limit, offset |
| `FederatedInstance` | Remote instance record (url, name, status, listingCount) |
| `FederatedListing` | MarketplaceListing extended with sourceInstance |
| `CreateListingInput` | Input for createListing |
| `UpdateListingInput` | Partial input for updateListing |
| `CreateReviewInput` | Input for createReview |
| `ListingRecord` | Snake-case DB row for marketplace_listings |
| `ReviewRecord` | Snake-case DB row for marketplace_reviews |

## Invariants

1. New listings are always created with status `'draft'`.
2. Search only returns listings with status `'published'`.
3. Search results are ordered by `avg_rating DESC, use_count DESC`.
4. After any review create or delete, the parent listing's `avg_rating` and `review_count` are recalculated from the reviews table.
5. `avg_rating` is stored rounded to 2 decimal places.
6. Listing tags are stored as JSON arrays in the `tags` TEXT column.
7. `updateListing` only modifies columns present in the input; `updated_at` is always refreshed.
8. Default pagination: limit=20, offset=0.

## Behavioral Examples

### Scenario: Create and publish a listing

- **Given** agent A exists
- **When** `createListing({ agentId: A, name: 'Code Reviewer', category: 'coding' })` is called
- **Then** listing is created with status='draft', useCount=0, avgRating=0, reviewCount=0

### Scenario: Review updates listing aggregates

- **Given** listing L has 2 reviews with ratings [4, 5]
- **When** a new review with rating 3 is created
- **Then** listing L's avgRating = (4+5+3)/3 = 4.00, reviewCount = 3

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

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | Database queries |
| `server/lib/logger.ts` | `createLogger()` |

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

## Configuration

No environment variables. All configuration is via constructor parameters.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-21 | corvid-agent | Initial spec |
