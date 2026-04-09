---
module: marketplace
version: 1
status: draft
files:
  - server/db/marketplace.ts
db_tables:
  - marketplace_listings
  - marketplace_reviews
depends_on: []
---

# Marketplace (DB)

## Purpose
Provides low-level database access functions for marketplace listings and reviews, intended for routes or services that need direct DB access without going through the marketplace service layer.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getListingRecord` | `db: Database, id: string` | `ListingRecord \| null` | Fetches a single marketplace listing by ID |
| `listListingRecords` | `db: Database` | `ListingRecord[]` | Returns all marketplace listings ordered by updated_at descending |
| `deleteListingRecord` | `db: Database, id: string` | `boolean` | Deletes a listing by ID; returns true if a row was removed |
| `getReviewRecord` | `db: Database, id: string` | `ReviewRecord \| null` | Fetches a single review by ID |
| `listReviewsForListing` | `db: Database, listingId: string` | `ReviewRecord[]` | Returns all reviews for a given listing ordered by created_at descending |

### Exported Types
This module does not export its own types. It re-uses `ListingRecord` and `ReviewRecord` from `server/marketplace/types.ts`.

## Referenced Types (from `server/marketplace/types.ts`)

| Type | Description |
|------|-------------|
| `ListingRecord` | DB row shape for marketplace listings with snake_case columns |
| `ReviewRecord` | DB row shape for marketplace reviews with snake_case columns |

## Invariants
1. All functions operate on raw DB row shapes (`ListingRecord`, `ReviewRecord`) rather than camelCase domain types — no row-to-model mapping is performed.
2. `listListingRecords` returns all listings regardless of status (draft, published, unlisted, suspended).
3. `deleteListingRecord` does not cascade-delete associated reviews (that is the responsibility of DB foreign keys or the caller).
4. `listReviewsForListing` returns reviews in reverse chronological order (newest first).

## Behavioral Examples
### Scenario: Fetching a non-existent listing
- **Given** no listing with ID `"xyz"` exists
- **When** `getListingRecord(db, "xyz")` is called
- **Then** `null` is returned

### Scenario: Listing all marketplace records
- **Given** three listings exist with different `updated_at` timestamps
- **When** `listListingRecords(db)` is called
- **Then** all three are returned ordered by `updated_at` descending (most recently updated first)

### Scenario: Deleting a listing
- **Given** a listing with ID `"abc"` exists
- **When** `deleteListingRecord(db, "abc")` is called
- **Then** the listing is removed and `true` is returned

### Scenario: Listing reviews for a listing
- **Given** listing `"abc"` has 5 reviews
- **When** `listReviewsForListing(db, "abc")` is called
- **Then** all 5 reviews are returned ordered by `created_at` descending

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `getListingRecord` for non-existent ID | Returns `null` |
| `getReviewRecord` for non-existent ID | Returns `null` |
| `deleteListingRecord` for non-existent ID | Returns `false` |
| `listReviewsForListing` for listing with no reviews | Returns empty array `[]` |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all DB operations |
| `server/marketplace/types` | `ListingRecord`, `ReviewRecord` type definitions |

### Consumed By
| Module | What is used |
|--------|-------------|
| (No current consumers) | This module is available for routes needing direct DB access bypassing the marketplace service |

## Database Tables
### marketplace_listings
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Unique listing identifier |
| agent_id | TEXT | NOT NULL | ID of the agent being listed |
| name | TEXT | NOT NULL | Display name for the listing |
| description | TEXT | NOT NULL | Short description |
| long_description | TEXT | DEFAULT '' | Detailed README/docs in markdown |
| category | TEXT | NOT NULL | Category: coding, research, writing, data, devops, security, general |
| tags | TEXT | DEFAULT '[]' | JSON array of tag strings |
| pricing_model | TEXT | DEFAULT 'free' | Pricing model: free, per_use, subscription |
| price_credits | INTEGER | DEFAULT 0 | Credits per invocation (for per_use model) |
| instance_url | TEXT | DEFAULT NULL | Source instance URL for federation |
| status | TEXT | DEFAULT 'draft' | Listing status: draft, published, unlisted, suspended |
| use_count | INTEGER | DEFAULT 0 | Total number of invocations |
| avg_rating | REAL | DEFAULT 0 | Average rating (1-5 scale) |
| review_count | INTEGER | DEFAULT 0 | Total number of reviews |
| created_at | TEXT | DEFAULT (datetime('now')) | ISO 8601 creation timestamp |
| updated_at | TEXT | DEFAULT (datetime('now')) | ISO 8601 last-update timestamp |
| tenant_id | TEXT | NOT NULL DEFAULT 'default' | Multi-tenant isolation key (added in migration 55) |

#### Indexes
- `idx_marketplace_listings_agent` on `agent_id`
- `idx_marketplace_listings_status` on `status`
- `idx_marketplace_listings_category` on `category`
- `idx_marketplace_listings_tenant` on `tenant_id`

### marketplace_reviews
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Unique review identifier |
| listing_id | TEXT | NOT NULL | ID of the listing being reviewed |
| reviewer_agent_id | TEXT | DEFAULT NULL | Agent ID of the reviewer (if agent-submitted) |
| reviewer_address | TEXT | DEFAULT NULL | Algorand address of the reviewer (if wallet-based) |
| rating | INTEGER | NOT NULL | Rating from 1 to 5 |
| comment | TEXT | DEFAULT '' | Review text |
| created_at | TEXT | DEFAULT (datetime('now')) | ISO 8601 creation timestamp |

#### Indexes
- `idx_marketplace_reviews_listing` on `listing_id`

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
