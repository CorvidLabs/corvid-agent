# Tenant — Context

## Why This Module Exists

The platform is being prepared for multi-tenant operation — multiple organizations sharing a single deployment. The tenant module provides resolution helpers that map entities (agents, councils) to tenant IDs for scoping.

## Architectural Role

Tenant is a **scoping layer** — it ensures that data and events are properly isolated between tenants. Currently, most deployments are single-tenant, so the module returns `undefined` (unscoped) as the default.

## Key Design Decisions

- **Graceful single-tenant default**: When multi-tenant mode is off, tenant resolution returns `undefined`, allowing callers to use flat (unscoped) topics. No code changes needed for single-tenant deployments.
- **Entity-to-tenant mapping**: Converts agent IDs and council launch IDs to tenant IDs, centralizing the scoping logic.
- **WebSocket topic scoping**: The primary consumer is the event broadcasting module, which uses tenant IDs to scope WebSocket topics.

## Relationship to Other Modules

- **Events**: Event broadcasting uses tenant resolution for topic scoping.
- **DB**: Looks up agent/entity records to determine tenant affiliation.
- **WebSocket**: Tenant-scoped topics are broadcast via WebSocket.
