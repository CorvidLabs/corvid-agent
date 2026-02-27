---
module: billing
version: 1
status: draft
files:
  - server/billing/types.ts
  - server/billing/service.ts
  - server/billing/meter.ts
  - server/billing/stripe.ts
db_tables:
  - subscriptions
  - usage_records
  - invoices
depends_on:
  - specs/db/credits.spec.md
---

# Billing

## Purpose

Usage-based billing system built on Stripe. Manages tenant subscriptions, tracks credit consumption per billing period, reports metered usage to Stripe, and calculates costs using tiered pricing. This module bridges the internal credit system with Stripe's subscription and invoicing APIs.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `SubscriptionStatus` | Union: `'active' \| 'past_due' \| 'canceled' \| 'trialing'` |
| `InvoiceStatus` | Union: `'draft' \| 'open' \| 'paid' \| 'void' \| 'uncollectible'` |
| `Subscription` | Tenant subscription with plan, status, period bounds, and cancel flag |
| `UsageRecord` | Period-based usage aggregation with credits, API calls, sessions, and storage |
| `Invoice` | Invoice with amount, currency, status, and payment timestamp |
| `PricingTier` | Tier definition: `upTo` (null = unlimited) and `pricePerThousandCents` |
| `CREDIT_PRICING_TIERS` | Default pricing tiers: $1.00/1K (0-10K), $0.80/1K (10K-100K), $0.50/1K (100K+) |
| `SubscriptionRecord` | DB row shape for subscriptions table |
| `UsageRecordRow` | DB row shape for usage_records table |
| `InvoiceRecord` | DB row shape for invoices table |

### Exported Classes

| Class | Description |
|-------|-------------|
| `BillingService` | Subscription management, usage tracking, cost calculation, and invoicing |
| `UsageMeter` | Periodic usage reporting to Stripe on an hourly interval |

#### BillingService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createSubscription` | `(tenantId, stripeSubscriptionId, plan, periodStart, periodEnd)` | `Subscription` | Create a new active subscription for a tenant |
| `getSubscription` | `(tenantId)` | `Subscription \| null` | Get the most recent subscription for a tenant |
| `updateSubscriptionStatus` | `(tenantId, status)` | `void` | Update status (only if current status is not `canceled`) |
| `cancelSubscription` | `(tenantId, atPeriodEnd?)` | `void` | Cancel at period end (flag) or immediately (set status to canceled) |
| `recordUsage` | `(tenantId, credits, apiCalls?, sessions?)` | `void` | Accumulate usage into the current billing period via upsert |
| `getCurrentUsage` | `(tenantId)` | `UsageRecord \| null` | Get usage record for the current billing period |
| `getUsageHistory` | `(tenantId, limit?)` | `UsageRecord[]` | Get recent usage records, newest first (default limit 12) |
| `calculateCost` | `(credits)` | `number` | Calculate cost in cents using tiered pricing |
| `createInvoice` | `(tenantId, stripeInvoiceId, amountCents, periodStart, periodEnd)` | `Invoice` | Create a new open invoice |
| `getInvoice` | `(id)` | `Invoice \| null` | Get an invoice by internal ID |
| `getInvoicesForTenant` | `(tenantId, limit?)` | `Invoice[]` | Get recent invoices for a tenant (default limit 12) |
| `markInvoicePaid` | `(stripeInvoiceId)` | `void` | Mark an invoice as paid (sets `paid_at` to now) |

