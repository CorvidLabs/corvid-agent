# Plugins — Context

## Why This Module Exists

The platform needs to be extensible without modifying core code. The plugin system allows loading external modules that register new capabilities (tools, routes, event handlers) at runtime. This enables third-party extensions and keeps optional features out of the core.

## Architectural Role

Plugins is an **extension framework** — it provides the loader, registry, and permission model for external code.

## Key Design Decisions

- **Capability-based permissions**: Plugins declare what capabilities they need; the system grants them explicitly. Plugins can't access anything they haven't been granted.
- **Registry pattern**: Plugins register themselves with a central registry, making discovery and lifecycle management uniform.
- **Database-tracked**: Plugin state (installed, enabled, version) is tracked in SQLite for persistence across restarts.

## Relationship to Other Modules

- **MCP**: Plugins can register new MCP tools.
- **Routes**: Plugins can register new API routes.
- **Permissions**: Plugin capabilities are gated by the permission system.
- **DB**: Plugin metadata stored in `plugins` and `plugin_capabilities` tables.
