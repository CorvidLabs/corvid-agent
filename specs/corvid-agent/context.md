# Corvid Agent — Context

## Why This Module Exists

This is the main entry point for the corvid-agent server — the HTTP/WebSocket server that coordinates AI agents, on-chain messaging, and multi-agent workflows. It initializes the runtime environment, wires services, and starts listening for requests.

## Architectural Role

Corvid-agent is the **application server** — the top-level composition root that:
1. Validates security configuration on startup
2. Initializes database and runs migrations
3. Bootstraps all services via the bootstrap module
4. Starts the Bun HTTP/WebSocket server
5. Handles graceful shutdown

## Key Design Decisions

- **Security-first startup**: Validates auth config before starting server; exits with code 1 on security errors
- **Bun.serve for HTTP+WebSocket**: Single server handles both protocols with shared middleware
- **Service bootstrap delegation**: All service construction happens in `bootstrap.ts`
- **Graceful shutdown**: SIGTERM/SIGINT handlers close connections and cleanup

## Relationship to Other Modules

- **Bootstrap**: Delegates all service construction
- **Routes**: HTTP request handlers wired into Bun.serve
- **WebSocket Handler**: Real-time connection handler
- **Database**: Connection established and migrations run before services start
- **AlgoChat**: Initialized after DB, before services that depend on it

## Current State

- Single file entry point (~800 lines)
- Exports nothing (top-level script)
- Handles: config validation, DB init, service bootstrap, server start, shutdown
