# Permissions — Context

## Why This Module Exists

Not all agents should be able to do everything. The permission broker provides fine-grained access control — which agents can use which tools, access which resources, and perform which operations. This is especially important in a multi-agent system where junior agents should have restricted capabilities compared to senior ones.

## Architectural Role

Permissions is a **security layer** that sits between tool invocations and their execution. Every tool call passes through the permission broker before running.

## Key Design Decisions

- **Governance tiers**: Permissions are categorized by governance tier. Some changes (Layer 1) require council votes; others can be granted by the owner directly.
- **Grant-based model**: Permissions are explicitly granted, not role-based. This provides fine-grained control.
- **Audit trail**: All permission checks are logged in the `permission_checks` table for security auditing.

## Relationship to Other Modules

- **MCP**: Tool access is filtered by permissions.
- **Councils**: Governance tier changes require council votes.
- **DB**: Grants and checks are stored in `permission_grants` and `permission_checks`.
- **Agent Tiers (Lib)**: Tier definitions influence default permission sets.
