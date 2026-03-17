---
module: governance-tier
version: 1
status: active
files:
  - server/permissions/governance-tier.ts
db_tables:
  - permission_grants
depends_on:
  - specs/permissions/broker.spec.md
  - specs/middleware/auth.spec.md
---

# Governance Tier

## Purpose

Implements Layer 0 governance permission enforcement (Issue #1038). Defines the `PermissionTier` enum and the `requirePermissionTier` guard that gates all governance API actions. The tier system provides a four-level hierarchy (Guest, Agent, Operator, Owner) resolved from API roles, tenant roles, DB permission grants, or authentication status. This is the foundational tier check that runs before any governance operation executes. Layer 1 (on-chain) and Layer 2 (cross-agent delegation) are not implemented here.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveCallerTier` | `(context: RequestContext, db?: Database)` | `PermissionTier` | Resolve the governance PermissionTier for a caller. Resolution order: admin API key (Owner), tenant role mapping, DB grant lookup via wallet address, authenticated fallback (Agent), unauthenticated default (Guest) |
| `requirePermissionTier` | `(minTier: PermissionTier, db?: Database)` | `Guard` | Middleware guard factory that returns null (allow) if the caller meets or exceeds the required tier, or a 403 JSON response with `ERR_INSUFFICIENT_TIER` on denial. Logs all checks server-side |

### Exported Enums

| Enum | Description |
|------|-------------|
| `PermissionTier` | Permission tier hierarchy for governance API access: Guest (0), Agent (1), Operator (2), Owner (3). A caller must meet or exceed the minimum tier required for an action |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `PERMISSION_TIER_NAMES` | `Readonly<Record<PermissionTier, string>>` | Human-readable names for each tier: Guest, Agent, Operator, Owner. Used for server-side logging only — never exposed in client responses |
| `GOVERNANCE_ROUTE_TIERS` | `Readonly<Record<string, PermissionTier>>` | Documents the minimum PermissionTier required for each governance route (councils, proposals, voting). This is a documentation artifact — runtime enforcement is via `requirePermissionTier()` |

## Invariants

1. Tier resolution follows a strict priority order: admin API key > tenant role > DB grant > authenticated fallback > Guest default. The first match wins
2. The guard never exposes tier details in client response bodies — only a generic error code (`ERR_INSUFFICIENT_TIER`) is returned on denial
3. All tier checks are logged server-side with caller tier, required tier, path, method, and allow/deny outcome
4. DB grant lookup checks for active (non-revoked, non-expired) grants with `action = '*'` (Owner), `council:*` (Operator), or `council:manage` (Operator)
5. A caller with no role, no grants, and authenticated status defaults to Agent tier (not Guest)
6. The `GOVERNANCE_ROUTE_TIERS` constant is a documentation artifact only — it does not drive runtime enforcement

## Behavioral Examples

### Scenario: Admin API key grants Owner tier

- **Given** a request with `context.role = 'admin'` (set by authGuard when ADMIN_API_KEY matches)
- **When** `resolveCallerTier` is called
- **Then** it returns `PermissionTier.Owner`

### Scenario: Tenant role maps to tier

- **Given** a request with `context.tenantRole = 'operator'`
- **When** `resolveCallerTier` is called
- **Then** it returns `PermissionTier.Operator`

### Scenario: DB grant fallback

- **Given** a request with no role but `context.walletAddress` set, and a DB grant with `action = 'council:*'`
- **When** `resolveCallerTier` is called with a DB handle
- **Then** it returns `PermissionTier.Operator`

### Scenario: Guard denies insufficient tier

- **Given** a caller with Agent tier
- **When** `requirePermissionTier(PermissionTier.Operator)` is called
- **Then** a 403 response is returned with `{ error: 'ERR_INSUFFICIENT_TIER', code: 'GOVERNANCE_TIER_403' }`

### Scenario: Guard allows sufficient tier

- **Given** a caller with Owner tier
- **When** `requirePermissionTier(PermissionTier.Operator)` is called
- **Then** null is returned (request proceeds)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Caller tier below required minimum | Returns 403 JSON with `ERR_INSUFFICIENT_TIER` error code |
| Unknown tenant role string | Falls through to next resolution step (DB grant or authenticated fallback) |
| No DB handle provided for grant lookup | Skips grant-based resolution, uses authenticated/Guest fallback |
| Unauthenticated caller | Resolves to Guest tier (no governance write access) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` for structured tier check logging |
| `server/middleware/guards.ts` | `RequestContext` and `Guard` types |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/permissions/index.ts` | Re-exports all public symbols |
| `server/routes/councils.ts` | `requirePermissionTier` guard on council endpoints |
| `server/routes/proposals.ts` | `requirePermissionTier` guard on proposal endpoints |

## Database Tables

### permission_grants

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique grant identifier |
| agent_id | TEXT | NOT NULL | Agent or wallet address receiving the capability |
| action | TEXT | NOT NULL | Permission action string (e.g. `council:*`, `*`) |
| revoked_at | TEXT | DEFAULT NULL | Set when grant is revoked |
| expires_at | TEXT | DEFAULT NULL | Optional expiry timestamp (ISO 8601) |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | Grant creation timestamp |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-16 | corvid-agent | Initial spec — Layer 0 governance tier enforcement (#1038) |
