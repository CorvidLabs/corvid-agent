---
spec: tenant.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/tenant-isolation.test.ts` | Integration (bun:test, in-memory SQLite with full migrations) | `withTenantFilter` WHERE/AND injection, `validateTenantOwnership` allowlist and identifier checks, `extractTenantId` API key resolution / header / mismatch 403, `registerApiKey` / `revokeApiKey`, `registerMemberByEmail` / `getMemberRoleByEmail`, multi-tenant guard (`enableMultiTenantGuard` / `resetMultiTenantGuard`), `DEFAULT_TENANT_ID` no-op filter, `TENANT_SCOPED_TABLES` completeness, cross-tenant data isolation across all 18 scoped tables |
| `server/__tests__/tenant-middleware.test.ts` | Unit (bun:test, minimal schema) | `extractTenantId` with Bearer token, X-Tenant-ID header, single-tenant bypass, key/header mismatch returns 403, `registerApiKey` hashes raw key, `revokeApiKey` returns true/false, `registerMemberByEmail` default role, `getMemberRoleByEmail` |
| `server/__tests__/tenant-billing.test.ts` | Integration (bun:test) | `TenantService.createTenant`, `updatePlan` limit recalculation, `canCreateAgent` with count vs limit, `canStartSession`, `-1` unlimited shortcut, `suspendTenant`, `setStripeCustomerId` |

## Manual Testing

- [ ] Start server in single-tenant mode — verify all requests resolve to `DEFAULT_TENANT_ID` with enterprise limits
- [ ] Create a tenant via `POST /api/tenants`, then create an API key — verify requests using that key resolve to the correct tenant
- [ ] Send a request with a Bearer token tenant and a mismatched `X-Tenant-ID` header — verify 403 response
- [ ] Update a tenant's plan via `PATCH /api/tenants/:id/plan` — verify `max_agents` and `max_concurrent_sessions` reflect the new plan
- [ ] Hit agent creation limit for a `free` plan tenant — verify `canCreateAgent` returns false
- [ ] Suspend a tenant — verify status changes to `suspended` in DB
- [ ] Call `PUT /api/settings/telegram` with a live server — verify dynamic config is applied without restart

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `withTenantFilter` with `DEFAULT_TENANT_ID` | Returns query unchanged; no bindings added |
| `withTenantFilter` with existing WHERE clause | Inserts `AND tenant_id = ?` before ORDER BY |
| `withTenantFilter` with no WHERE clause | Inserts `WHERE tenant_id = ?` at end or before ORDER BY |
| `enableMultiTenantGuard` then `withTenantFilter(q, 'default')` | Throws Error |
| `validateTenantOwnership` with table not in `TENANT_SCOPED_TABLES` | Throws Error |
| `validateTenantOwnership` with `idColumn = 'DROP TABLE x'` | Throws Error (regex rejects) |
| `validateTenantOwnership` with `DEFAULT_TENANT_ID` | Returns `true` unconditionally |
| `extractTenantId` with Bearer token and matching X-Tenant-ID header | Returns TenantContext |
| `extractTenantId` with Bearer token and mismatched X-Tenant-ID header | Returns 403 Response |
| `registerApiKey` — raw key stored? | Raw key never persisted; only SHA-256 hash |
| `revokeApiKey` for non-existent key | Returns `false` |
| `resolveContext` in single-tenant mode | Always returns enterprise limits; ignores tenantId arg |
| `resolveContext` in multi-tenant mode with unknown ID | Returns free-tier limits |
| `canCreateAgent` for enterprise plan (maxAgents = -1) | Returns `true` regardless of count |
| `canCreateAgent` for non-existent tenant | Returns `false` |
| `resolveAgentTenant` with `multiTenant = false` | Returns `undefined` immediately; no DB query |
| `resolveCouncilTenant` when launch has no sessions | Returns `undefined` |
