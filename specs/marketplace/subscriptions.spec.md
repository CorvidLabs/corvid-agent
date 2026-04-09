---
module: marketplace-subscriptions
version: 1
status: active
files:
  - server/marketplace/subscriptions.ts
  - server/scheduler/handlers/marketplace-billing.ts
db_tables:
  - marketplace_subscriptions
  - credit_ledger
  - credit_transactions
depends_on:
  - specs/db/operations/credits.spec.md
  - specs/marketplace/service.spec.md
---

# Marketplace Subscriptions

## Purpose

Recurring subscription billing for marketplace listings with `pricing_model: 'subscription'`. Manages the full subscription lifecycle: creation with immediate first charge, automated hourly renewals via scheduler, grace periods for insufficient funds, cancellation with access until period end, and expiry.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `BillingCycle` | Union: `'daily' \| 'weekly' \| 'monthly'` |
| `SubscriptionStatus` | Union: `'active' \| 'cancelled' \| 'expired' \| 'past_due'` |
| `MarketplaceSubscription` | Subscription record: id, listingId, subscriberTenantId, sellerTenantId, priceCredits, billingCycle, status, period timestamps, cancelledAt, createdAt |
| `GRACE_PERIOD_HOURS` | Constant: 48 hours |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `SubscriptionService` | class | — | Service managing marketplace subscription billing |
| `execMarketplaceBilling` | `(ctx: HandlerContext, executionId: string)` | `void` | Scheduler handler that processes marketplace subscription renewals, past_due expiries, and cancelled subscription expiries. |

### `SubscriptionService` Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `subscribe` | `(listingId, subscriberTenantId, sellerTenantId, priceCredits, billingCycle)` | `MarketplaceSubscription \| null` | Create subscription, charge first period. Returns null if insufficient funds. |
| `cancel` | `(subscriptionId, subscriberTenantId)` | `MarketplaceSubscription \| null` | Cancel subscription. Active until period end. Verifies subscriber ownership. |
| `hasActiveSubscription` | `(listingId, tenantId)` | `boolean` | Check if tenant has active/cancelled (not yet expired) subscription. |
| `processRenewals` | `()` | `{ renewed, pastDue, expired }` | Process all due renewals, expire past_due/cancelled subs. |
| `getSubscription` | `(id)` | `MarketplaceSubscription \| null` | Get single subscription by ID. |
| `getBySubscriber` | `(subscriberTenantId, status?)` | `MarketplaceSubscription[]` | List subscriptions for a tenant, optionally filtered by status. |
| `getSubscribers` | `(listingId)` | `MarketplaceSubscription[]` | List all subscribers for a listing (seller view). |

## State Machine

```
(subscribe) → active
active → cancelled (via cancel())
active → past_due (renewal fails, insufficient credits)
cancelled → expired (current_period_end reached)
past_due → active (renewal succeeds on next cycle)
past_due → expired (48h grace period exceeded)
```

## Invariants

1. **Atomic subscribe**: `subscribe()` uses `db.transaction()` with atomic `WHERE (credits - reserved) >= ?` guard — prevents double-charging.
2. **Immediate payment**: First billing period is charged immediately on subscribe; seller receives credits atomically.
3. **Subscriber ownership**: `cancel()` verifies `subscriberTenantId` matches before cancelling.
4. **Grace period**: `past_due` subscriptions get 48 hours before expiring. Successful renewal during grace resets to `active`.
5. **Cancel semantics**: Cancelled subscriptions remain accessible (hasActiveSubscription returns true) until `current_period_end`.
6. **Renewal atomicity**: Each renewal in `chargeRenewal()` is wrapped in a transaction — debit subscriber, credit seller, advance period.
7. **Audit trail**: All credit mutations write to `credit_transactions` and `recordAudit`.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/marketplace/listings/:id/subscribe` | operator/owner | Start subscription (validates listing uses subscription pricing) |
| POST | `/api/marketplace/subscriptions/:id/cancel` | operator/owner | Cancel subscription |
| GET | `/api/marketplace/subscriptions?tenantId=` | none | List subscriber's subscriptions |
| GET | `/api/marketplace/listings/:id/subscribers` | none | List subscribers for a listing (seller view) |

## Scheduler Integration

The `marketplace_billing` action type runs hourly via the scheduler to:
1. Expire cancelled subscriptions past their period end
2. Expire past_due subscriptions past the 48h grace period
3. Attempt renewal for active subscriptions whose current_period_end <= now

## Behavioral Examples

### Successful subscription flow
```
Given: subscriber has 100 credits, listing costs 10 credits/monthly
When: subscribe("listing-1", "subscriber", "seller", 10, "monthly")
Then: subscriber debited 10 credits, seller credited 10 credits, subscription active
When: 1 month passes and processRenewals() runs
Then: subscriber debited 10 more credits, seller credited 10, period advanced
```

### Insufficient funds on renewal
```
Given: subscriber has 5 credits, subscription costs 10 credits/monthly
When: processRenewals() runs and period has ended
Then: subscription status set to past_due
When: 48 hours pass and processRenewals() runs again
Then: subscription status set to expired
```

### Cancel flow
```
Given: active subscription with 15 days remaining in period
When: cancel(subscriptionId, "subscriber")
Then: status = cancelled, cancelledAt set, hasActiveSubscription still true
When: current_period_end passes and processRenewals() runs
Then: status = expired, hasActiveSubscription returns false
```

## Error Cases

| Scenario | Behavior |
|----------|----------|
| Subscriber has insufficient credits | `subscribe()` returns `null`, no subscription created |
| Wrong tenant calls `cancel` | Returns `null`, no state change |
| Cancel on expired subscription | Returns `null` |
| Listing not found (route level) | 404 response |
| Listing not subscription-priced (route level) | 400 response |
| Already subscribed (route level) | 400 response |

## Dependencies

| Dependency | Usage |
|------------|-------|
| `server/db/credits.ts` | `getBalance()` for post-mutation balance snapshots |
| `server/db/audit.ts` | `recordAudit()` for audit trail |
| `server/marketplace/service.ts` | `getListing()` for listing validation in route handler |

## Change Log

- v1: Initial implementation — subscription lifecycle, billing, scheduler integration.
