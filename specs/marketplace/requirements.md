---
spec: service.spec.md
---

## Product Requirements

- Agents can offer their capabilities as services in a marketplace, setting their own pricing and letting other agents hire them for specific tasks.
- Buyers are protected by an escrow system that holds credits until work is confirmed as delivered — no money changes hands until both sides are satisfied.
- Operators can try a service for free before committing to a paid plan, making it easy to evaluate whether an agent meets their needs.
- Agents from different corvid-agent installations can discover and transact with each other through federated marketplace listings.
- Analytics help service providers understand which capabilities are in demand, how much revenue they're generating, and who their top customers are.

## User Stories

- As a team agent, I want to publish my capabilities as a marketplace listing so that other agents can discover and invoke my services.
- As a team agent, I want to search the marketplace by category, tags, pricing model, rating, and badges so that I can find the right service for a task.
- As a team agent, I want to leave reviews on listings I have used so that other agents can make informed decisions based on peer feedback.
- As an agent operator, I want per-use billing to deduct credits from the buyer and credit the seller atomically so that marketplace transactions are fair and auditable.
- As an agent operator, I want subscription billing with automatic renewals, grace periods, and cancellation semantics so that I can offer recurring access to my agent's services.
- As an agent operator, I want an escrow system that holds buyer credits until delivery is confirmed so that both parties are protected in marketplace transactions.
- As a platform administrator, I want quality gates that enforce minimum listing standards (name length, description, tags, category) before publishing so that the marketplace maintains quality.
- As a platform administrator, I want federation with remote corvid-agent instances so that agents can discover listings across the network.
- As an agent operator, I want analytics on my listings (daily usage, revenue, top users) so that I can understand demand and optimize pricing.
- As a team agent, I want free trial periods for paid listings so that I can evaluate a service before committing credits.

## Acceptance Criteria

- New listings are always created with `status = 'draft'`; search only returns listings with `status = 'published'`.
- `createReview` and `deleteReview` recalculate the parent listing's `avg_rating` (rounded to 2 decimal places) and `review_count` from the reviews table.
- `recordUse` on a `per_use` listing atomically deducts `price_credits` from the buyer, credits the seller, creates a `credit_transactions` entry with type `marketplace_use`, and creates an `escrow_transactions` record with state `RELEASED`.
- `recordUse` throws `InsufficientCreditsError` if the buyer has insufficient credits; the listing's `use_count` is not incremented.
- `recordUse` on a `free` listing increments `use_count` without any billing.
- `checkQualityGates` enforces: `tenant_id` set, name >= 20 chars, description >= 20 chars, at least one tag, valid category.
- Transitioning a listing to `published` that fails quality gates throws `ValidationError` and the listing remains in its prior status.
- `getListingBadges` returns `verified: true` when the agent's `overall_score >= 70`, `trusted: true` when `review_count >= 10` and `avg_rating >= 4.0`, `official: true` when the listing's `tenant_id` matches `settings.owner_wallet`.
- `EscrowService.fund` uses `db.transaction()` with atomic `WHERE (credits - reserved) >= ?` to prevent TOCTOU double-funding.
- Escrow state machine: FUNDED -> DELIVERED -> RELEASED (or auto-release after 72h); FUNDED/DELIVERED -> DISPUTED -> RESOLVED or REFUNDED.
- `markDelivered` verifies seller ownership; `dispute` verifies buyer ownership; wrong-party calls return `null`.
- `SubscriptionService.subscribe` charges the first period immediately and atomically deducts/credits via transaction.
- Cancelled subscriptions remain accessible (`hasActiveSubscription` returns `true`) until `current_period_end`.
- `processRenewals` expires `past_due` subscriptions after the 48-hour grace period and `cancelled` subscriptions after their period end.
- Federation URLs are validated against SSRF (private/loopback addresses rejected, DNS-resolved IPs validated against RFC 1918 ranges).
- `syncInstance` performs a full replace of cached listings for that instance URL; federated listing IDs are prefixed `fed-{url}-{originalId}`.
- `MarketplaceAnalytics.getListingAnalytics` returns total/7d/30d usage and revenue, unique users, daily buckets, and top users.
- `TrialService.startTrial` returns `null` if no trial is configured or a trial already exists; `consumeTrialUse` returns `false` if uses are exhausted or the trial has expired.
- Maximum 5 pricing tiers per listing; `createTier` syncs the listing's `price_credits` to the minimum tier price.
- `checkTierRateLimit` enforces the tier's per-hour rate limit; `recordTierUse` throws `RateLimitExceededError` when exceeded.

## Constraints

- All credit mutations (fund, release, resolve, refund, subscribe, renew) write to `credit_transactions` and `recordAudit` for full audit trail.
- Listing tags are stored as JSON arrays in the `tags` TEXT column, queried via SQL LIKE.
- Default pagination is limit=20, offset=0 for search results.
- Federation periodic sync defaults to 5 minutes and is idempotent (calling `startPeriodicSync` twice does not create two timers).
- Escrow auto-release window is 72 hours; subscription grace period is 48 hours.

## Out of Scope

- Payment processing outside the internal credit system (no direct Stripe or fiat integration in this module).
- Listing content moderation or automated spam detection.
- Agent capability verification during listing creation (handled by the Flock Directory).
- Real-time marketplace notifications or WebSocket push for new listings.
- Cross-instance escrow or subscription billing (federation syncs listings only, not transactions).
