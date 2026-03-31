---
spec: index.spec.md
---

## User Stories

- As an agent developer, I want a single barrel import for all validation schemas so that route handlers do not need to know which sub-module defines each schema
- As an agent developer, I want Zod schemas for marketplace API inputs so that invalid requests are rejected with descriptive validation errors before reaching business logic
- As an external agent, I want listing creation to enforce required fields (agentId, name, description, category) so that the marketplace never contains incomplete entries

## Acceptance Criteria

- `server/lib/schemas/index.ts` re-exports all schemas from `./marketplace` without modification
- `CreateListingSchema` requires non-empty strings for `agentId`, `name`, `description`, and a valid `category` enum value
- `UpdateListingSchema` accepts an empty object (all fields optional) without error
- `CreateReviewSchema` enforces `rating` as an integer between 1 and 5 inclusive and requires a non-empty `comment`
- `RegisterFederationInstanceSchema` validates `url` with `z.string().url()` and requires a non-empty `name`
- `SubscribeSchema` restricts `billingCycle` to the enum values `daily`, `weekly`, or `monthly`
- `CreateTierSchema` and `UpdateTierSchema` enforce `priceCredits` as a non-negative integer via `z.number().int().min(0)`
- `CancelSubscriptionSchema` requires a non-empty `subscriberTenantId`
- `StartTrialSchema` requires a non-empty `tenantId`
- All required string fields use `z.string().min(1)` to reject empty strings
- Parsing an input with an out-of-range rating (e.g., rating: 6) throws a Zod validation error

## Constraints

- All schemas use Zod as the sole validation library
- Schema definitions are pure data with no side effects and no database access
- Schemas must be importable from both `server/lib/schemas` (barrel) and `server/lib/schemas/marketplace` (direct)

## Out of Scope

- Schemas for non-marketplace API inputs (those are defined inline or in `server/lib/validation.ts`)
- Database-level constraint enforcement (handled by SQLite schema)
- Custom Zod error message formatting or internationalization
- OpenAPI schema generation from Zod definitions
