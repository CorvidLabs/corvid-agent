---
spec: index.spec.md
sources:
  - server/lib/schemas/index.ts
---

## Layout

Small sub-directory under `server/lib/schemas/`:
- `index.ts` — barrel file that re-exports all schemas from `./marketplace`
- `marketplace.ts` — Zod validation schemas specific to the marketplace feature domain

## Components

### index.ts (barrel re-export)
A pure re-export file with no logic. All 11 schemas from `./marketplace` are re-exported without modification, providing a stable single import path `server/lib/schemas` for any consumer.

Re-exported schemas:
- `CancelSubscriptionSchema`, `CreateListingSchema`, `CreateReviewSchema`, `CreateTierSchema`, `RegisterFederationInstanceSchema`, `StartTrialSchema`, `SubscribeSchema`, `TierSubscribeSchema`, `TierUseSchema`, `UpdateListingSchema`, `UpdateTierSchema`

### marketplace.ts
Marketplace-domain Zod schemas. Consumers currently import directly from `marketplace.ts`; the barrel was added to support future schema expansion without changing import paths.

## Tokens

No configuration, environment variables, or runtime constants. Pure schema definitions.

## Assets

No DB tables, no external services. The schemas in this module are used for HTTP request body validation in marketplace routes.
