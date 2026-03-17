---
module: openapi
version: 1
status: draft
files:
  - server/openapi/generator.ts
  - server/openapi/handler.ts
  - server/openapi/index.ts
  - server/openapi/route-registry.ts
  - server/openapi/routes/agents.ts
  - server/openapi/routes/algochat.ts
  - server/openapi/routes/allowlist.ts
  - server/openapi/routes/analytics.ts
  - server/openapi/routes/auth.ts
  - server/openapi/routes/billing.ts
  - server/openapi/routes/councils.ts
  - server/openapi/routes/escalation.ts
  - server/openapi/routes/integrations.ts
  - server/openapi/routes/marketplace.ts
  - server/openapi/routes/mcp.ts
  - server/openapi/routes/mention-polling.ts
  - server/openapi/routes/plugins.ts
  - server/openapi/routes/projects.ts
  - server/openapi/routes/providers.ts
  - server/openapi/routes/reputation.ts
  - server/openapi/routes/sandbox.ts
  - server/openapi/routes/schedules.ts
  - server/openapi/routes/sessions.ts
  - server/openapi/routes/system.ts
  - server/openapi/routes/types.ts
  - server/openapi/routes/webhooks.ts
  - server/openapi/routes/work-tasks.ts
  - server/openapi/routes/workflows.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# OpenAPI

## Purpose

Generates and serves an OpenAPI 3.0.3 specification document from a declarative route metadata registry, and provides a Swagger UI endpoint for interactive API exploration. Routes are described declaratively with Zod request schemas that are converted to JSON Schema at generation time.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `generateOpenApiSpec` | `options?: GeneratorOptions` | `OpenApiSpec` | Assembles a full OpenAPI 3.0.3 document from the route registry. Converts Zod schemas to JSON Schema via `z.toJSONSchema()`. Accepts an optional `serverUrl` (defaults to `http://localhost:3000`). |
| `handleOpenApiRoutes` | `req: Request, url: URL` | `Response \| null` | Handle OpenAPI-related HTTP routes. Returns a `Response` for `GET /api/openapi.json` (JSON spec) and `GET /api/docs` (Swagger UI HTML), or `null` if the path does not match. |

### Exported Types

| Type | Description |
|------|-------------|
| `GeneratorOptions` | Options for `generateOpenApiSpec`: `{ serverUrl?: string }`. |
| `HttpMethod` | Union type: `'GET' \| 'POST' \| 'PUT' \| 'DELETE' \| 'PATCH'`. |
| `RouteEntry` | Declarative route metadata: `method`, `path` (OpenAPI-style with `{param}`), `summary`, optional `description`, `tags` array, optional `requestBody` (Zod schema), `auth` level (`'required' \| 'admin' \| 'none'`), and optional `responses` map. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `routes` | `RouteEntry[]` | The complete declarative route metadata registry containing all API route definitions with their methods, paths, tags, summaries, request schemas, auth requirements, and response descriptions. |

## Invariants

1. The generated OpenAPI spec always uses version `3.0.3`.
2. The spec info title is always `'Corvid Agent API'`.
3. All path parameters extracted from `{param}` syntax in route paths are included as required string parameters in the operation.
4. Routes with `auth: 'required'` or `auth: 'admin'` include a `BearerAuth` security requirement on the operation.
5. Routes with `auth: 'required'` or `auth: 'admin'` always include a 401 response.
6. Routes with `auth: 'admin'` always include a 403 response.
7. If no 200 or 201 response is explicitly defined for a route, a default 200 response is added.
8. `operationId` values are deterministically generated from method + path (e.g., `get_api_health`).
9. Tags are sorted alphabetically in the spec and include descriptions from a built-in tag description map.
10. The OpenAPI JSON spec is cached after first generation and reused for the lifetime of the server process.
11. Swagger UI HTML is served using CDN-hosted swagger-ui-dist@5 assets.
12. `handleOpenApiRoutes` returns `null` for any path that is not `/api/openapi.json` or `/api/docs`.
13. If a Zod schema fails to convert to JSON Schema, the generator falls back to `{ type: 'object' }`.
14. The `routes` array is the single source of truth for all API route metadata; handler files are not modified.

## Behavioral Examples

### Scenario: Generating the OpenAPI spec
- **Given** the route registry contains routes for health, agents, and sessions
- **When** `generateOpenApiSpec({ serverUrl: 'https://api.example.com' })` is called
- **Then** a complete OpenAPI 3.0.3 document is returned with paths, tags, security schemes, and the server URL set to `https://api.example.com`.

### Scenario: Serving the JSON spec
- **Given** the server is running
- **When** a `GET /api/openapi.json` request is received
- **Then** `handleOpenApiRoutes` returns a `Response` with `Content-Type: application/json`, `Cache-Control: public, max-age=60`, and CORS header `Access-Control-Allow-Origin: *`.

### Scenario: Serving Swagger UI
- **Given** the server is running
- **When** a `GET /api/docs` request is received
- **Then** `handleOpenApiRoutes` returns a `Response` with `Content-Type: text/html` containing a self-contained Swagger UI page that loads the spec from `/api/openapi.json`.

### Scenario: Non-matching route
- **Given** a request for `GET /api/agents`
- **When** `handleOpenApiRoutes` is called
- **Then** it returns `null`, allowing the request to be handled by other route handlers.

### Scenario: Route with Zod request body
- **Given** a route entry has a `requestBody` set to a Zod object schema
- **When** the spec is generated
- **Then** the operation includes a `requestBody` with `application/json` content type and the Zod schema converted to JSON Schema (without `$schema` key).

### Scenario: Route with path parameters
- **Given** a route with path `/api/agents/{id}/sessions/{sessionId}`
- **When** the spec is generated
- **Then** the operation includes two required path parameters: `id` and `sessionId`, both typed as string.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Zod schema conversion to JSON Schema fails | Falls back to `{ type: 'object' }` for the request body schema. |
| `handleOpenApiRoutes` called with non-GET method on `/api/openapi.json` | Returns `null` (no match). |
| `handleOpenApiRoutes` called with non-GET method on `/api/docs` | Returns `null` (no match). |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `zod` | `z.toJSONSchema()` for converting Zod schemas to JSON Schema; `z.ZodType` for request body typing |
| lib (validation) | All request body Zod schemas imported by route-registry (e.g., `CreateProjectSchema`, `CreateAgentSchema`, etc.) |

### Consumed By

| Module | What is used |
|--------|-------------|
| server/index.ts | `handleOpenApiRoutes` for routing OpenAPI requests |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
