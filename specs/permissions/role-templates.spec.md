---
module: role-templates
version: 1
status: active
files:
  - server/permissions/role-templates.ts
depends_on:
  - specs/permissions/broker.spec.md
---

# Role Templates

## Purpose

Provides predefined permission bundles (role templates) that can be applied to agents in a single operation. Addresses the v1.0.0-rc RBAC gating criteria by defining owner, operator, viewer, developer, and communicator roles. Templates map to the existing capability-based grant system — applying a template creates individual HMAC-signed grants for each action in the bundle.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getRoleTemplate` | `(name: string)` | `RoleTemplate \| undefined` | Look up a role template by name |
| `listRoleTemplates` | `()` | `readonly RoleTemplate[]` | List all available role templates |
| `applyRoleTemplate` | `(db: Database, agentId: string, templateName: string, grantedBy: string, opts?: { tenantId?: string; expiresAt?: string \| null; reason?: string })` | `Promise<{ template: RoleTemplate; grants: PermissionGrant[]; skipped: number }>` | Apply a role template to an agent, creating grants for all actions. Skips duplicates |
| `revokeRoleTemplate` | `(db: Database, agentId: string, templateName: string, revokedBy: string, opts?: { tenantId?: string; reason?: string })` | `{ template: RoleTemplate; revoked: number }` | Revoke all grants matching a role template's actions for an agent |

### Exported Types

| Type | Description |
|------|-------------|
| `RoleTemplate` | A role template with `name: string`, `description: string`, `actions: PermissionAction[]` |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `ROLE_TEMPLATES` | `readonly RoleTemplate[]` | Built-in role templates: owner, operator, viewer, developer, communicator |

## Invariants

1. All template actions follow `namespace:verb`, `namespace:*`, or `*` format
2. `applyRoleTemplate` skips actions for which the agent already has an active grant (no duplicates)
3. `applyRoleTemplate` and `revokeRoleTemplate` throw on unknown template names
4. Template operations respect tenant isolation via the `tenantId` parameter
5. Owner template uses the superuser wildcard (`*`) — a single grant covers all actions
6. Viewer template contains only read/list/discover actions — no write operations

## Behavioral Examples

### Scenario: Apply operator role to an agent

- **Given** agent `a1` has no existing grants
- **When** `applyRoleTemplate(db, 'a1', 'operator', 'admin')` is called
- **Then** grants are created for all operator actions (git:*, msg:send, schedule:manage, etc.)
- **And** the agent can use git tools, send messages, and manage schedules
- **And** the agent cannot grant credits or manage repo blocklists

### Scenario: Apply role template with existing grants

- **Given** agent `a1` already has a grant for `git:*`
- **When** `applyRoleTemplate(db, 'a1', 'operator', 'admin')` is called
- **Then** the `git:*` action is skipped (already granted)
- **And** all other operator actions are granted
- **And** `skipped` count is 1

### Scenario: Revoke role template

- **Given** agent `a1` has all viewer role grants
- **When** `revokeRoleTemplate(db, 'a1', 'viewer', 'admin')` is called
- **Then** all viewer grants are revoked
- **And** agent `a1` has no active grants

### Scenario: Tenant isolation

- **Given** agent `a1` has viewer role in tenant-a and operator role in tenant-b
- **When** `revokeRoleTemplate(db, 'a1', 'viewer', 'admin', { tenantId: 'tenant-a' })` is called
- **Then** only tenant-a grants are revoked
- **And** tenant-b operator grants remain active

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown template name in `applyRoleTemplate` | Throws `Error` with descriptive message |
| Unknown template name in `revokeRoleTemplate` | Throws `Error` with descriptive message |
| No matching grants for revocation | Returns `{ revoked: 0 }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/permissions/broker.ts` | `PermissionBroker` for grant/revoke/getGrants operations |
| `server/lib/logger.ts` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/permissions/index.ts` | Re-exports all public API |
| `server/routes/permissions.ts` | REST API endpoints for role template operations |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | corvid-agent | Initial spec — role templates for v1.0.0-rc RBAC requirement |
