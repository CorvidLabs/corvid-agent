---
module: permission-broker
version: 1
status: active
files:
  - server/permissions/broker.ts
  - server/permissions/types.ts
  - server/permissions/index.ts
db_tables:
  - permission_grants
  - permission_checks
depends_on:
  - specs/db/audit.spec.md
---

# Permission Broker

## Purpose

Provides capability-based security for agent actions via HMAC-signed grants. The broker manages the full lifecycle of permission grants: creation with HMAC signatures, action-level checks with namespace wildcard support, expiration, revocation, and emergency revocation. Designed for <10ms permission checks. Stores a complete audit trail of all checks in the `permission_checks` table.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getRoleTemplate` | `(name: string)` | `RoleTemplate \| undefined` | Look up a role template by name (re-exported from `role-templates`) |
| `listRoleTemplates` | `()` | `readonly RoleTemplate[]` | List all available role templates (re-exported from `role-templates`) |
| `applyRoleTemplate` | `(db, agentId, templateName, grantedBy, opts?)` | `Promise<{...}>` | Apply a role template to an agent (re-exported from `role-templates`) |
| `revokeRoleTemplate` | `(db, agentId, templateName, revokedBy, opts?)` | `{...}` | Revoke all grants matching a role template (re-exported from `role-templates`) |
| `_resetHmacSecretForTesting` | `()` | `void` | Reset the cached HMAC secret (test-only helper to simulate server restarts) |
| `resolveCallerTier` | `(context: RequestContext, db?: Database)` | `PermissionTier` | Resolve governance PermissionTier for a caller based on API role, tenant role, DB grants, or auth status (re-exported from `governance-tier`) |
| `requirePermissionTier` | `(minTier: PermissionTier, db?: Database)` | `Guard` | Middleware guard factory that enforces a minimum PermissionTier for governance routes (re-exported from `governance-tier`) |

### Exported Types

| Type | Description |
|------|-------------|
| `PermissionNamespace` | Union of action namespace strings: `'git'`, `'msg'`, `'credits'`, `'schedule'`, `'workflow'`, `'work'`, `'search'`, `'agent'`, `'fs'`, `'repo'`, `'reputation'`, `'owner'` |
| `PermissionAction` | A permission action string: `"namespace:verb"`, `"namespace:*"`, or `"*"` |
| `PermissionGrant` | Stored grant record with id, agentId, action, grantedBy, reason, signature, expiresAt, revokedAt, revokedBy, tenantId, createdAt |
| `PermissionCheckResult` | Check result with allowed, grantId, reason, checkMs |
| `GrantOptions` | Options for creating a grant: agentId, action, grantedBy, reason?, expiresAt?, tenantId? |
| `RevokeOptions` | Options for revoking: grantId?, agentId?, action?, revokedBy, reason?, tenantId? |
| `RoleTemplate` | A role template with `name`, `description`, and `actions` (re-exported from `role-templates`) |

### Exported Enums

| Enum | Description |
|------|-------------|
| `PermissionTier` | Governance tier hierarchy: Guest (0), Agent (1), Operator (2), Owner (3). Callers must meet or exceed the minimum tier for an action (re-exported from `governance-tier`) |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `TOOL_ACTION_MAP` | `Record<string, PermissionAction>` | Maps MCP tool names (e.g. `corvid_github_create_pr`) to their required permission action (e.g. `git:create_pr`). Currently maps 30+ tools across 11 namespaces |
| `ROLE_TEMPLATES` | `readonly RoleTemplate[]` | Built-in role templates: owner, operator, viewer, developer, communicator (re-exported from `role-templates`) |
| `PERMISSION_TIER_NAMES` | `Readonly<Record<PermissionTier, string>>` | Human-readable names for each tier (server-side logging only) (re-exported from `governance-tier`) |
| `GOVERNANCE_ROUTE_TIERS` | `Readonly<Record<string, PermissionTier>>` | Documents the minimum PermissionTier required for each governance route (re-exported from `governance-tier`) |

### Exported Classes

| Class | Description |
|-------|-------------|
| `PermissionBroker` | Capability-based permission broker for agent actions. Manages HMAC-signed grants with namespace wildcard support |

#### PermissionBroker Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `checkTool` | `(agentId: string, toolName: string, opts?: { sessionId?: string; tenantId?: string })` | `Promise<PermissionCheckResult>` | Check whether an agent can use a specific MCP tool. Resolves tool name to action via `TOOL_ACTION_MAP`, checks grants, records audit trail. Tools with no mapping are allowed by default |
| `checkAction` | `(agentId: string, action: PermissionAction, tenantId?: string)` | `Promise<PermissionCheckResult>` | Check whether an agent has an active grant for a specific action. Matches exact action, namespace wildcard (`ns:*`), or superuser (`*`). Verifies HMAC signature integrity |
| `grant` | `(options: GrantOptions)` | `Promise<PermissionGrant>` | Create an HMAC-signed capability grant for an agent. Records audit event |
| `revoke` | `(options: RevokeOptions)` | `number` | Revoke a specific grant by ID, or all matching grants for agent+action. Returns count of affected rows |
| `emergencyRevoke` | `(agentId: string, revokedBy: string, reason: string)` | `number` | Immediately revoke ALL active grants for an agent. Logs at WARN level. Records separate audit event |
| `getGrants` | `(agentId: string, tenantId?: string)` | `PermissionGrant[]` | List all active (non-expired, non-revoked) grants for an agent |
| `getGrantHistory` | `(agentId: string, tenantId?: string, limit?: number)` | `PermissionGrant[]` | List all grants including revoked/expired for audit purposes. Default limit: 50 |
| `getRequiredAction` | `(toolName: string)` | `PermissionAction \| null` | Look up the required permission action for an MCP tool name |

## Invariants

1. Every grant is HMAC-SHA256 signed over `agentId:action:createdAt` using `PERMISSION_HMAC_SECRET` env var (falls back to a random ephemeral key per startup if unset, with a warning)
2. Permission checks verify HMAC signature integrity; grants with invalid signatures are rejected as potential tampering
3. Grant matching uses three-level resolution: exact action match, namespace wildcard (`ns:*`), superuser wildcard (`*`). First match wins (ordered by `created_at DESC`)
4. Tools with no entry in `TOOL_ACTION_MAP` are allowed by default (not gated)
5. All permission checks are recorded in `permission_checks` table for audit; recording failures never crash the caller (best-effort)
6. Emergency revocation sets `revoked_at` on ALL active grants for an agent and records a separate audit event
7. Expired grants (where `expires_at < now`) are excluded from active checks via SQL WHERE clause
8. Permission check target: <10ms per check

## Behavioral Examples

### Scenario: Tool with no permission mapping

- **Given** an agent calls a tool not in `TOOL_ACTION_MAP`
- **When** `checkTool` is called
- **Then** it returns `{ allowed: true }` with reason indicating no mapping

### Scenario: Exact action grant

- **Given** agent `a1` has an active grant for `git:create_pr`
- **When** `checkTool(a1, 'corvid_github_create_pr')` is called
- **Then** it returns `{ allowed: true }` with the matching grant ID

### Scenario: Namespace wildcard grant

- **Given** agent `a1` has an active grant for `git:*`
- **When** `checkTool(a1, 'corvid_github_create_pr')` is called
- **Then** it returns `{ allowed: true }` (wildcard matches any git: action)

### Scenario: Tampered grant signature

- **Given** a grant exists but its signature was modified in the database
- **When** `checkAction` is called and finds the grant
- **Then** it returns `{ allowed: false }` with reason indicating invalid HMAC signature

### Scenario: Emergency revocation

- **Given** agent `a1` has 5 active grants
- **When** `emergencyRevoke(a1, 'admin', 'compromised')` is called
- **Then** all 5 grants have `revoked_at` set, count 5 is returned, WARN log emitted

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No active grant matches the requested action | Returns `{ allowed: false }` with descriptive reason |
| Grant has invalid HMAC signature | Returns `{ allowed: false }` with tampering warning |
| Audit recording fails (permission_checks INSERT) | Logs error, does not crash the permission check caller |
| Revoke called with no matching grants | Returns 0 affected rows, no audit event recorded |
| Invalid tool name (not in TOOL_ACTION_MAP) | Returns `{ allowed: true }` — tool is not gated |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` for structured logging |
| `server/db/audit.ts` | `recordAudit` for audit trail of grants, revocations, and emergency revocations |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap.ts` | Instantiates `PermissionBroker` at startup |
| `server/process/manager.ts` | References `PermissionBroker` type for session context |
| `server/routes/permissions.ts` | Creates `PermissionBroker` instance to handle REST API endpoints |
| `server/mcp/tool-handlers/types.ts` | References `PermissionBroker` type in `McpToolContext` |

## Database Tables

### permission_grants

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique grant identifier |
| agent_id | TEXT | NOT NULL | Agent receiving the capability |
| action | TEXT | NOT NULL | Permission action string (e.g. `git:create_pr`, `git:*`, `*`) |
| granted_by | TEXT | NOT NULL | Who authorized the grant |
| reason | TEXT | DEFAULT '' | Human-readable reason for the grant |
| signature | TEXT | NOT NULL DEFAULT '' | HMAC-SHA256 signature for tamper detection |
| expires_at | TEXT | DEFAULT NULL | Optional expiry timestamp (ISO 8601) |
| revoked_at | TEXT | DEFAULT NULL | Set when grant is revoked |
| revoked_by | TEXT | DEFAULT NULL | Who revoked the grant |
| tenant_id | TEXT | NOT NULL DEFAULT 'default' | Tenant isolation |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | Grant creation timestamp |

### permission_checks

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique check record identifier |
| agent_id | TEXT | NOT NULL | Agent whose permission was checked |
| tool_name | TEXT | NOT NULL | MCP tool name that was checked |
| action | TEXT | NOT NULL | Resolved permission action |
| allowed | INTEGER | NOT NULL DEFAULT 0 | 1 if allowed, 0 if denied |
| grant_id | INTEGER | DEFAULT NULL | Grant that authorized the action (if allowed) |
| reason | TEXT | DEFAULT '' | Human-readable decision reason |
| check_ms | REAL | DEFAULT 0 | Time taken for the check in milliseconds |
| session_id | TEXT | DEFAULT NULL | Session in which the check occurred |
| tenant_id | TEXT | NOT NULL DEFAULT 'default' | Tenant isolation |
| checked_at | TEXT | NOT NULL DEFAULT datetime('now') | When the check was performed |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PERMISSION_HMAC_SECRET` | (random ephemeral key) | HMAC secret used to sign and verify permission grants. **Required in production** for grant persistence across restarts |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-05 | corvid-agent | Initial spec (#591) |
