---
spec: billing.spec.md
sources:
  - server/billing/types.ts
  - server/billing/service.ts
  - server/billing/meter.ts
  - server/billing/stripe.ts
---

## Layout

The billing module lives in `server/billing/` with four files:

```
server/billing/
  types.ts    — All shared types: SubscriptionStatus, InvoiceStatus, Subscription, UsageRecord,
                Invoice, PricingTier, CREDIT_PRICING_TIERS, DB row shapes
  service.ts  — BillingService: subscription CRUD, usage accumulation, cost calculation, invoice management
  meter.ts    — UsageMeter: hourly metering loop, Stripe usage reporting, usage summary
  stripe.ts   — Stripe API client functions: createCustomer, createSubscription, createUsageRecord,
                verifyWebhookSignature
```

## Components

### BillingService (service.ts)
Stateless service class taking `db: Database` in constructor. All methods are synchronous SQLite operations except where noted. Key design decisions:
- Usage accumulates via upsert on `(tenant_id, period_start)` — idempotent multi-call within same period
- `updateSubscriptionStatus` has a guard: skips rows already in `canceled` state
- `cancelSubscription(atPeriodEnd=true)` only sets the flag; status remains `active`
- `calculateCost` uses tiered pricing with ceiling division per tier (monotonically non-decreasing)

### UsageMeter (meter.ts)
Runs an hourly `setInterval` loop calling `reportAll()`. The loop is idempotent (`start()` called twice has no effect). `reportAll()` queries for `reported = 0` records, submits each to Stripe via `createUsageRecord`, and marks successful ones `reported = 1`. Failed records stay unreported for retry on the next cycle.

### Stripe API Client (stripe.ts)
Thin wrapper around Stripe's REST API using raw `fetch`. All functions read `STRIPE_SECRET_KEY` from environment and throw `ExternalServiceError` if absent. `verifyWebhookSignature` implements HMAC-SHA256 with timing-safe comparison and 5-minute timestamp window to prevent replay attacks.

### Tiered Pricing (CREDIT_PRICING_TIERS)
Default tiers defined in `types.ts`:
- 0–10,000 credits: $1.00 per 1,000
- 10,001–100,000 credits: $0.80 per 1,000
- 100,001+ credits: $0.50 per 1,000

`calculateCost` iterates tiers in order, computes `ceil(creditsInTier / 1000) * pricePerThousand` for each, and sums them.

## Tokens

| Constant/Env Var | Default | Description |
|-----------------|---------|-------------|
| `STRIPE_SECRET_KEY` | (none) | Required for all Stripe API calls |
| `STRIPE_WEBHOOK_SECRET` | (none) | Required for webhook signature verification |
| `PORT` | `3000` | Used when constructing Stripe callback URLs |
| Webhook timestamp window | 300 seconds | Events older than this are rejected |
| Metering interval | 1 hour | How often UsageMeter calls `reportAll()` |
| Default invoice/usage history limit | 12 | Records returned by `getUsageHistory` and `getInvoicesForTenant` |

## Assets

### Database Tables
- `subscriptions` — tenant subscription records with Stripe subscription ID, plan, status, period bounds
- `usage_records` — per-period usage accumulation with `reported` flag for Stripe sync
- `invoices` — invoice records linked to Stripe invoice IDs

### External Services
- Stripe API (billing, subscriptions, usage records, invoices)
- Stripe Webhooks (subscription state changes, invoice payment events)

### Related Routes
- `server/routes/billing.ts` — HTTP endpoints for subscription management, usage queries, webhook handler
