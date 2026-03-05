---
module: tenant
version: 1
status: draft
files:
  - server/tenant/context.ts
  - server/tenant/db-filter.ts
  - server/tenant/middleware.ts
  - server/tenant/types.ts
db_tables:
  - tenants
  - api_keys
depends_on:
  - specs/db/connection.spec.md
  - specs/lib/infra.spec.md
---

# Tenant

## Purpose

Provides multi-tenant isolation for the corvid-agent platform, including tenant CRUD, plan management, row-level database filtering, request-scoped tenant context extraction, and RBAC types. In single-tenant (self-hosted) deployments, a default tenant ID ensures schema consistency without requiring tenant-aware configuration.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `enableMultiTenantGuard` | _(none)_ | `void` | Activates the runtime guard that throws if `withTenantFilter` or `validateTenantOwnership` are called with `DEFAULT_TENANT_ID`, preventing silent cross-tenant data access. |
| `resetMultiTenantGuard` | _(none)_ | `void` | Resets the multi-tenant guard to disabled state (for tests only). |
| `withTenantFilter` | `query: string, tenantId: string` | `{ query: string; bindings: SQLQueryBindings[] }` | Appends `WHERE tenant_id = ?` (or `AND tenant_id = ?`) to a SQL query. Returns the original query unchanged when `tenantId` is `DEFAULT_TENANT_ID`. |
| `tenantQuery<T>` | `db: Database, query: string, tenantId: string, ...params: SQLQueryBindings[]` | `T[]` | Executes a SELECT query with automatic tenant scoping, returning all matching rows. |
| `tenantQueryGet<T>` | `db: Database, query: string, tenantId: string, ...params: SQLQueryBindings[]` | `T \| null` | Executes a SELECT query with tenant scoping, returning a single row or null. |
| `validateTenantOwnership` | `db: Database, table: string, resourceId: string, tenantId: string, idColumn?: string` | `boolean` | Validates that a resource belongs to the given tenant. Throws if `table` is not in `TENANT_SCOPED_TABLES` or `idColumn` fails identifier validation. Returns `true` unconditionally for `DEFAULT_TENANT_ID`. |
| `extractTenantId` | `req: Request, db: Database, tenantService: TenantService` | `TenantContext \| Response` | Extracts tenant ID from a request using API key (Bearer token), X-Tenant-ID header, or default. Returns a 403 Response if API key tenant and header tenant disagree. |
| `registerApiKey` | `db: Database, tenantId: string, key: string, label?: string` | `void` | Registers (or replaces) an API key for a tenant by storing its SHA-256 hash. |
| `revokeApiKey` | `db: Database, key: string` | `boolean` | Revokes an API key by deleting its hash. Returns `true` if a key was deleted. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `DEFAULT_TENANT_ID` | `string` (`'default'`) | Sentinel tenant ID used for single-tenant / self-hosted deployments. |
| `PLAN_LIMITS` | `Record<TenantPlan, TenantLimits>` | Maps each plan tier to its resource limits (agents, sessions, credits, storage, feature flags). |
| `TENANT_SCOPED_TABLES` | `readonly string[]` | Allowlist of database tables that have a `tenant_id` column and support row-level tenant filtering. |

### Exported Types

| Type | Description |
|------|-------------|
| `Tenant` | Full tenant record with id, name, slug, ownerEmail, stripeCustomerId, plan, maxAgents, maxConcurrentSessions, sandboxEnabled, status, createdAt, updatedAt. |
| `TenantPlan` | Union type: `'free' \| 'starter' \| 'pro' \| 'enterprise'`. |
| `TenantStatus` | Union type: `'active' \| 'suspended' \| 'deleted'`. |
| `TenantLimits` | Resource limits for a plan: maxAgents, maxConcurrentSessions, maxCreditsPerMonth, maxStorageMb, sandboxEnabled, marketplaceEnabled, federationEnabled. |
| `CreateTenantInput` | Input shape for tenant creation: name, slug, ownerEmail, optional plan. |
| `TenantContext` | Request-scoped context: tenantId, plan, limits. |
| `TenantRole` | RBAC role union: `'owner' \| 'operator' \| 'viewer'`. |
| `TenantMember` | Tenant membership record: tenantId, keyHash, role, createdAt, updatedAt. |
| `TenantRecord` | Raw database row shape for the tenants table (snake_case columns). |

