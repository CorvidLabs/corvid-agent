---
spec: docs.spec.md
---

## User Stories

- As an agent developer, I want to browse the REST API documentation via Swagger UI so that I can understand available endpoints and test them interactively
- As an external agent, I want to fetch the OpenAPI JSON spec programmatically so that I can generate client libraries or validate my API calls
- As an agent developer, I want the MCP tool catalog included in the API documentation so that I can see all available agent tools alongside REST endpoints
- As a platform administrator, I want the API documentation to be automatically generated from route definitions so that docs stay in sync with the actual API

## Acceptance Criteria

- `buildOpenApiSpec` returns a valid OpenAPI 3.1 document with paths for all registered routes, MCP tools in `x-mcp-tools` extension, and the specified version string
- `buildOpenApiSpec` caches the generated spec after the first call; subsequent calls return the cached version regardless of version parameter
- `getSwaggerUiHtml` returns a self-contained HTML page that loads Swagger UI from CDN and points at the provided spec URL
- `getMcpToolDocs` returns a static list of exactly 28 `McpToolDoc` entries describing all corvid_* MCP tools
- `buildRouteRegistry` returns the complete list of all REST API route definitions including health, projects, agents, sessions, councils, work tasks, schedules, workflows, escalation, AlgoChat, feed, backup, browse-dirs, self-test, and A2A agent card routes
- Each route definition includes at minimum: method, path, summary, tags, and auth flag
- Zod request schemas are converted to JSON Schema via `toJSONSchema()` and embedded under `components.schemas` with the `$schema` key stripped
- Routes with `auth: true` include `security: [{ bearerAuth: [] }]` and 401/403 error responses
- All routes include 400, 404, and 500 error responses by default
- Operation IDs are deterministically generated from method and path segments
- The route registry lazily imports validation schemas to avoid circular dependencies

## Constraints

- The OpenAPI spec is generated once per server lifetime and immutably cached; changes require a server restart
- MCP tool documentation is maintained as a static list; additions require code changes to `mcp-tool-docs.ts`
- Swagger UI is loaded from CDN (no local assets), requiring internet connectivity for the documentation page
- Route registry depends on Zod validation schemas from `server/lib/validation`; unavailability causes build-time errors

## Out of Scope

- Editable or try-it-out API console with live request execution
- API versioning or multiple spec versions served simultaneously
- Auto-generating client SDKs from the OpenAPI spec
- Documentation for WebSocket or SSE endpoints
- Rate limit documentation per endpoint
- Authentication token management within Swagger UI
