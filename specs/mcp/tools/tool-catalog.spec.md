---
module: tool-catalog
version: 1
status: active
files:
  - server/mcp/tool-catalog.ts
  - server/routes/tool-catalog.ts
  - server/openapi/routes/tool-catalog.ts
depends_on:
  - server/mcp/default-tools.ts
---

# Tool Catalog

## Purpose

Provides a structured, categorized view of all available MCP tools for API endpoints, Discord commands, and agent-to-agent discovery. Acts as the single source of truth for tool metadata (name, description, category).

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getToolCatalog` | `(category?: string)` | `{ categories, tools }` | Get tool catalog, optionally filtered by category |
| `getToolCatalogGrouped` | `()` | `{ category, tools }[]` | Get catalog grouped by category |
| `handleToolCatalogRoutes` | `(req, url)` | `Response \| null` | Route handler for `GET /api/tools` |

### Exported Types

| Type | Description |
|------|-------------|
| `ToolCatalogEntry` | Tool metadata: name, description, category, conditional?, restricted? |
| `ToolCategory` | Category metadata: name, label, description |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `TOOL_CATALOG` | `ToolCatalogEntry[]` | Full catalog of all MCP tools |
| `TOOL_CATEGORIES` | `ToolCategory[]` | Tool category definitions |
| `toolCatalogRoutes` | `RouteEntry[]` | OpenAPI route definitions for `GET /api/tools` |

## Categories

| Name | Label | Description |
|------|-------|-------------|
| `communication` | Communication & Memory | Send messages, save/recall memories, manage on-chain storage |
| `agents` | Agent Management | List agents, discover remote agents, launch councils, manage contacts |
| `work` | Session & Work | Manage sessions, credits, projects, work tasks, schedules, and workflows |
| `research` | Research | Web search, deep research, browser automation |
| `github` | GitHub | Star, fork, PRs, issues, reviews, and repo management |
| `notifications` | Notifications & Reputation | Owner notifications, reputation scoring, attestations |
| `code` | Code Tools | AST navigation, file operations, repo blocklist |

## Invariants

1. **Complete coverage**: Every tool in `DEFAULT_CORE_TOOLS` has a corresponding catalog entry
2. **Valid categories**: Every catalog entry references a category that exists in `TOOL_CATEGORIES`
3. **No auth required**: The `GET /api/tools` endpoint is public (no authentication)
4. **Category filter**: Passing `?category=X` returns only tools in that category
5. **Grouped mode**: Passing `?grouped=true` returns tools grouped by category

## Behavioral Examples

### Scenario: List all tools

- **Given** a GET request to `/api/tools`
- **Then** returns all tools with all categories

### Scenario: Filter by category

- **Given** a GET request to `/api/tools?category=github`
- **Then** returns only GitHub tools

### Scenario: Grouped view

- **Given** a GET request to `/api/tools?grouped=true`
- **Then** returns an array of `{ category, tools }` objects

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown category filter | Returns empty tools array with all categories |
| Non-matching URL path | `handleToolCatalogRoutes` returns `null` |

## Dependencies

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/index.ts` | `handleToolCatalogRoutes` for REST API |
| `server/openapi/route-registry.ts` | `toolCatalogRoutes` for OpenAPI spec |

## Tool Count

The catalog contains 71 tools across 7 categories:
- **56 corvid_* tools** (Agent SDK MCP tools): messaging, memory, library, discovery, work, projects, GitHub, Discord, admin, scheduling, workflows
- **15 additional tools** (direct-tools and built-in operations): file operations (read_file, write_file, edit_file), command execution (run_command), filesystem navigation (list_files, search_files), and other utilities

Key additions since initial spec:
- `corvid_library_write/read/list/delete` (CRVLIB shared library tools, category: communication)
- `corvid_discord_send_message/send_image` (Discord messaging, category: communication)
- `corvid_promote_memory` (promote short-term to on-chain, category: communication)
- `corvid_manage_workflow` (graph-based workflows, category: work)
- `corvid_grant_credits`, `corvid_credit_config` (restricted credit admin tools, category: work)
- `read_file`, `write_file`, `edit_file`, `run_command`, `list_files`, `search_files` (code tools for built-in file operations, category: code)

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | corvid-agent | Initial spec |
| 2026-04-09 | corvid-agent | Added 7 categories table, updated tool count to 55+, documented CRVLIB library tools, Discord messaging tools, promote_memory, workflow management, credit admin tools, and built-in file/code tools |
| 2026-04-14 | corvid-agent | Update tool count from 55+ to 62 (#2021) |
| 2026-04-17 | Magpie | Updated tool count from 62 to 71 exact; clarified breakdown (56 corvid_* tools + 15 direct-tools/built-ins); documented complete enumeration of tool categories and counts |
