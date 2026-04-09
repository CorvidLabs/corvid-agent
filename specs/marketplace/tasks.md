---
spec: service.spec.md
---

## Active Tasks

- [ ] Grow the flock: federated marketplace listings — enable agents on different instances to discover and transact with each other (#1459)
- [ ] Add marketplace UI to the dashboard: browseable listing grid with search, filters, and rating display (#1623)
- [ ] Implement free trial consumption tracking UI so operators can see remaining trial uses per listing
- [ ] Add SSRF-hardened federation URL validation tests to prevent private network probing

## Completed Tasks

- [x] Listing lifecycle: draft -> published with quality gates (name >= 20 chars, description >= 20 chars, tags, category)
- [x] `recordUse` atomic credit debit/credit with `InsufficientCreditsError` guard
- [x] `EscrowService` with FUNDED -> DELIVERED -> RELEASED state machine and 72-hour auto-release
- [x] `SubscriptionService` with immediate charge, grace period, and cancellation semantics
- [x] `processRenewals` expiring past-due subscriptions after 48-hour grace period
- [x] `MarketplaceAnalytics` with 7d/30d usage, revenue, and top-user reporting
- [x] `TrialService` with configurable uses and expiry
- [x] Per-tier rate limiting via `checkTierRateLimit`