### Exported Classes

| Class | Description |
|-------|-------------|
| `TenantService` | Core service for tenant lifecycle management: resolving context, CRUD, plan updates, capacity checks. |

#### TenantService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, multiTenant?: boolean` | `TenantService` | Creates a new TenantService. `multiTenant` defaults to `false`. |
| `isMultiTenant` | _(none)_ | `boolean` | Returns whether the service is running in multi-tenant mode. |
| `resolveContext` | `tenantId?: string` | `TenantContext` | Resolves a tenant context. In single-tenant mode, always returns enterprise limits with `DEFAULT_TENANT_ID`. In multi-tenant mode, looks up the tenant and returns its plan limits (defaults to free if not found). |
| `createTenant` | `input: { name, slug, ownerEmail, plan? }` | `Tenant` | Creates a new tenant with a random UUID, inserts into the database with plan-based limits, and returns the created tenant. |
| `getTenant` | `id: string` | `Tenant \| null` | Retrieves a tenant by ID, or null if not found. |
| `getTenantBySlug` | `slug: string` | `Tenant \| null` | Retrieves a tenant by slug, or null if not found. |
| `listTenants` | _(none)_ | `Tenant[]` | Lists all tenants ordered by creation date descending. |
| `updatePlan` | `tenantId: string, plan: TenantPlan` | `Tenant \| null` | Updates a tenant's plan and recalculates resource limits accordingly. Returns the updated tenant or null. |
| `setStripeCustomerId` | `tenantId: string, customerId: string` | `void` | Sets the Stripe customer ID for a tenant. |
| `suspendTenant` | `tenantId: string` | `void` | Sets a tenant's status to `'suspended'`. |
| `canCreateAgent` | `tenantId: string` | `boolean` | Checks whether the tenant has capacity to create another agent (compares current count against `maxAgents`; -1 means unlimited). |
| `canStartSession` | `tenantId: string` | `boolean` | Checks whether the tenant has capacity to start another session (compares running/idle count against `maxConcurrentSessions`; -1 means unlimited). |

## Invariants

1. Every database query against a tenant-scoped table MUST use `withTenantFilter`, `tenantQuery`, `tenantQueryGet`, or `validateTenantOwnership` to enforce row-level isolation.
2. In single-tenant mode (`DEFAULT_TENANT_ID`), `withTenantFilter` is a no-op -- it returns the original query with no additional bindings.
3. When the multi-tenant guard is enabled, passing `DEFAULT_TENANT_ID` to `withTenantFilter` or `validateTenantOwnership` throws an error to prevent accidental cross-tenant leakage.
4. `validateTenantOwnership` only accepts table names present in `TENANT_SCOPED_TABLES` and `idColumn` values matching the `^[a-z_][a-z0-9_]*$` pattern (SQL injection prevention).
5. `extractTenantId` returns a 403 Response (not a TenantContext) when the API key tenant and X-Tenant-ID header tenant disagree.
6. API keys are stored as SHA-256 hashes; the raw key is never persisted.
7. `resolveContext` in single-tenant mode always returns `enterprise` plan with unlimited limits, regardless of any provided tenantId.
8. `PLAN_LIMITS` uses `-1` to represent unlimited for the enterprise tier.
9. `TENANT_SCOPED_TABLES` is the single source of truth for which tables participate in tenant isolation.

## Behavioral Examples

### Scenario: Single-tenant mode resolves default context
- **Given** TenantService is created with `multiTenant = false`
- **When** `resolveContext()` is called (with or without a tenantId)
- **Then** returns a TenantContext with `tenantId = 'default'`, `plan = 'enterprise'`, and unlimited limits

### Scenario: Multi-tenant tenant filter appends WHERE clause
- **Given** multi-tenant mode is active
- **When** `withTenantFilter('SELECT * FROM agents', 'tenant-123')` is called
- **Then** returns `{ query: 'SELECT * FROM agents WHERE tenant_id = ?', bindings: ['tenant-123'] }`

