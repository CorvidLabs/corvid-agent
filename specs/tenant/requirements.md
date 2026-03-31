---
spec: tenant.spec.md
---

## User Stories

- As a platform administrator, I want multi-tenant isolation so that each tenant's data is segregated at the database query level, preventing cross-tenant access.
- As an agent operator, I want a self-hosted single-tenant mode that works without tenant configuration so that I can run corvid-agent locally without multi-tenant overhead.
- As a platform administrator, I want plan-based resource limits (agents, sessions, credits, storage) so that tenants are constrained to their subscription tier.
- As a platform administrator, I want API key authentication with SHA-256 hashing so that tenant API keys are stored securely and never persisted in plaintext.
- As an agent developer, I want request-scoped tenant context extraction from API keys and headers so that every route handler knows which tenant it is serving.
- As a platform administrator, I want a multi-tenant guard that throws if `DEFAULT_TENANT_ID` is used in multi-tenant mode so that accidental cross-tenant data leakage is caught at runtime.
- As an agent developer, I want tenant resolution helpers (`resolveAgentTenant`, `resolveCouncilTenant`) that convert entity IDs to tenant IDs for WebSocket topic scoping so that events are broadcast only to the correct tenant.

## Acceptance Criteria

- `withTenantFilter` appends `WHERE tenant_id = ?` (or `AND tenant_id = ?`) to a SQL query in multi-tenant mode; it returns the query unchanged when `tenantId` is `DEFAULT_TENANT_ID`.
- When `enableMultiTenantGuard` is active, passing `DEFAULT_TENANT_ID` to `withTenantFilter` or `validateTenantOwnership` throws an `Error`.
- `validateTenantOwnership` only accepts table names present in `TENANT_SCOPED_TABLES` and `idColumn` values matching `^[a-z_][a-z0-9_]*$` to prevent SQL injection.
- `extractTenantId` returns a 403 Response with a JSON error body when the API key's tenant and the `X-Tenant-ID` header disagree.
- `registerApiKey` stores the SHA-256 hash of the key; `revokeApiKey` deletes by hash and returns `true` if a key was deleted.
- `TenantService.resolveContext` in single-tenant mode always returns `enterprise` plan with unlimited limits regardless of the provided `tenantId`.
- `TenantService.resolveContext` in multi-tenant mode returns `free` plan limits for unknown tenant IDs.
- `PLAN_LIMITS` uses `-1` to represent unlimited for the enterprise tier across maxAgents, maxConcurrentSessions, and maxCreditsPerMonth.
- `canCreateAgent` and `canStartSession` compare current resource counts against plan limits and return `false` for non-existent tenants.
- `createTenant` generates a UUID, inserts the tenant with plan-based limits from `PLAN_LIMITS`, and returns the created `Tenant`.
- `resolveAgentTenant` and `resolveCouncilTenant` return `undefined` (not null) when `multiTenant` is `false`, when the entity belongs to `DEFAULT_TENANT_ID`, or when the entity is not found.
- `resolveCouncilTenant` joins `sessions` -> `agents` via `council_launch_id` to resolve the tenant.

## Constraints

- Every database query against a tenant-scoped table must use `withTenantFilter`, `tenantQuery`, `tenantQueryGet`, or `validateTenantOwnership` to enforce row-level isolation.
- `TENANT_SCOPED_TABLES` is the single source of truth for which tables participate in tenant isolation.
- API keys are stored as SHA-256 hashes; the raw key is never persisted or logged.
- Plan limits are static in code (`PLAN_LIMITS` constant); runtime plan customization is not supported.
- The `tenants` and `api_keys` tables are the only tenant module-owned tables.

## Out of Scope

- Tenant provisioning UI or self-service signup flow.
- Per-tenant database isolation (all tenants share a single SQLite database with row-level filtering).
- OAuth or SSO integration for tenant authentication (API keys only).
- Tenant deletion or data purge workflows (suspended tenants remain in the database).
- Custom resource limits per tenant beyond the four plan tiers (free, starter, pro, enterprise).
- Billing or payment integration for plan upgrades (handled by the billing module).
