# Bootstrap — Context

## Why This Module Exists

The corvid-agent server requires wiring together dozens of services with complex interdependencies. The bootstrap module centralizes service construction, dependency injection, and lifecycle management to keep the main entry point (`server/index.ts`) thin and readable.

## Architectural Role

Bootstrap is a **composition root** — it constructs and wires all application services without containing business logic itself. This pattern enables:
- Clear dependency graph visualization
- Easy testing via service mocking
- Consistent initialization ordering

## Key Design Decisions

- **Pure construction**: Bootstrap only creates services; it doesn't start them
- **Service references returned**: Callers receive initialized service instances to manage lifecycles
- **Database passed in**: Connection is established before bootstrap, avoiding circular deps
- **AlgoChat services wired separately**: Pre-initialized AlgoChat services are passed in to avoid init-order issues

## Relationship to Other Modules

- **Index**: Consumes all bootstrapped services to start HTTP server and WebSocket handler
- **All services**: Every major service is constructed here (ProcessManager, SchedulerService, etc.)
- **Database**: Receives open DB connection, passes to services that need it

## Current State

- Single export: `bootstrapServices()` function
- ~30 services wired together
- No tests specifically for bootstrap (integration tests cover indirectly)
