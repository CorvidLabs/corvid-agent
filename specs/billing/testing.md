---
spec: billing.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/billing-service.test.ts` | Unit | `createSubscription`, `getSubscription`, `updateSubscriptionStatus` (canceled guard), `cancelSubscription` (period-end vs. immediate), `recordUsage` (upsert accumulation), `calculateCost` (tiered pricing), `createInvoice`, `markInvoicePaid` (idempotent) |
| `server/__tests__/billing-meter.test.ts` | Unit | `UsageMeter.start/stop` (idempotent), `reportAll` (success path, partial failure path), `getUsageSummary` |
| `server/__tests__/billing-stripe.test.ts` | Unit | Stripe API functions with mocked fetch; `verifyWebhookSignature` (valid, tampered signature, expired timestamp) |
| `server/__tests__/routes-billing.test.ts` | Integration | HTTP endpoints: subscription routes, usage history, webhook handler |
| `server/__tests__/tenant-billing.test.ts` | Integration | Tenant-scoped billing operations, usage period derivation from subscription vs. calendar month |

## Manual Testing

- [ ] Set `STRIPE_SECRET_KEY` to a Stripe test mode key; call `createCustomer` and verify a customer is created in the Stripe test dashboard
- [ ] Call `recordUsage` twice for the same tenant/period and confirm the usage record shows accumulated totals (not two separate records)
- [ ] Call `calculateCost(15000)` and verify the result is 1400 cents per the spec example
- [ ] Start `UsageMeter` and create an unreported usage record; wait for the next hourly tick and confirm the record is marked `reported = 1`
- [ ] Send a Stripe test webhook with an invalid signature and confirm the endpoint returns 400
- [ ] Call `cancelSubscription(tenantId, true)` and verify `cancelAtPeriodEnd = true` but `status` remains `'active'`
- [ ] Call `cancelSubscription(tenantId, false)` on a `past_due` subscription and verify status becomes `'canceled'`
- [ ] Try `updateSubscriptionStatus` on a `canceled` subscription and confirm no change occurs

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `STRIPE_SECRET_KEY` not set | All Stripe functions throw `ExternalServiceError` |
| `markInvoicePaid` called twice on same invoice | Second call is a no-op (sets `paid_at` again to same value); no error |
| `recordUsage` called for tenant with no subscription | Usage period defaults to first/last day of current calendar month |
| `calculateCost(0)` | Returns 0 cents |
| `calculateCost(10000)` (exactly at tier boundary) | 10000/1000 * 100 = 1000 cents — no spillover to second tier |
| `calculateCost(10001)` (one past tier boundary) | 1000 + ceil(1/1000) * 80 = 1080 cents |
| Webhook payload has valid signature but timestamp 301 seconds old | `AuthenticationError('Webhook timestamp too old')` |
| Stripe usage report fails for one record in `reportAll` | Other records still processed; failed record stays `reported = 0`; `failed` count incremented |
| `UsageMeter.start()` called twice | Second call is no-op; only one interval timer running |
| Subscription record row missing `subscription_item_id` | Usage reporting skips that tenant silently (logged at debug) |
