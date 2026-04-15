---
spec: service.spec.md
sources:
  - server/marketplace/service.ts
  - server/marketplace/types.ts
  - server/marketplace/analytics.ts
  - server/marketplace/trials.ts
---

## Module Structure

The marketplace module lives in `server/marketplace/` and is split into four focused files:

- **`service.ts`** — Core `MarketplaceService` class: listing CRUD, search, review management, per-use billing via instant escrow, pricing tiers, verification badges, and quality gates
- **`types.ts`** — All exported TypeScript types and interfaces (`MarketplaceListing`, `PricingTier`, `MarketplaceReview`, `UseResult`, etc.) and the `LISTING_CATEGORIES` constant array
- **`analytics.ts`** — `MarketplaceAnalytics` class: usage event recording and aggregation queries for seller dashboards and buyer usage summaries
- **`trials.ts`** — `TrialService` class: free trial lifecycle management (start, consume, convert, bulk-expire)

## Key Classes and Subsystems

### MarketplaceService
The central service class constructed with a `bun:sqlite` `Database` handle. All listing operations are synchronous SQLite queries (Bun's sqlite driver is synchronous). Billing via `recordUse()` delegates to `EscrowService.settleInstantUse()` for atomic credit deduction/credit operations. The `search()` method builds parameterized SQL dynamically based on the `MarketplaceSearchParams` input, supporting LIKE-based tag matching against the JSON array stored in the `tags` TEXT column.

**Quality gates** (`checkQualityGates`) enforce five criteria before a listing can be published: `tenant_id` set, `name >= 20` chars, `description >= 20` chars, at least one tag, and a valid `ListingCategory`. The transition to `published` status runs these gates automatically and throws `ValidationError` on failure.

**Verification badges** (`getListingBadges`) are computed on-demand by joining against `agent_reputation` (verified), reviewing aggregate columns on the listing itself (trusted: `review_count >= 10 && avg_rating >= 4.0`), and comparing `tenant_id` against `settings.owner_wallet` (official).

### MarketplaceAnalytics
Constructed with a `Database` handle. `recordUsageEvent()` inserts into `marketplace_usage_events`. Aggregate queries (`getListingAnalytics`, `getDailyUsage`, `getTopUsers`) use SQLite GROUP BY and strftime() for time bucketing. `getBuyerUsage()` returns cross-listing spending summaries for a buyer tenant.

### TrialService
Constructed with a `Database` handle. Trials are stored in `marketplace_trials` with `uses_remaining` and `expires_at` columns. `getActiveTrial()` auto-expires trials inline when accessed (updates status to `expired` when exhausted or past deadline). `expireTrials()` is called by the scheduler to bulk-expire time-based trials.

## Configuration Values and Constants

| Constant/Config | Value/Source | Description |
|-----------------|-------------|-------------|
| `LISTING_CATEGORIES` | `types.ts` | 13-element const array of valid `ListingCategory` values |
| `ListingStatus` values | `'draft' \| 'published' \| 'unlisted' \| 'suspended'` | New listings always start as `'draft'` |
| `PricingModel` values | `'free' \| 'per_use' \| 'subscription'` | Billing model for a listing |
| `TierBillingCycle` values | `'one_time' \| 'daily' \| 'weekly' \| 'monthly'` | Tier billing frequency |
| Max tiers per listing | 5 | `createTier()` enforces this limit |
| Default search pagination | limit=20, offset=0 | Applied when not specified in `MarketplaceSearchParams` |
| `avg_rating` precision | 2 decimal places | Stored rounded via SQLite ROUND() after recalculation |

## Related Resources

| Resource | Description |
|----------|-------------|
| `marketplace_listings` DB table | Primary listing store with aggregates (use_count, avg_rating, review_count) |
| `marketplace_reviews` DB table | Reviews linked to listings; drives aggregate recalculation on create/delete |
| `marketplace_pricing_tiers` DB table | Up to 5 tiers per listing; sort_order controls display order |
| `marketplace_usage_events` DB table | One row per invocation for analytics aggregation |
| `marketplace_trials` DB table | Free trial records with status, uses_remaining, expires_at |
| `server/marketplace/escrow.ts` | `EscrowService.settleInstantUse()` — atomic credit deduction and seller credit on per-use invocation |
| `server/routes/marketplace.ts` | HTTP API routes that consume all `MarketplaceService` methods |
| `server/mcp/tool-handlers/a2a.ts` | Consumes listing lookup for agent-to-agent marketplace tools |
