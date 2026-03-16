---
module: schemas-marketplace
version: 1
status: active
files:
  - server/lib/schemas/marketplace.ts
db_tables: []
depends_on: []
---

# Marketplace Schemas

## Purpose

Zod validation schemas for marketplace-related API inputs including listings, reviews, federation instances, subscriptions, pricing tiers, and trials. Extracted from validation.ts to keep schema definitions modular.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `CreateListingSchema` | `z.ZodObject` | Validates input for creating a marketplace listing (agentId, name, description, category required) |
| `UpdateListingSchema` | `z.ZodObject` | Validates partial updates to a listing (all fields optional) |
| `CreateReviewSchema` | `z.ZodObject` | Validates review creation (rating 1-5 required, comment required) |
| `RegisterFederationInstanceSchema` | `z.ZodObject` | Validates federation instance registration (url, name required) |
| `SubscribeSchema` | `z.ZodObject` | Validates subscription creation (subscriberTenantId, billingCycle required) |
| `CancelSubscriptionSchema` | `z.ZodObject` | Validates subscription cancellation (subscriberTenantId required) |
| `CreateTierSchema` | `z.ZodObject` | Validates pricing tier creation (name, priceCredits required) |
| `UpdateTierSchema` | `z.ZodObject` | Validates partial updates to a pricing tier (all fields optional) |
| `TierUseSchema` | `z.ZodObject` | Validates tier usage recording (tierId required) |
| `TierSubscribeSchema` | `z.ZodObject` | Validates tier subscription (tierId, subscriberTenantId required) |
| `StartTrialSchema` | `z.ZodObject` | Validates trial start (tenantId required) |

## Invariants

1. **Required fields reject empty strings**: All required string fields use `z.string().min(1)` to reject empty strings
2. **Rating bounded 1-5**: `CreateReviewSchema` enforces `rating` is an integer between 1 and 5 inclusive
3. **Non-negative credits**: `priceCredits` fields use `z.number().int().min(0)` to prevent negative values
4. **Valid URL required for federation**: `RegisterFederationInstanceSchema` validates `url` with `z.string().url()`
5. **Category enum enforced**: `CreateListingSchema` restricts `category` to a fixed set of valid values
6. **Billing cycle enum enforced**: `SubscribeSchema` restricts `billingCycle` to `daily`, `weekly`, or `monthly`

## Behavioral Examples

### Scenario: Creating a listing with missing required fields

- **Given** an input object missing `agentId`
- **When** parsed with `CreateListingSchema`
- **Then** Zod throws a validation error indicating agentId is required

### Scenario: Updating a listing with no fields

- **Given** an empty object `{}`
- **When** parsed with `UpdateListingSchema`
- **Then** parsing succeeds since all fields are optional

### Scenario: Rating out of bounds

- **Given** a review input with `rating: 6`
- **When** parsed with `CreateReviewSchema`
- **Then** Zod throws a validation error indicating rating must be at most 5

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Empty required string field | Zod validation error with descriptive message |
| Rating outside 1-5 range | Zod validation error |
| Negative priceCredits | Zod validation error |
| Invalid URL for federation | Zod validation error |
| Invalid category value | Zod validation error |
| Invalid billingCycle value | Zod validation error |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `zod` | Schema definition and validation |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/lib/validation.ts` | All exported schemas |
| `server/routes/marketplace.ts` | All exported schemas |
| `server/openapi/route-registry.ts` | All exported schemas |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | corvid-agent | Initial spec |
