---
module: tenant-resolve
version: 1
status: active
files:
  - server/tenant/resolve.ts
depends_on:
  - specs/tenant/tenant.spec.md
  - specs/db/agents.spec.md
---

# Tenant Resolution

## Purpose

Shared tenant resolution helpers for event broadcasting and routing. Converts entity IDs (agent, council launch) to tenant IDs for scoping WebSocket topics. Returns `undefined` for the default tenant or when multi-tenant mode is off, allowing callers to use flat (unscoped) topics.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveAgentTenant` | `(db, agentId, multiTenant?)` | `string \| undefined` | Look up agent's tenant_id; returns undefined for default tenant or single-tenant mode |
| `resolveCouncilTenant` | `(db, launchId, multiTenant?)` | `string \| undefined` | Resolve tenant via council launch's first session's agent; returns undefined for default tenant |

## Invariants

1. When `multiTenant` is `false`, both functions return `undefined` immediately (no DB query).
2. When the entity belongs to `DEFAULT_TENANT_ID`, both functions return `undefined` (flat topic).
3. `resolveAgentTenant` queries `agents.tenant_id` by agent ID.
4. `resolveCouncilTenant` joins `sessions` → `agents` via `council_launch_id` and takes the first match.
5. If the entity is not found in the DB, both functions return `undefined`.
6. `multiTenant` defaults to `true` so callers that already filtered can omit it.

## Behavioral Examples

### Multi-tenant agent resolution
```
Given: agent "A1" has tenant_id "T1" (not DEFAULT_TENANT_ID)
When: resolveAgentTenant(db, "A1", true)
Then: returns "T1"
```

### Default tenant returns undefined
```
Given: agent "A2" has tenant_id DEFAULT_TENANT_ID
When: resolveAgentTenant(db, "A2", true)
Then: returns undefined
```

### Single-tenant mode shortcut
```
When: resolveAgentTenant(db, "A1", false)
Then: returns undefined (no DB query executed)
```

## Error Cases

| Scenario | Behavior |
|----------|----------|
| Agent not found in DB | Returns `undefined` (null row) |
| Council launch has no sessions | Returns `undefined` (null row from JOIN) |
| `multiTenant` is false | Returns `undefined` immediately, no DB access |

## Dependencies

| Dependency | Usage |
|------------|-------|
| `server/tenant/types.ts` | `DEFAULT_TENANT_ID` constant |
| `bun:sqlite` | `Database` for SQL queries |

## Change Log

- v1 (2026-03-06): Initial spec created during documentation audit.
