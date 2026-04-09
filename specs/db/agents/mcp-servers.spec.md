---
module: mcp-servers
version: 1
status: draft
files:
  - server/db/mcp-servers.ts
db_tables:
  - mcp_server_configs
depends_on:
  - specs/lib/infra/infra.spec.md
  - specs/tenant/tenant.spec.md
---

# MCP Servers

## Purpose
Provides full CRUD operations for MCP (Model Context Protocol) server configurations stored in the `mcp_server_configs` table, with multi-tenant isolation support and agent-scoped filtering.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listMcpServerConfigs` | `db: Database, agentId?: string, tenantId: string = DEFAULT_TENANT_ID` | `McpServerConfig[]` | Lists all MCP server configs, optionally filtered by agent ID, with tenant scoping |
| `getMcpServerConfig` | `db: Database, id: string, tenantId: string = DEFAULT_TENANT_ID` | `McpServerConfig \| null` | Gets a single MCP server config by ID with tenant ownership validation |
| `getActiveServersForAgent` | `db: Database, agentId: string` | `McpServerConfig[]` | Returns all enabled configs for a given agent: global (agent_id IS NULL) plus agent-specific ones |
| `createMcpServerConfig` | `db: Database, input: CreateMcpServerConfigInput, tenantId: string = DEFAULT_TENANT_ID` | `McpServerConfig` | Creates a new MCP server config with a generated UUID |
| `updateMcpServerConfig` | `db: Database, id: string, input: UpdateMcpServerConfigInput, tenantId: string = DEFAULT_TENANT_ID` | `McpServerConfig \| null` | Partially updates an existing config; returns null if not found or tenant mismatch |
| `deleteMcpServerConfig` | `db: Database, id: string, tenantId: string = DEFAULT_TENANT_ID` | `boolean` | Deletes a config by ID; returns false if not found or tenant mismatch |

### Exported Types
This module does not export its own types. It re-uses types from `shared/types/a2a.ts`.

## Referenced Types (from `shared/types/a2a.ts`)

| Type | Description |
|------|-------------|
| `McpServerConfig` | `{ id: string; agentId: string \| null; name: string; command: string; args: string[]; envVars: Record<string, string>; cwd: string \| null; enabled: boolean; createdAt: string; updatedAt: string }` |
| `CreateMcpServerConfigInput` | `{ agentId?: string \| null; name: string; command: string; args?: string[]; envVars?: Record<string, string>; cwd?: string \| null; enabled?: boolean }` |
| `UpdateMcpServerConfigInput` | `{ name?: string; command?: string; args?: string[]; envVars?: Record<string, string>; cwd?: string \| null; enabled?: boolean }` |

## Invariants
1. The `args` column is stored as a JSON string array and parsed on read; defaults to `[]` on create.
2. The `env_vars` column is stored as a JSON object string and parsed on read; defaults to `{}` on create.
3. The `enabled` column is stored as an integer (`1` or `0`) and converted to boolean on read.
4. IDs are generated via `crypto.randomUUID()` on creation.
5. The `updated_at` column is set to `datetime('now')` on every update operation.
6. Multi-tenant isolation: when `tenantId` is not the default, `getMcpServerConfig` validates tenant ownership before returning data; `updateMcpServerConfig` and `deleteMcpServerConfig` check ownership before mutating.
7. `getActiveServersForAgent` does not perform tenant filtering — it returns all enabled configs matching the agent (global + agent-specific).
8. `updateMcpServerConfig` with an empty input (no fields to change) returns the existing config without issuing an UPDATE statement.
9. `createMcpServerConfig` throws `NotFoundError` if the re-read after insert fails (should not happen under normal conditions).

## Behavioral Examples
### Scenario: Creating a new MCP server config
- **Given** no configs exist
- **When** `createMcpServerConfig(db, { name: "git-tools", command: "npx", args: ["-y", "@mcp/git"], envVars: { PATH: "/usr/bin" } })` is called
- **Then** a new row is inserted with a UUID, `args = '[\"-y\",\"@mcp/git\"]'`, `env_vars = '{\"PATH\":\"/usr/bin\"}'`, `enabled = 1`, and the config is returned with parsed fields

### Scenario: Getting active servers for an agent
- **Given** two enabled configs exist: one global (`agent_id = NULL`) and one for agent `"a1"`, plus one disabled config for agent `"a1"`
- **When** `getActiveServersForAgent(db, "a1")` is called
- **Then** only the two enabled configs are returned (global + agent-specific), ordered by name

### Scenario: Updating a config with tenant isolation
- **Given** config `"cfg-1"` belongs to tenant `"t1"`
- **When** `updateMcpServerConfig(db, "cfg-1", { enabled: false }, "t2")` is called
- **Then** `null` is returned because tenant `"t2"` does not own the resource

### Scenario: Partial update
- **Given** config `"cfg-1"` exists with `name = "old"` and `command = "npx"`
- **When** `updateMcpServerConfig(db, "cfg-1", { name: "new" })` is called
- **Then** only the `name` field and `updated_at` are changed; `command` remains `"npx"`

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `getMcpServerConfig` for non-existent ID | Returns `null` |
| `getMcpServerConfig` with wrong tenant | Returns `null` (tenant ownership check fails) |
| `updateMcpServerConfig` for non-existent ID | Returns `null` |
| `updateMcpServerConfig` with wrong tenant | Returns `null` |
| `deleteMcpServerConfig` for non-existent ID | Returns `false` |
| `deleteMcpServerConfig` with wrong tenant | Returns `false` |
| `createMcpServerConfig` re-read fails | Throws `NotFoundError` |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database`, `SQLQueryBindings` types |
| `shared/types/a2a` | `McpServerConfig`, `CreateMcpServerConfigInput`, `UpdateMcpServerConfigInput` types |
| `server/lib/errors` | `NotFoundError` thrown if post-insert read fails |
| `server/tenant/types` | `DEFAULT_TENANT_ID` constant for default tenant |
| `server/tenant/db-filter` | `withTenantFilter`, `validateTenantOwnership` for multi-tenant query scoping |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `getActiveServersForAgent` to load MCP servers at session start |
| `server/routes/mcp-servers.ts` | All CRUD functions for the MCP servers REST API |

## Database Tables
### mcp_server_configs
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| agent_id | TEXT | DEFAULT NULL, REFERENCES agents(id) ON DELETE CASCADE | Optional agent association; NULL means global config |
| name | TEXT | NOT NULL | Human-readable name for the MCP server |
| command | TEXT | NOT NULL | Command to execute (e.g., "npx", "node") |
| args | TEXT | NOT NULL DEFAULT '[]' | JSON array of command arguments |
| env_vars | TEXT | NOT NULL DEFAULT '{}' | JSON object of environment variables |
| cwd | TEXT | DEFAULT NULL | Working directory for the command |
| enabled | INTEGER | NOT NULL DEFAULT 1 | Whether the config is active (1) or disabled (0) |
| created_at | TEXT | DEFAULT (datetime('now')) | ISO 8601 creation timestamp |
| updated_at | TEXT | DEFAULT (datetime('now')) | ISO 8601 last-update timestamp |
| tenant_id | TEXT | NOT NULL DEFAULT 'default' | Multi-tenant isolation key (added in migration 57) |

#### Indexes
- `idx_mcp_server_configs_agent` on `agent_id`
- `idx_mcp_server_configs_tenant` on `tenant_id`

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
