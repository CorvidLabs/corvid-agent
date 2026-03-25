---
module: schemas-index
version: 1
status: active
files:
  - server/lib/schemas/index.ts
db_tables: []
depends_on:
  - specs/lib/schemas/marketplace.spec.md
---

# Schemas Barrel Export

## Purpose

Barrel file that re-exports all schema modules from the schemas directory, providing a single import path for consumers.

## Public API

### Re-exported Symbols

| Symbol | Description |
|--------|-------------|
| `CreateListingSchema` | Re-export from `./marketplace` for listing creation validation |
| `UpdateListingSchema` | Re-export from `./marketplace` for listing update validation |
| `CreateReviewSchema` | Re-export from `./marketplace` for review creation validation |
| `RegisterFederationInstanceSchema` | Re-export from `./marketplace` for federation instance registration |
| `SubscribeSchema` | Re-export from `./marketplace` for subscription creation |
| `CancelSubscriptionSchema` | Re-export from `./marketplace` for subscription cancellation |
| `CreateTierSchema` | Re-export from `./marketplace` for pricing tier creation |
| `UpdateTierSchema` | Re-export from `./marketplace` for pricing tier updates |
| `TierUseSchema` | Re-export from `./marketplace` for metered tier usage events |
| `TierSubscribeSchema` | Re-export from `./marketplace` for tier subscription requests |
| `StartTrialSchema` | Re-export from `./marketplace` for trial start requests |

## Invariants

1. **Complete re-export**: All public exports from `./marketplace` are re-exported without modification

## Behavioral Examples

### Scenario: Importing schemas via barrel

- **Given** a consumer imports from `server/lib/schemas`
- **When** they reference `CreateListingSchema`
- **Then** they receive the same schema object as importing directly from `./marketplace`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| N/A | Barrel file only re-exports; no runtime error cases |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/schemas/marketplace.ts` | All exported schemas (re-exported) |

### Consumed By

| Module | What is used |
|--------|-------------|
| N/A | Consumers currently import directly from marketplace.ts |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | corvid-agent | Initial spec |
