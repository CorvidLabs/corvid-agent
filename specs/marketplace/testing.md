---
spec: service.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/marketplace-service.test.ts` | Unit | Listing CRUD, search filters, review aggregate recalculation, per-use billing, quality gates, verification badges |
| `server/__tests__/marketplace-analytics.test.ts` | Unit | Usage event recording, daily bucket aggregation, top-users query, buyer usage summaries |
| `server/__tests__/marketplace-pricing-tiers.test.ts` | Unit | Tier CRUD, max-5 enforcement, listing price sync on tier changes |
| `server/__tests__/marketplace-trials.test.ts` | Unit | Trial start/consume/convert/expire lifecycle, auto-expiry on access |
| `server/__tests__/marketplace-escrow.test.ts` | Unit | Instant escrow credit deduction and seller credit via `EscrowService` |
| `server/__tests__/marketplace-verification-gate.test.ts` | Unit | Quality gate failures (name length, description length, tags, category), badge logic |
| `server/__tests__/marketplace-federation.test.ts` | Unit | Federated listing sync and insertion |

## Manual Testing

- [ ] Create a listing with status `draft`, verify it does not appear in search results
- [ ] Publish a listing — confirm quality gate blocks incomplete listings (name < 20 chars)
- [ ] Publish a listing that passes quality gates — verify status transitions to `published`
- [ ] Invoke a free listing via `recordUse()` — verify `use_count` increments, no credits deducted
- [ ] Invoke a `per_use` paid listing with a buyer wallet that has sufficient credits — verify credits deducted from buyer and credited to seller, `credit_transactions` record created
- [ ] Invoke a `per_use` paid listing with insufficient buyer credits — verify `InsufficientCreditsError` is thrown and `use_count` is NOT incremented
- [ ] Create 3 reviews for a listing, delete one — verify `avg_rating` and `review_count` recompute correctly after each change
- [ ] Search with `sortBy: 'price_low'` and `sortBy: 'popularity'` — verify sort orders differ as expected
- [ ] Filter search by `badge: 'trusted'` — verify only listings with `review_count >= 10` and `avg_rating >= 4.0` appear
- [ ] Create 5 pricing tiers for a listing — verify a 6th `createTier()` call is rejected
- [ ] Start a trial for a paid listing, consume all uses — verify trial auto-expires on next `getActiveTrial()` call
- [ ] Run `expireTrials()` on a trial past its `expires_at` — verify status becomes `expired`

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `updateListing` on a non-existent ID | Returns `null` |
| `deleteListing` on a non-existent ID | Returns `false` |
| `search` with no matches | Returns `{ listings: [], total: 0, limit: 20, offset: 0 }` |
| `per_use` listing invoked without buyer wallet address | Throws `InsufficientCreditsError` |
| Review for a listing with 1 existing review deleted | `avg_rating` and `review_count` reset to 0 |
| `avg_rating` stored with more than 2 decimal places raw | Value is rounded to 2 decimal places in storage |
| `tags` field contains JSON with special characters | Stored as-is in TEXT column; LIKE search still works |
| Search with `minPrice=0` and `maxPrice=0` | Returns only free (price_credits=0) listings |
| `getListingBadges()` for a non-existent listing ID | Returns `{ verified: false, trusted: false, official: false }` |
| `checkQualityGates()` for a non-existent listing ID | Returns `{ passed: false, failures: ['Listing not found'] }` |
| Listing transitions to `published` with `description` exactly 20 chars | Quality gate passes (>= 20 is valid) |
| `createTier()` when listing already has 5 tiers | Rejected; listing price not changed |
| Trial `consumeTrialUse()` when `uses_remaining = 0` | Returns `false`; no decrement |
| `convertTrial()` on an already-expired trial | Returns `null` |
| Concurrent `recordUse()` calls for same paid listing | Each call is an independent SQLite write; use_count increments may interleave |
| `RateLimitExceededError` on `checkTierRateLimit()` | Carries `tierId` and `limit` fields in the thrown error |
