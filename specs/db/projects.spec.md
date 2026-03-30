---
module: projects-db
version: 1
status: draft
files:
  - server/db/projects.ts
db_tables:
  - projects
depends_on: []
---

# Projects DB

## Purpose

Pure data-access layer for project CRUD operations. Projects are the top-level organizational unit that group sessions, work tasks, and council launches. All queries support multi-tenant isolation via optional `tenantId` parameter.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listProjects` | `(db: Database, tenantId?: string)` | `Project[]` | List all projects ordered by `updated_at DESC`. Applies tenant filter when tenantId is not the default |
| `getProject` | `(db: Database, id: string, tenantId?: string)` | `Project \| null` | Fetch a single project by ID. Returns null if not found or tenant ownership validation fails |
| `getProjectByName` | `(db: Database, name: string, tenantId?: string)` | `Project \| null` | Fetch a single project by name (case-insensitive). Returns null if not found |
| `createProject` | `(db: Database, input: CreateProjectInput, tenantId?: string)` | `Project` | Insert a new project with a generated UUID. Serializes `envVars` as JSON |
| `updateProject` | `(db: Database, id: string, input: UpdateProjectInput, tenantId?: string)` | `Project \| null` | Partially update a project. Only provided fields are modified. Returns null if not found or tenant mismatch |
| `deleteProject` | `(db: Database, id: string, tenantId?: string)` | `boolean` | Delete a project and all dependent records in a transaction. Returns false if not found or tenant mismatch |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | All types are imported from `shared/types` (`Project`, `CreateProjectInput`, `UpdateProjectInput`) |

## Invariants

1. **UUID generation**: Project IDs are generated via `crypto.randomUUID()` at creation time
2. **Cascade deletion**: Deleting a project must delete, in order: `council_launches`, `work_tasks`, `session_messages` (for project sessions), `sessions`, then the project itself -- all within a single transaction
3. **JSON serialization**: `env_vars` is stored as a JSON string and parsed on read via `JSON.parse()`
4. **Partial updates only**: `updateProject` only modifies fields present in the input; omitted fields are unchanged
5. **Timestamp auto-update**: `updateProject` always sets `updated_at = datetime('now')` when any field changes
6. **Tenant isolation**: All read/write operations validate tenant ownership via `withTenantFilter` or `validateTenantOwnership` before data access; defaults to `DEFAULT_TENANT_ID` for single-tenant backwards compatibility
7. **No-op on empty update**: If `UpdateProjectInput` contains no fields, the existing project is returned without executing any SQL update

## Behavioral Examples

### Scenario: Create and retrieve a project
- **Given** an empty database
- **When** `createProject(db, { name: 'My Project', workingDir: '/code' })` is called
- **Then** a new row is inserted with a UUID, `description` defaults to `''`, `claude_md` defaults to `''`, `env_vars` defaults to `'{}'`, and the returned `Project` object has camelCase property names

### Scenario: Update only the description
- **Given** a project with id `abc-123` exists
- **When** `updateProject(db, 'abc-123', { description: 'Updated' })` is called
- **Then** only the `description` and `updated_at` columns are changed; all other columns remain untouched

### Scenario: Delete project with dependent records
- **Given** a project with sessions, session messages, work tasks, and council launches
- **When** `deleteProject(db, projectId)` is called
- **Then** all dependent records are deleted first (children before parent) within a single transaction, and `true` is returned

### Scenario: Tenant isolation prevents cross-tenant access
- **Given** a project owned by tenant `tenant-A`
- **When** `getProject(db, projectId, 'tenant-B')` is called
- **Then** `null` is returned because `validateTenantOwnership` fails

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getProject` with nonexistent ID | Returns `null` |
| `updateProject` with nonexistent ID | Returns `null` |
| `deleteProject` with nonexistent ID | Returns `false` |
| `createProject` with missing required `name` or `workingDir` | SQLite constraint error (NOT NULL violation) |
| Tenant mismatch on read/update/delete | Returns `null` or `false` as if the record does not exist |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/types` | `Project`, `CreateProjectInput`, `UpdateProjectInput` type definitions |
| `server/tenant/types` | `DEFAULT_TENANT_ID` constant |
| `server/tenant/db-filter` | `withTenantFilter`, `validateTenantOwnership` for multi-tenant row scoping |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/projects.ts` | All CRUD functions for HTTP API endpoints |
| `server/process/manager.ts` | `getProject` to load project configuration at session start |
| `server/work/service.ts` | `getProject` to resolve project context for work tasks |
| `server/improvement/service.ts` | `getProject` for self-improvement workflow context |
| `server/councils/discussion.ts` | `getProject` for council discussion project resolution |
| `server/telegram/bridge.ts` | `listProjects`, `getProject` for project lookup in Telegram bridge |
| `server/discord/bridge.ts` | `listProjects`, `getProject` for project lookup in Discord bridge |
| `server/slack/bridge.ts` | `listProjects`, `getProject` for project lookup in Slack bridge |
| `server/mcp/tool-handlers/ast.ts` | `getProject` for AST tool project resolution |
| `server/mcp/tool-handlers/projects.ts` | `listProjects`, `getProject` for project discovery tools |
| `server/mcp/tool-handlers/work.ts` | `getProjectByName`, `listProjects` for project name resolution in work tasks |
| `server/exam/runner.ts` | `getProject` for exam runner project context |
| `server/selftest/service.ts` | `createProject`, `deleteProject` for self-test lifecycle |

## Database Tables

### projects

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID generated at creation |
| `name` | TEXT | NOT NULL | Human-readable project name |
| `description` | TEXT | DEFAULT `''` | Optional project description |
| `working_dir` | TEXT | NOT NULL | Filesystem path to the project working directory |
| `claude_md` | TEXT | DEFAULT `''` | Custom CLAUDE.md content injected into agent sessions |
| `env_vars` | TEXT | DEFAULT `'{}'` | JSON-serialized key-value pairs of environment variables |
| `git_url` | TEXT | DEFAULT NULL | Git remote URL for cloneable projects |
| `dir_strategy` | TEXT | NOT NULL, DEFAULT `'persistent'` | Directory strategy: 'persistent' (fixed dir) or 'clone' (fresh clone per session) |
| `base_clone_path` | TEXT | DEFAULT NULL | Base filesystem path for clone-strategy projects |
| `tenant_id` | TEXT | NOT NULL DEFAULT `'default'` | Multi-tenant isolation key (added in migration 57) |
| `created_at` | TEXT | DEFAULT `datetime('now')` | ISO 8601 creation timestamp |
| `updated_at` | TEXT | DEFAULT `datetime('now')` | ISO 8601 last-update timestamp |

**Indexes:**
- `idx_projects_tenant` on `tenant_id`
- `idx_projects_tenant_name` on `(tenant_id, name COLLATE NOCASE)` UNIQUE — prevents duplicate project names per tenant

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
