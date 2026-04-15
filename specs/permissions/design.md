---
spec: broker.spec.md
sources:
  - server/permissions/broker.ts
  - server/permissions/types.ts
  - server/permissions/governance-tier.ts
  - server/permissions/index.ts
---

## Module Structure

Four files under `server/permissions/`:
- `types.ts` — all shared types and enums (`PermissionNamespace`, `PermissionAction`, `PermissionGrant`, `PermissionCheckResult`, `PermissionTier`, `TOOL_ACTION_MAP`)
- `broker.ts` — `PermissionBroker` class (grant lifecycle, HMAC signing, check logic, audit recording)
- `governance-tier.ts` — `resolveCallerTier()`, `requirePermissionTier()`, `PermissionTier` enum, tier constants
- `index.ts` — barrel re-exporting everything from the three above files

## Key Classes and Functions

**`PermissionBroker`** — Stateful class backed by a SQLite `Database`. HMAC secret is resolved once at construction from `PERMISSION_HMAC_SECRET` env var (falls back to a random ephemeral key per startup).

- `grant()` — generates HMAC-SHA256 over `agentId:action:createdAt`, inserts into `permission_grants`, records audit event.
- `checkAction()` — SQL query with `WHERE agent_id = ? AND (action = ? OR action = namespace:* OR action = '*') AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))` ordered by `created_at DESC`. Verifies HMAC of each candidate grant; returns first match or denied.
- `checkTool()` — looks up tool in `TOOL_ACTION_MAP`, delegates to `checkAction()`, records in `permission_checks` (best-effort).
- `emergencyRevoke()` — UPDATE sets `revoked_at` on all active grants for an agent; logs at WARN level.

**`resolveCallerTier()`** — Determines `PermissionTier` from a `RequestContext`: Owner role → Owner tier; Operator role → Operator tier; DB-granted owner/operator rows → respective tier; authenticated → Agent tier; unauthenticated → Guest tier.

**`requirePermissionTier()`** — Returns an Express-style middleware guard that calls `resolveCallerTier()` and returns 403 if the tier is below minimum.

## Configuration Values

| Env Var | Default | Usage |
|---------|---------|-------|
| `PERMISSION_HMAC_SECRET` | Random ephemeral key (warning logged) | Signs and verifies all permission grants |

## Related Resources

**DB tables:** `permission_grants` and `permission_checks` (see spec for full schemas).

**Consumed by:**
- `server/bootstrap.ts` — instantiates `PermissionBroker` at startup
- `server/process/manager.ts` — passes broker into `McpToolContext`
- `server/routes/permissions.ts` — REST API for grant/revoke/list operations
- `server/mcp/tool-handlers/types.ts` — broker reference in `McpToolContext`

**Role templates** (`role-templates.ts`): five built-in templates (owner, operator, viewer, developer, communicator) each defining a named set of `PermissionAction` values that can be applied in bulk via `applyRoleTemplate()`.