### Scenario: Tenant filter preserves existing WHERE and ORDER BY
- **Given** a query `SELECT * FROM sessions WHERE status = 'running' ORDER BY created_at`
- **When** `withTenantFilter(query, 'tenant-456')` is called
- **Then** returns query with `AND tenant_id = ?` inserted before `ORDER BY`

### Scenario: API key and header tenant mismatch
- **Given** a request with Bearer token mapping to tenant-A and X-Tenant-ID header set to tenant-B
- **When** `extractTenantId` is called
- **Then** returns a 403 Response with an error message about the mismatch

### Scenario: Multi-tenant guard prevents default tenant usage
- **Given** `enableMultiTenantGuard()` has been called
- **When** `withTenantFilter(query, 'default')` is called
- **Then** throws an Error indicating DEFAULT_TENANT_ID is not allowed

### Scenario: Capacity check with unlimited plan
- **Given** a tenant on the enterprise plan (maxAgents = -1)
- **When** `canCreateAgent(tenantId)` is called
- **Then** returns `true` regardless of current agent count

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `validateTenantOwnership` called with table not in `TENANT_SCOPED_TABLES` | Throws `Error` with message identifying the invalid table |
| `validateTenantOwnership` called with `idColumn` failing identifier regex | Throws `Error` with message identifying the invalid idColumn |
| `withTenantFilter` called with `DEFAULT_TENANT_ID` while multi-tenant guard is enabled | Throws `Error` indicating default tenant is not allowed |
| `validateTenantOwnership` called with `DEFAULT_TENANT_ID` while multi-tenant guard is enabled | Throws `Error` indicating default tenant is not allowed |
| API key tenant and X-Tenant-ID header disagree | Returns 403 Response with JSON error body |
| `getTenant` called with non-existent ID | Returns `null` |
| `canCreateAgent` / `canStartSession` called with non-existent tenant | Returns `false` |
| `resolveContext` in multi-tenant mode with unknown tenantId | Returns context with `plan = 'free'` and free-tier limits |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `db` | `bun:sqlite` Database instance, `queryCount` helper from `server/db/types` |
| `lib` | `createLogger` from `server/lib/logger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `TenantService`, `enableMultiTenantGuard`, `extractTenantId`, `DEFAULT_TENANT_ID` |
| `server/routes/tenants.ts` | `TenantService`, `registerApiKey`, `TenantRole` |
| `server/routes/index.ts` | `TenantService` (type import) |
| `server/middleware/guards.ts` | `TenantService`, `TenantContext`, `TenantRole`, `DEFAULT_TENANT_ID`, `extractTenantId` |
| `server/db/sessions.ts` | `DEFAULT_TENANT_ID`, `withTenantFilter`, `validateTenantOwnership` |
| `server/db/agents.ts` | `DEFAULT_TENANT_ID`, `withTenantFilter`, `validateTenantOwnership` |
| `server/db/projects.ts` | `DEFAULT_TENANT_ID`, `withTenantFilter`, `validateTenantOwnership` |
| `server/db/councils.ts` | `DEFAULT_TENANT_ID`, `withTenantFilter`, `validateTenantOwnership` |
| `server/db/webhooks.ts` | `DEFAULT_TENANT_ID`, `withTenantFilter`, `validateTenantOwnership` |
| `server/db/workflows.ts` | `DEFAULT_TENANT_ID`, `withTenantFilter`, `validateTenantOwnership` |
| `server/db/work-tasks.ts` | `DEFAULT_TENANT_ID`, `withTenantFilter`, `validateTenantOwnership` |
| `server/db/schedules.ts` | `DEFAULT_TENANT_ID`, `withTenantFilter`, `validateTenantOwnership` |
| `server/db/mention-polling.ts` | `DEFAULT_TENANT_ID`, `withTenantFilter`, `validateTenantOwnership` |
| `server/db/mcp-servers.ts` | `DEFAULT_TENANT_ID`, `withTenantFilter`, `validateTenantOwnership` |
| `server/scheduler/service.ts` | `DEFAULT_TENANT_ID` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
