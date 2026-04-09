---
spec: billing.spec.md
---

## Active Tasks

- [ ] v1.0.0-rc security and payment gating: enforce credit balance checks before session start on non-localhost deployments (#1689)
- [ ] Add billing dashboard view: current-period usage breakdown, credit balance, and cost projection (#1623)
- [ ] USDC deposit confirmation flow: notify operators via AlgoChat when a USDC transfer is detected and converted to credits
- [ ] Add Stripe webhook replay protection integration test covering the 300-second window

## Completed Tasks

- [x] `BillingService` with Stripe subscription create/update/cancel lifecycle
- [x] Tiered pricing: $1.00/1K (0-10K), $0.80/1K (10K-100K), $0.50/1K (100K+)
- [x] `UsageMeter` with hourly Stripe metered usage reporting and exactly-once `reported` flag
- [x] `verifyWebhookSignature` with timing-safe HMAC-SHA256 and 5-minute replay window
- [x] `UsdcWatcher` monitoring Algorand wallet for incoming USDC transfers with idempotent deposit recording
- [x] `UsdcRevenueService` auto-forwarding collected USDC to owner wallet every 60 seconds
