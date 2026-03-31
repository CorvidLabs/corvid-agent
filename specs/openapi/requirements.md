---
spec: openapi.spec.md
---

## User Stories

- As an agent developer, I want to browse the complete API documentation via Swagger UI so that I can discover and test all available endpoints interactively
- As an external agent, I want to fetch the OpenAPI 3.0.3 JSON spec programmatically so that I can auto-generate API clients for integration
- As an agent developer, I want API route metadata defined declaratively with Zod schemas so that documentation stays in sync with request validation
- As a platform administrator, I want a single source of truth for all API routes so that documentation never diverges from the actual handlers

## Acceptance Criteria

- `generateOpenApiSpec` produces a valid OpenAPI 3.0.3 document with info title `'Corvid Agent API'` and the server URL defaulting to `http://localhost:3000`
- `generateOpenApiSpec` accepts an optional `serverUrl` via `GeneratorOptions` to override the default server URL
- The `routes` array is the single source of truth for all API route metadata; each `RouteEntry` includes `method`, `path` (OpenAPI `{param}` syntax), `summary`, `tags`, `auth` level, and optional `requestBody` (Zod schema), `description`, and `responses`
- All path parameters extracted from `{param}` syntax are included as required string parameters in the generated operation
- Routes with `auth: 'required'` or `auth: 'admin'` include a `BearerAuth` security requirement and a 401 response
- Routes with `auth: 'admin'` additionally include a 403 response
- If no 200 or 201 response is explicitly defined, a default 200 response is added
- `operationId` values are deterministically generated from method + path (e.g., `get_api_health`)
- Tags are sorted alphabetically and include descriptions from the built-in tag description map
- Zod schemas in `requestBody` are converted to JSON Schema via `z.toJSONSchema()` with the `$schema` key stripped; conversion failures fall back to `{ type: 'object' }`
- `handleOpenApiRoutes` returns JSON with `Content-Type: application/json`, `Cache-Control: public, max-age=60`, and `Access-Control-Allow-Origin: *` for `GET /api/openapi.json`
- `handleOpenApiRoutes` returns HTML with `Content-Type: text/html` containing Swagger UI loaded from CDN for `GET /api/docs`
- `handleOpenApiRoutes` returns `null` for any path that is not `/api/openapi.json` or `/api/docs`, and for non-GET methods on those paths
- The OpenAPI spec is cached after first generation and reused for the server process lifetime
- Route definition files exist for all domain areas: agents, algochat, allowlist, analytics, auth, billing, councils, escalation, integrations, marketplace, mcp, mention-polling, plugins, projects, providers, reputation, sandbox, schedules, sessions, system, webhooks, work-tasks, workflows

## Constraints

- The spec uses OpenAPI version 3.0.3, not 3.1
- Swagger UI assets are loaded from CDN (`swagger-ui-dist@5`), requiring internet connectivity
- The generated spec is immutably cached; route changes require a server restart to take effect
- Zod schema conversion depends on `z.toJSONSchema()` from the `zod` library; unsupported Zod types fall back gracefully
- Route metadata is purely declarative; this module does not register or handle actual HTTP routes

## Out of Scope

- Serving multiple API versions or historical spec versions
- WebSocket, SSE, or streaming endpoint documentation
- Live API request execution from within Swagger UI (try-it-out with auth)
- Auto-generating server stubs or client SDKs
- Rate limit or quota documentation per endpoint
- Localization of API descriptions
