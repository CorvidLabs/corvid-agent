# Config — Context

## Why This Module Exists

corvid-agent needs to run in multiple environments — local development, production servers, CI — each with different settings. The config loader provides a single entry point that resolves configuration from files or environment variables, applies defaults, and validates the result. This eliminates scattered `process.env` reads throughout the codebase.

## Architectural Role

Config is a **boot-time service** — it runs once at startup and provides the resolved configuration to all other modules. It's one of the first things initialized.

## Key Design Decisions

- **Three loading strategies**: Explicit path → auto-discovered file → environment variables. This covers all deployment patterns.
- **Backward compatibility with .env**: Existing `.env`-based deployments continue to work while structured config files are preferred for new setups.
- **Fail-fast validation**: Missing required configuration causes immediate, clear errors at startup rather than cryptic failures at runtime.

## Relationship to Other Modules

- **Every module**: Nearly every server module consumes configuration. The config loader is a foundational dependency.
- **CLI Doctor**: Validates config as part of its health checks.
