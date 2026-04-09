---
module: docs
version: 1
status: draft
files:
  - server/docs/index.ts
  - server/docs/mcp-tool-docs.ts
  - server/docs/openapi-generator.ts
  - server/docs/route-registry.ts
db_tables: []
depends_on:
  - specs/lib/infra/infra.spec.md
---

# Docs

## Purpose
Generates and serves OpenAPI 3.1 documentation for the corvid-agent REST API and MCP tool catalog, including a Swagger UI HTML endpoint and a complete route registry of all API endpoints.

## Public API

### Exported Functions

#### index.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `buildOpenApiSpec` | `version: string` | `Record<string, unknown>` | Builds and caches the complete OpenAPI spec with REST routes and MCP tool docs attached as `x-mcp-tools` extension |
| `getSwaggerUiHtml` | `specUrl: string` | `string` | Returns minimal HTML page that loads Swagger UI from CDN pointing at the given spec URL |

#### mcp-tool-docs.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getMcpToolDocs` | (none) | `McpToolDoc[]` | Returns the static list of all corvid_* MCP tool documentation entries |

#### openapi-generator.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `generateOpenApiSpec` | `routes: RouteDefinition[], version: string` | `OpenApiSpec` | Generates a complete OpenAPI 3.1 specification from route definitions, including paths, schemas (from Zod), tags, and security schemes |

#### route-registry.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `buildRouteRegistry` | (none) | `RouteDefinition[]` | Returns the complete list of all REST API route definitions (health, projects, agents, sessions, councils, work tasks, schedules, workflows, escalation, AlgoChat, feed, backup, browse-dirs, self-test, A2A agent card) |

### Exported Types

| Type | Description |
|------|-------------|
| `McpToolDoc` | Interface with fields: name (string), description (string), inputSchema? (Record<string, unknown>) |
| `RouteDefinition` | Interface defining an API route: method ('GET' \| 'POST' \| 'PUT' \| 'DELETE' \| 'PATCH'), path, summary, description?, tags, auth, requestSchema? (z.ZodType), responseDescription?, pathParams?, queryParams? |

## Invariants
1. The OpenAPI spec is generated once and cached in memory; subsequent calls to `buildOpenApiSpec` return the cached version.
2. MCP tool documentation is attached to the spec under the `x-mcp-tools` custom extension key.
3. All route definitions in the registry include at least: method, path, summary, tags, and auth flag.
4. Zod request schemas are converted to JSON Schema via `toJSONSchema()` from the `zod` library and embedded under `components.schemas`.
5. The `$schema` metadata key is stripped from converted Zod schemas.
6. Routes with `auth: true` get `security: [{ bearerAuth: [] }]` and 401/403 error responses.
7. All routes get 400, 404, and 500 error responses by default.
8. Operation IDs are auto-generated from the HTTP method and path segments.
9. The MCP tool docs list is static and contains exactly 28 tool entries.
10. The route registry lazily imports validation schemas to avoid circular dependencies.

## Behavioral Examples

### Scenario: Building the OpenAPI spec
- **Given** the docs module is initialized
- **When** `buildOpenApiSpec('1.0.0')` is called
- **Then** it returns an OpenAPI 3.1 object with paths for all registered routes, MCP tools in `x-mcp-tools`, and version "1.0.0"

### Scenario: Caching behavior
- **Given** `buildOpenApiSpec('1.0.0')` has been called once
- **When** `buildOpenApiSpec('2.0.0')` is called again
- **Then** it returns the same cached spec from the first call (version remains "1.0.0")

### Scenario: Swagger UI HTML
- **Given** the spec is served at `/api/docs/openapi.json`
- **When** `getSwaggerUiHtml('/api/docs/openapi.json')` is called
- **Then** it returns HTML with a Swagger UI bundle configured to load from that URL

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Validation schemas fail to load | `buildRouteRegistry` will throw at require-time if `server/lib/validation` is unavailable |
| Zod schema conversion fails | `toJSONSchema()` may throw for unsupported Zod types |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/validation` | Zod request schemas for all API routes (lazily required in route-registry) |
| `zod` | `toJSONSchema` for converting Zod schemas to JSON Schema |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/docs` | `buildOpenApiSpec` and `getSwaggerUiHtml` for serving API documentation endpoints |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
