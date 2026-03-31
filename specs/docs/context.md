# Docs — Context

## Why This Module Exists

The REST API and MCP tool catalog need to be discoverable and documented. The docs module auto-generates OpenAPI 3.1 documentation from the route registry and serves a Swagger UI, making the API self-documenting. This helps both developers and agents understand what endpoints are available.

## Architectural Role

Docs is a **meta-service** — it introspects the route registry to generate documentation rather than implementing business logic. It runs alongside the main server.

## Key Design Decisions

- **Auto-generated from registry**: Documentation is derived from code, not maintained separately. This prevents docs from drifting out of sync with the actual API.
- **Swagger UI included**: A built-in UI endpoint means developers can explore the API from a browser without external tools.
- **MCP tool catalog**: Documents not just REST endpoints but also MCP tools available to agents.

## Relationship to Other Modules

- **Routes**: Reads the route registry to enumerate all endpoints.
- **MCP**: Reads MCP tool definitions for the tool catalog.
- **OpenAPI**: The openapi module handles the detailed schema generation; docs provides the serving layer.
