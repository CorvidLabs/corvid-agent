# OpenAPI — Context

## Why This Module Exists

The corvid-agent REST API needs machine-readable documentation for client generation, testing tools, and developer onboarding. The OpenAPI module generates a complete OpenAPI 3.1 specification from the route registry, with per-domain route files that document each API area.

## Architectural Role

OpenAPI is a **documentation generation module** — it introspects the codebase to produce an API specification. The `docs` module serves this spec via Swagger UI.

## Key Design Decisions

- **Per-domain route files**: Route documentation is split by domain (agents, algochat, billing, councils, etc.) rather than one giant file. This keeps each file focused and maintainable.
- **Registry-driven**: Route definitions are registered in a central registry, and the OpenAPI generator reads from it. This ensures the spec matches the actual implementation.
- **OpenAPI 3.1**: Uses the latest OpenAPI version for JSON Schema compatibility.

## Relationship to Other Modules

- **Routes**: Reads route definitions from the registry.
- **Docs**: The docs module serves the generated spec via Swagger UI.
- **Middleware**: Documents authentication requirements in the spec.
