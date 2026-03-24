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

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | corvid-agent | Initial spec |
