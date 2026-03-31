# Routes — Context

## Why This Module Exists

The corvid-agent server exposes a REST API for the dashboard, CLI, and external integrations. The routes module defines all API endpoints, organized by domain (agents, sessions, memories, schedules, etc.), with consistent patterns for authentication, pagination, and error handling.

## Architectural Role

Routes is the **HTTP interface layer** — it sits between middleware (auth, CORS) and business logic (services, DB). Each route handler validates input, calls the appropriate service, and formats the response.

## Key Design Decisions

- **Domain-organized**: Routes are grouped by domain (brain-viewer, dashboard, library, etc.) rather than by HTTP method. This keeps related endpoints together.
- **Dashboard auth guard**: Dashboard endpoints use a separate auth guard from API endpoints, supporting different authentication flows.
- **Read-only dashboard**: Dashboard routes are read-only (GET) by design. Mutations go through the main API endpoints.

## Relationship to Other Modules

- **Middleware**: All routes run after authentication middleware.
- **OpenAPI**: Routes are registered in the route registry for documentation generation.
- **Client**: The Angular frontend consumes these endpoints.
- **DB/Services**: Routes delegate to service modules and DB functions.
