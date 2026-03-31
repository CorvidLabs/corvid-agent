---
spec: billing.spec.md
---

## User Stories

- As an agent operator, I want a Stripe-backed subscription so that my agent's usage is billed on a recurring basis with proper invoicing.
- As an agent operator, I want tiered pricing that decreases per-unit cost at higher volumes so that heavy usage is more affordable.
- As a platform administrator, I want metered usage reported to Stripe hourly so that billing reflects actual consumption without manual intervention.
- As an agent operator, I want to view my current-period usage (credits, API calls, sessions) and cost breakdown so that I can monitor spending before the invoice arrives.
- As a platform administrator, I want Stripe webhook signature verification with timing-safe HMAC comparison and 5-minute replay window so that webhook endpoints are secure against tampering and replay attacks.
- As an agent operator, I want to monitor an Algorand wallet for incoming USDC transfers that automatically convert to internal credits so that I can fund my account with crypto.
- As a platform administrator, I want USDC revenue tracking per agent with auto-forwarding to the owner wallet so that collected payments are centralized and auditable.

## Acceptance Criteria

- `BillingService.createSubscription` always creates subscriptions with `status = 'active'`.
- `updateSubscriptionStatus` does not modify subscriptions with `status = 'canceled'`; canceled subscriptions are immutable.
- `cancelSubscription(tenantId, true)` sets `cancel_at_period_end = 1` but keeps status as `active`; `cancelSubscription(tenantId, false)` sets status to `canceled` immediately.
- `recordUsage` accumulates into the current period via upsert on the composite key `(tenant_id, period_start)`; multiple calls in the same period increment the existing record.
- `calculateCost` uses tiered pricing: $1.00/1K for 0-10K credits, $0.80/1K for 10K-100K, $0.50/1K for 100K+; uses ceiling division per tier.
- `UsageMeter.reportAll` submits unreported usage records to Stripe via `createUsageRecord`, marks them `reported = 1` on success, and counts failures separately.
- The `reported` flag on `usage_records` transitions from `0` to `1` only after successful Stripe API submission and is never reset (exactly-once reporting).
- `UsageMeter.start` is idempotent; calling it when already running has no effect.
- `verifyWebhookSignature` uses timing-safe HMAC-SHA256 comparison and rejects events with timestamps older than 300 seconds.
- All Stripe API calls throw `ExternalServiceError` if `STRIPE_SECRET_KEY` is not configured.
- `UsdcWatcher.poll` processes only incoming transfers with a positive amount and the correct ASA ID to the watched wallet; duplicate transaction IDs are skipped via `depositUsdc` idempotency.
- `createUsdcWatcher` returns `null` if wallet address, ASA ID, or indexer URL is missing; on non-mainnet without explicit `USDC_ASA_ID`, it returns `null`.
- `UsdcRevenueService` skips transfers originating from the owner wallet (fundings, not revenue) and auto-forwards collected USDC to the owner wallet every 60 seconds.
- Revenue recording is idempotent via UNIQUE `txid` constraint on `agent_usdc_revenue`; forward failures are retried on the next cycle.

## Constraints

- Stripe integration requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` environment variables; all Stripe operations fail gracefully without them.
- The USDC watcher poll timer is `unref`'d so it does not prevent process exit.
- On mainnet, the hardcoded USDC ASA ID (31566704) is used as a fallback if `USDC_ASA_ID` is not set.
- Usage period boundaries derive from the tenant's subscription; if no subscription exists, the current calendar month is used.
- The metering loop runs hourly; the USDC watcher polls every 30 seconds.
- Invoice payment marking is idempotent; calling `markInvoicePaid` twice on the same invoice re-sets `paid_at`.

## Out of Scope

- Stripe Checkout or hosted payment page integration.
- Multi-currency billing (all amounts are in USD cents or USDC).
- Credit purchase via credit card (Stripe handles subscription billing; USDC handles direct crypto deposits).
- Refund processing through Stripe (handled internally via the escrow system).
- Custom pricing plans or per-tenant pricing overrides beyond the tiered structure.
