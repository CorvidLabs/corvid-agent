---
module: sandbox-db
version: 1
status: draft
files:
  - server/db/sandbox.ts
db_tables:
  - sandbox_configs
depends_on: []
---

# Sandbox DB

## Purpose
Provides CRUD database operations for per-agent sandbox (container) configurations, enabling retrieval, listing, and deletion of sandbox settings stored in the `sandbox_configs` table.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getSandboxConfig` | `db: Database, agentId: string` | `SandboxConfigRecord \| null` | Retrieves the sandbox configuration for a specific agent by agent_id. Returns null if none exists. |
| `listSandboxConfigs` | `db: Database` | `SandboxConfigRecord[]` | Lists all sandbox configurations ordered by created_at descending. |
| `deleteSandboxConfig` | `db: Database, agentId: string` | `boolean` | Deletes the sandbox configuration for a given agent. Returns true if a row was deleted. |

### Exported Types
| Type | Description |
|------|-------------|
| (none) | All types are imported from `server/sandbox/types` (`SandboxConfigRecord`). |

## Imported Types (from `server/sandbox/types`)

| Type | Description |
|------|-------------|
| `SandboxConfigRecord` | Database row shape for sandbox_configs with snake_case column names. |

## Invariants
1. Each agent has at most one sandbox configuration (agent_id is UNIQUE in the table).
2. `getSandboxConfig` queries by `agent_id`, not by the primary key `id`.
3. `deleteSandboxConfig` queries by `agent_id`, not by `id`.
4. `listSandboxConfigs` always returns results ordered by `created_at DESC`.
5. Functions return raw database row shapes (`SandboxConfigRecord`), not the domain `SandboxConfig` type — callers are responsible for mapping.

## Behavioral Examples
### Scenario: Retrieve sandbox config for an agent
- **Given** an agent with id "agent-1" has a sandbox_configs row with image "corvid-agent-sandbox:latest"
- **When** `getSandboxConfig(db, "agent-1")` is called
- **Then** the matching `SandboxConfigRecord` is returned with all columns populated

### Scenario: Retrieve config for agent with no sandbox
- **Given** no sandbox_configs row exists for agent "agent-2"
- **When** `getSandboxConfig(db, "agent-2")` is called
- **Then** `null` is returned

### Scenario: Delete a sandbox config
- **Given** a sandbox_configs row exists for agent "agent-1"
- **When** `deleteSandboxConfig(db, "agent-1")` is called
- **Then** the row is deleted and `true` is returned

### Scenario: Delete a non-existent config
- **Given** no sandbox_configs row exists for agent "agent-3"
- **When** `deleteSandboxConfig(db, "agent-3")` is called
- **Then** `false` is returned (changes === 0)

## Error Cases
| Condition | Behavior |
|-----------|----------|
| Agent ID does not exist in sandbox_configs | `getSandboxConfig` returns `null`; `deleteSandboxConfig` returns `false` |
| Database connection error | Throws native bun:sqlite error (not handled in this module) |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all query operations |
| `server/sandbox/types` | `SandboxConfigRecord` interface for row typing |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/routes/sandbox.ts` (likely) | API endpoints for sandbox config management |
| `server/process/` (likely) | Session process management to retrieve sandbox settings before container launch |

## Database Tables
### sandbox_configs
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique identifier for the config row |
| `agent_id` | TEXT | NOT NULL, UNIQUE | The agent this sandbox config belongs to |
| `image` | TEXT | DEFAULT 'corvid-agent-sandbox:latest' | Docker image to use for the container |
| `cpu_limit` | REAL | DEFAULT 1.0 | CPU limit in cores |
| `memory_limit_mb` | INTEGER | DEFAULT 512 | Memory limit in megabytes |
| `network_policy` | TEXT | DEFAULT 'restricted' | Network access policy: 'none', 'host', or 'restricted' |
| `timeout_seconds` | INTEGER | DEFAULT 600 | Max execution time in seconds (0 = unlimited) |
| `read_only_mounts` | TEXT | DEFAULT '[]' | JSON array of directories to mount read-only |
| `work_dir` | TEXT | DEFAULT NULL | Working directory bind mount (read-write) |
| `created_at` | TEXT | DEFAULT (datetime('now')) | Row creation timestamp |
| `updated_at` | TEXT | DEFAULT (datetime('now')) | Last update timestamp |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