#### UsageMeter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Start the hourly metering loop (idempotent) |
| `stop` | `()` | `void` | Stop the metering loop |
| `reportAll` | `()` | `Promise<{ reported, failed }>` | Report all unreported usage records to Stripe |
| `getUsageSummary` | `(tenantId)` | `{ currentPeriodCredits, currentPeriodCost, totalCreditsAllTime }` | Get aggregate usage dashboard stats |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createCustomer` | `(email, name, metadata?)` | `Promise<StripeCustomer>` | Create a Stripe customer |
| `getCustomer` | `(customerId)` | `Promise<StripeCustomer>` | Get a Stripe customer by ID |
| `createSubscription` | `(customerId, priceId)` | `Promise<StripeSubscription>` | Create a Stripe subscription |
| `cancelSubscription` | `(subscriptionId, atPeriodEnd?)` | `Promise<StripeSubscription>` | Cancel a Stripe subscription |
| `createUsageRecord` | `(subscriptionItemId, quantity, timestamp?)` | `Promise<{ id }>` | Report metered usage to Stripe |
| `verifyWebhookSignature` | `(payload, signature, secret)` | `Promise<{ type, data }>` | Verify Stripe webhook HMAC-SHA256 signature |
| `StripeCustomer` | -- | -- | Stripe customer response type |
| `StripeSubscription` | -- | -- | Stripe subscription response type |

## Invariants

1. **New subscriptions are always active**: `createSubscription` inserts with `status = 'active'`.
2. **Canceled subscriptions are immutable**: `updateSubscriptionStatus` skips rows where `status = 'canceled'` — a canceled subscription cannot transition to another state.
3. **Cancellation respects period boundary**: When `atPeriodEnd = true`, only the `cancel_at_period_end` flag is set; status stays `active` until Stripe triggers the actual cancelation.
4. **Usage accumulates via upsert**: `recordUsage` uses the composite key `(tenant_id, period_start)` — multiple calls in the same period increment the existing record rather than creating duplicates.
5. **Period boundaries derive from subscription**: If a subscription exists, its `currentPeriodStart`/`currentPeriodEnd` define the usage period; otherwise, the first/last day of the current month is used.
6. **Tiered cost calculation is monotonically increasing**: `calculateCost(n)` uses ceiling division per tier, so cost never decreases as credits increase.
7. **Invoice payment is idempotent**: `markInvoicePaid` updates by `stripe_invoice_id` — calling it twice on the same invoice simply re-sets `paid_at`.
8. **Usage reporting is exactly-once**: The `reported` flag on `usage_records` transitions from `0` to `1` only after successful Stripe API submission; the flag is never reset.
9. **Webhook signatures use timing-safe comparison**: HMAC verification uses constant-time comparison to prevent timing attacks.
10. **Webhook timestamps must be within 5 minutes**: Events older than 300 seconds are rejected to prevent replay attacks.
11. **Stripe API requires authentication**: All Stripe API calls throw `ExternalServiceError` if `STRIPE_SECRET_KEY` is not configured.
12. **Metering loop is idempotent**: Calling `start()` when already running has no effect; `stop()` when already stopped has no effect.

## Behavioral Examples

### Scenario: Create subscription and record usage

- **Given** a tenant with no existing subscription
- **When** `createSubscription(tenantId, 'sub_123', 'pro', '2026-02-01', '2026-03-01')` is called
- **Then** a new subscription is created with `status = 'active'`
- **When** `recordUsage(tenantId, 500, 10, 2)` is called twice
- **Then** the current period usage record shows `creditsUsed = 1000`, `apiCalls = 20`, `sessionCount = 4`

### Scenario: Cancel subscription at period end

- **Given** a tenant with an active subscription
- **When** `cancelSubscription(tenantId, true)` is called
- **Then** `cancelAtPeriodEnd` is `true` but `status` remains `'active'`

### Scenario: Cancel subscription immediately

- **Given** a tenant with an active subscription
- **When** `cancelSubscription(tenantId, false)` is called
- **Then** `status` is set to `'canceled'`

### Scenario: Tiered cost calculation

- **Given** the default pricing tiers
- **When** `calculateCost(15000)` is called
- **Then** cost = ceil(10000/1000)*100 + ceil(5000/1000)*80 = 1000 + 400 = 1400 cents ($14.00)

### Scenario: Webhook verification

- **Given** a valid Stripe webhook payload with correct HMAC signature and recent timestamp
- **When** `verifyWebhookSignature(payload, signature, secret)` is called
- **Then** the parsed event object is returned
- **When** the signature is tampered with
- **Then** `AuthenticationError` is thrown

### Scenario: Usage metering cycle

- **Given** unreported usage records for tenants with active subscriptions and subscription items
- **When** `reportAll()` runs
- **Then** each unreported record is submitted to Stripe via `createUsageRecord` and marked `reported = 1`
- **When** a Stripe API call fails for one record
- **Then** that record remains `reported = 0` and the count is reflected in `{ failed }`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `STRIPE_SECRET_KEY` not set | `ExternalServiceError('Stripe', 'STRIPE_SECRET_KEY is not configured')` |
| Stripe API returns non-2xx | `ExternalServiceError('Stripe', ...)` with error message from response |
| Invalid webhook signature format | `AuthenticationError('Invalid webhook signature format')` |
| Webhook HMAC mismatch | `AuthenticationError('Webhook signature verification failed')` |
| Webhook timestamp > 5 min old | `AuthenticationError('Webhook timestamp too old')` |
| No subscription item for usage report | Record skipped silently (logged at debug level) |
| Stripe usage report fails | Record stays unreported; error logged at warn level; included in `failed` count |
| Tenant has no subscription | Usage period defaults to current calendar month |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `server/lib/logger` | `createLogger` |
| `server/lib/errors` | `ExternalServiceError`, `AuthenticationError` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `BillingService`, `UsageMeter` initialization |
| `server/routes/billing.ts` | `BillingService`, `UsageMeter`, `verifyWebhookSignature` |
| `server/routes/index.ts` | `handleBillingRoutes` registration |

## Database Tables

### subscriptions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Unique identifier (UUID) |
| tenant_id | TEXT | NOT NULL | Owning tenant |
| stripe_subscription_id | TEXT | NOT NULL | Stripe subscription ID |
| plan | TEXT | NOT NULL | Plan name (e.g. 'pro') |
| status | TEXT | DEFAULT 'active' | Subscription status |
| current_period_start | TEXT | NOT NULL | Billing period start (ISO 8601) |
| current_period_end | TEXT | NOT NULL | Billing period end (ISO 8601) |
| cancel_at_period_end | INTEGER | DEFAULT 0 | Whether to cancel at period end |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification |

### usage_records

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Unique identifier (UUID) |
| tenant_id | TEXT | NOT NULL | Owning tenant |
| credits_used | INTEGER | DEFAULT 0 | Credits consumed in this period |
| api_calls | INTEGER | DEFAULT 0 | API calls in this period |
| session_count | INTEGER | DEFAULT 0 | Sessions in this period |
| storage_mb | REAL | DEFAULT 0 | Storage used in MB |
| period_start | TEXT | NOT NULL | Billing period start |
| period_end | TEXT | NOT NULL | Billing period end |
| reported | INTEGER | DEFAULT 0 | Whether reported to Stripe (0/1) |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

### invoices

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Unique identifier (UUID) |
| tenant_id | TEXT | NOT NULL | Owning tenant |
| stripe_invoice_id | TEXT | NOT NULL | Stripe invoice ID |
| amount_cents | INTEGER | NOT NULL | Invoice amount in cents |
| currency | TEXT | DEFAULT 'usd' | Currency code |
| status | TEXT | DEFAULT 'open' | Invoice status |
| period_start | TEXT | NOT NULL | Billing period start |
| period_end | TEXT | NOT NULL | Billing period end |
| paid_at | TEXT | DEFAULT NULL | When the invoice was paid |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `STRIPE_SECRET_KEY` | (none) | Stripe API secret key — required for all Stripe operations |
| `STRIPE_WEBHOOK_SECRET` | (none) | Secret for verifying Stripe webhook signatures |
| `PORT` | `3000` | Server port (used for Stripe webhook callback URL) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-26 | corvid-agent | Initial spec |
