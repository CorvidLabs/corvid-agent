---
spec: tenant.spec.md
sources:
  - server/tenant/context.ts
  - server/tenant/db-filter.ts
  - server/tenant/middleware.ts
  - server/tenant/resolve.ts
  - server/tenant/types.ts
---

## Layout

Five-file module. Each file has a single responsibility:

```
server/tenant/
  types.ts       — Type definitions, DEFAULT_TENANT_ID, PLAN_LIMITS, TenantPlan, etc.
  db-filter.ts   — Row-level isolation helpers: withTenantFilter, tenantQuery, validateTenantOwnership, TENANT_SCOPED_TABLES, guard functions
  context.ts     — TenantService class (CRUD, plan management, capacity checks)
  middleware.ts  — HTTP-layer helpers: extractTenantId, registerApiKey, revokeApiKey, registerMemberByEmail, getMemberRoleByEmail
  resolve.ts     — WebSocket topic helpers: resolveAgentTenant, resolveCouncilTenant
```

## Components

### `types.ts`
Pure type layer. Exports:
- `DEFAULT_TENANT_ID = 'default'` — sentinel for single-tenant mode
- `PLAN_LIMITS` — maps each `TenantPlan` tier to `TenantLimits`; enterprise uses `-1` for unlimited
- `TenantPlan`, `TenantStatus`, `TenantRole`, `Tenant`, `TenantContext`, `TenantLimits`, `CreateTenantInput`, `TenantMember`, `TenantRecord`

### `db-filter.ts`
Row-level isolation for all DB queries. Key design:
- `TENANT_SCOPED_TABLES` — allowlist of tables with `tenant_id` column (18 tables)
- `withTenantFilter(query, tenantId)` — inserts `WHERE tenant_id = ?` (or `AND`) before `ORDER BY`/`LIMIT`/`GROUP BY`/`HAVING`, or at end. No-op for `DEFAULT_TENANT_ID`
- `tenantQuery` / `tenantQueryGet` — wrappers that apply `withTenantFilter` before executing
- `validateTenantOwnership(db, table, id, tenantId)` — validates `table` is in allowlist and `idColumn` matches `^[a-z_][a-z0-9_]*$`; returns `true` unconditionally for `DEFAULT_TENANT_ID`
- `enableMultiTenantGuard()` / `resetMultiTenantGuard()` — module-level boolean; when enabled, passing `DEFAULT_TENANT_ID` to filter/validate throws

### `context.ts` — `TenantService`
Handles tenant lifecycle:
- `resolveContext(tenantId?)` — in single-tenant mode returns enterprise limits regardless of input
- `createTenant` — UUID, plan-based limit seeding, DB insert
- `updatePlan` — recalculates all limits from `PLAN_LIMITS`
- `canCreateAgent` / `canStartSession` — count queries with `-1` shortcut for unlimited plans
- `recordToTenant` private helper — maps snake_case DB row to camelCase `Tenant` shape

### `middleware.ts`
HTTP request extraction and API key management:
- `extractTenantId(req, db, service)` — checks Bearer token (SHA-256 hash lookup in `api_keys`), then `X-Tenant-ID` header, then default. Returns 403 Response on key/header mismatch
- `registerApiKey` / `revokeApiKey` — store/delete SHA-256 hash; raw key never persisted
- `registerMemberByEmail` / `getMemberRoleByEmail` — deterministic key hash from email for RBAC

### `resolve.ts`
Lightweight helpers for WebSocket topic scoping:
- `resolveAgentTenant(db, agentId, multiTenant?)` — single DB query; returns `undefined` for single-tenant or default-tenant agents
- `resolveCouncilTenant(db, launchId, multiTenant?)` — joins `sessions` → `agents` via `council_launch_id`; returns first match's tenant or `undefined`

## Tokens

| Constant | Value | Notes |
|----------|-------|-------|
| `DEFAULT_TENANT_ID` | `'default'` | Sentinel for self-hosted mode |
| Enterprise `maxAgents` | `-1` | Unlimited |
| Enterprise `maxConcurrentSessions` | `-1` | Unlimited |
| `SAFE_IDENTIFIER` regex | `^[a-z_][a-z0-9_]*$` | SQL injection prevention for `idColumn` |

## Assets

### Database Tables
- `tenants` — id, name, slug, owner_email, stripe_customer_id, plan, max_agents, max_concurrent_sessions, sandbox_enabled, status, timestamps
- `api_keys` — key_hash, tenant_id, label, created_at

### Consumed By (18+ modules)
All DB access modules (`agents`, `sessions`, `projects`, `councils`, `webhooks`, `workflows`, `work-tasks`, `schedules`, `mention-polling`, `mcp-servers`) import `withTenantFilter`, `validateTenantOwnership`, and `DEFAULT_TENANT_ID`.
