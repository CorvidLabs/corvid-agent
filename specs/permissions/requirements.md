---
spec: broker.spec.md
---

## User Stories

- As a platform administrator, I want capability-based permission grants signed with HMAC so that grant tampering is detectable and grants are cryptographically verifiable
- As an agent operator, I want to apply role templates (owner, operator, viewer, developer, communicator) to agents in a single operation so that I do not need to create individual grants manually
- As a platform administrator, I want emergency revocation to immediately revoke all active grants for a compromised agent so that security incidents can be contained quickly
- As a team agent, I want permission checks to complete in under 10ms so that tool execution is not noticeably delayed by authorization
- As a platform administrator, I want a four-tier governance hierarchy (Guest, Agent, Operator, Owner) so that governance API actions are gated by caller privilege level
- As an agent operator, I want all permission checks recorded in an audit trail so that I can review who accessed what and when

## Acceptance Criteria

- Every grant is HMAC-SHA256 signed over `agentId:action:createdAt` using the `PERMISSION_HMAC_SECRET` environment variable; grants with invalid signatures are rejected as potential tampering
- `PermissionBroker.checkAction` matches grants in three-level resolution: exact action match, namespace wildcard (`ns:*`), superuser wildcard (`*`); first match wins ordered by `created_at DESC`
- `PermissionBroker.checkTool` resolves tool names to actions via `TOOL_ACTION_MAP` (30+ tool-to-action mappings across 11 namespaces); tools with no mapping are allowed by default
- `PermissionBroker.emergencyRevoke` sets `revoked_at` on all active grants for an agent, returns the affected count, and logs at WARN level
- Expired grants (where `expires_at < now`) are excluded from active checks via SQL WHERE clause
- All permission checks are recorded in the `permission_checks` table with `agent_id`, `tool_name`, `action`, `allowed`, `grant_id`, `reason`, `check_ms`, `session_id`; recording failures never crash the caller
- `applyRoleTemplate` creates HMAC-signed grants for all actions in the template, skipping actions where the agent already has an active grant; returns `{ grants, skipped }` counts
- `revokeRoleTemplate` revokes all grants matching the template's actions for the specified agent and tenant
- `applyRoleTemplate` and `revokeRoleTemplate` throw on unknown template names
- `resolveCallerTier` follows strict priority: admin API key (Owner) > tenant role mapping > DB grant lookup > authenticated fallback (Agent) > Guest default
- `requirePermissionTier` returns a 403 response with `ERR_INSUFFICIENT_TIER` error code when the caller's tier is below the minimum; never exposes tier details in client response bodies
- The `owner` role template uses the superuser wildcard (`*`); the `viewer` template contains only read/list/discover actions
- Tenant isolation is enforced via the `tenantId` parameter on grants, checks, and role template operations
- When `PERMISSION_HMAC_SECRET` is not set, a random ephemeral key is generated per startup with a warning log

## Constraints

- Permission check target latency is under 10ms per check
- Audit recording is best-effort; failures are logged but never propagate to the permission check caller
- The `GOVERNANCE_ROUTE_TIERS` constant is a documentation artifact only and does not drive runtime enforcement
- Role template definitions are immutable at runtime (defined as constants)
- DB grant lookup for tier resolution checks for active, non-revoked, non-expired grants with `action = '*'` (Owner), `council:*` (Operator), or `council:manage` (Operator)

## Out of Scope

- On-chain permission delegation (Layer 2 governance)
- Permission UI components or dashboards
- Dynamic role template creation (templates are code-defined constants)
- Rate limiting on permission check frequency
- Cross-tenant grant sharing or federation
