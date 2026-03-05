---
module: skill-bundles
version: 1
status: draft
files:
  - server/db/skill-bundles.ts
db_tables:
  - skill_bundles
  - agent_skills
  - project_skills
depends_on: []
---

# Skill Bundles

## Purpose
Provides CRUD operations for skill bundles (reusable collections of tools and prompt additions), manages agent-level and project-level bundle assignments, and resolves the effective tool permissions and prompt additions by merging bundles with base configuration.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listBundles` | `db: Database` | `SkillBundle[]` | Lists all skill bundles ordered by preset status (presets first) then name ascending. |
| `getBundle` | `db: Database, id: string` | `SkillBundle \| null` | Retrieves a single bundle by ID. Returns null if not found. |
| `createBundle` | `db: Database, input: CreateSkillBundleInput` | `SkillBundle` | Creates a new bundle with a random UUID. Tools default to empty array, description and promptAdditions default to empty string. |
| `updateBundle` | `db: Database, id: string, input: UpdateSkillBundleInput` | `SkillBundle \| null` | Partial update of a bundle. Only provided fields are modified. Returns null if not found. |
| `deleteBundle` | `db: Database, id: string` | `boolean` | Deletes a bundle. Returns false if not found or if the bundle is a preset (presets cannot be deleted). |
| `getAgentBundles` | `db: Database, agentId: string` | `SkillBundle[]` | Returns all bundles assigned to an agent via agent_skills, ordered by sort_order ascending. |
| `assignBundle` | `db: Database, agentId: string, bundleId: string, sortOrder?: number` | `boolean` | Assigns a bundle to an agent (INSERT OR REPLACE). Returns false if bundle does not exist. Default sortOrder is 0. |
| `unassignBundle` | `db: Database, agentId: string, bundleId: string` | `boolean` | Removes a bundle assignment from an agent. Returns true if a row was deleted. |
| `resolveAgentTools` | `db: Database, agentId: string, basePermissions: string[] \| null` | `string[] \| null` | Merges agent's assigned bundle tools with base permissions. Returns null-passthrough if no bundles have tools. If basePermissions is null and bundles have tools, returns only bundle tools. |
| `resolveAgentPromptAdditions` | `db: Database, agentId: string` | `string` | Concatenates all promptAdditions from the agent's assigned bundles, separated by double newlines. Returns empty string if no bundles or no additions. |
| `getProjectBundles` | `db: Database, projectId: string` | `SkillBundle[]` | Returns all bundles assigned to a project via project_skills, ordered by sort_order ascending. |
| `assignProjectBundle` | `db: Database, projectId: string, bundleId: string, sortOrder?: number` | `boolean` | Assigns a bundle to a project (INSERT OR REPLACE). Returns false if bundle does not exist. Default sortOrder is 0. |
| `unassignProjectBundle` | `db: Database, projectId: string, bundleId: string` | `boolean` | Removes a bundle assignment from a project. Returns true if a row was deleted. |
| `resolveProjectTools` | `db: Database, projectId: string, basePermissions: string[] \| null` | `string[] \| null` | Merges project's assigned bundle tools with base permissions. Same merge logic as resolveAgentTools. |
| `resolveProjectPromptAdditions` | `db: Database, projectId: string` | `string` | Concatenates all promptAdditions from the project's assigned bundles, separated by double newlines. |

### Exported Types
| Type | Description |
|------|-------------|
| (none) | All public types are imported from `shared/types/skill-bundles`. |

## Internal Types (not exported)

| Type | Description |
|------|-------------|
| `BundleRow` | Database row shape with snake_case fields (id, name, description, tools, prompt_additions, preset, created_at, updated_at). Used for raw query results before mapping to `SkillBundle`. |

## Imported Types (from `shared/types/skill-bundles`)

| Type | Description |
|------|-------------|
| `SkillBundle` | Domain object with camelCase fields: id, name, description, tools (string[]), promptAdditions, preset (boolean), createdAt, updatedAt |
| `CreateSkillBundleInput` | Input for bundle creation: name (required), description?, tools?, promptAdditions? |
| `UpdateSkillBundleInput` | Partial input for bundle update: name?, description?, tools?, promptAdditions? |

## Invariants
1. Bundle IDs are generated via `crypto.randomUUID()`.
2. Preset bundles (preset = 1 / true) cannot be deleted; `deleteBundle` returns false for presets.
3. `assignBundle` and `assignProjectBundle` use INSERT OR REPLACE, making them idempotent for the same agent/bundle or project/bundle pair.
4. `resolveAgentTools` and `resolveProjectTools` use Set-based deduplication when merging bundle tools with base permissions.
5. When `basePermissions` is null (meaning "all default tools"), resolve functions return only the bundle tools array (not null).
6. When no bundles are assigned or bundles have no tools, resolve functions return `basePermissions` unchanged.
7. Prompt additions are concatenated in sort_order, with empty/falsy additions filtered out.
8. `createBundle` always re-reads the record via `getBundle` after insert.
9. The `tools` column is stored as a JSON array string and parsed on read.
10. The `preset` column is stored as INTEGER (0/1) and mapped to boolean on read.

## Behavioral Examples
### Scenario: Create and retrieve a bundle
- **Given** a CreateSkillBundleInput with name "Code Reviewer" and tools ["corvid_github_review_pr"]
- **When** `createBundle(db, input)` is called
- **Then** a new row is inserted into skill_bundles and the SkillBundle is returned with preset = false

### Scenario: Attempt to delete a preset bundle
- **Given** a bundle exists with id "preset-code-reviewer" and preset = true
- **When** `deleteBundle(db, "preset-code-reviewer")` is called
- **Then** `false` is returned and the bundle is not deleted

### Scenario: Resolve tools with bundles and base permissions
- **Given** agent "agent-1" has bundles with tools ["tool-a", "tool-b"] and basePermissions is ["tool-b", "tool-c"]
- **When** `resolveAgentTools(db, "agent-1", ["tool-b", "tool-c"])` is called
- **Then** `["tool-b", "tool-c", "tool-a"]` is returned (merged, deduplicated via Set)

### Scenario: Resolve tools with null base permissions
- **Given** agent "agent-1" has bundles with tools ["tool-a", "tool-b"] and basePermissions is null
- **When** `resolveAgentTools(db, "agent-1", null)` is called
- **Then** `["tool-a", "tool-b"]` is returned (only bundle tools)

### Scenario: Resolve prompt additions
- **Given** agent "agent-1" has two assigned bundles with promptAdditions "Focus on security." and "Be concise."
- **When** `resolveAgentPromptAdditions(db, "agent-1")` is called
- **Then** `"Focus on security.\n\nBe concise."` is returned

## Error Cases
| Condition | Behavior |
|-----------|----------|
| Bundle ID not found | `getBundle` returns `null`; `updateBundle` returns `null`; `deleteBundle` returns `false` |
| Assign to non-existent bundle | `assignBundle` / `assignProjectBundle` return `false` (checked via `getBundle`) |
| Unassign non-existent assignment | `unassignBundle` / `unassignProjectBundle` return `false` (changes === 0) |
| Delete preset bundle | `deleteBundle` returns `false` without performing the delete |
| Database constraint violation | Throws native bun:sqlite error |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types/skill-bundles` | `SkillBundle`, `CreateSkillBundleInput`, `UpdateSkillBundleInput` types |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/routes/skill-bundles.ts` (likely) | API endpoints for bundle CRUD and assignment management |
| `server/process/manager.ts` | `resolveAgentTools`, `resolveAgentPromptAdditions` at session start for tool/prompt injection |
| Agent configuration (likely) | `getAgentBundles` to display assigned bundles |
| Project configuration (likely) | `getProjectBundles`, `resolveProjectTools`, `resolveProjectPromptAdditions` |

## Database Tables
### skill_bundles
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID identifier (or preset-* for built-in bundles) |
| `name` | TEXT | NOT NULL, UNIQUE | Human-readable bundle name |
| `description` | TEXT | DEFAULT '' | Bundle description |
| `tools` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of tool permission strings |
| `prompt_additions` | TEXT | DEFAULT '' | Additional system prompt text injected when bundle is active |
| `preset` | INTEGER | DEFAULT 0 | 1 if this is a built-in preset bundle (cannot be deleted) |
| `created_at` | TEXT | DEFAULT (datetime('now')) | Row creation timestamp |
| `updated_at` | TEXT | DEFAULT (datetime('now')) | Last update timestamp |

### agent_skills
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `agent_id` | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | The agent this assignment belongs to |
| `bundle_id` | TEXT | NOT NULL, FK skill_bundles(id) ON DELETE CASCADE | The assigned bundle |
| `sort_order` | INTEGER | DEFAULT 0 | Ordering for prompt addition concatenation and display |

**Primary Key:** `(agent_id, bundle_id)`
**Indexes:** `idx_agent_skills_agent(agent_id)`

### project_skills
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `project_id` | TEXT | NOT NULL, FK projects(id) ON DELETE CASCADE | The project this assignment belongs to |
| `bundle_id` | TEXT | NOT NULL, FK skill_bundles(id) ON DELETE CASCADE | The assigned bundle |
| `sort_order` | INTEGER | DEFAULT 0 | Ordering for prompt addition concatenation and display |
| `created_at` | TEXT | DEFAULT (datetime('now')) | Row creation timestamp |

**Primary Key:** `(project_id, bundle_id)`
**Indexes:** `idx_project_skills_project(project_id)`

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
