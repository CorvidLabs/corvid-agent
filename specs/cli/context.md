# CLI — Context

## Why This Module Exists

Operators need a quick way to verify that a corvid-agent deployment is healthy — are all dependencies available? Is the database accessible? Are API keys valid? The CLI doctor command provides a single-command health check that catches common deployment issues before they cause runtime failures.

## Architectural Role

The CLI is a **diagnostic tool** that runs outside the server process. It validates the deployment environment independently, making it useful for both initial setup and ongoing troubleshooting.

## Key Design Decisions

- **Comprehensive checks**: Validates Bun/Node.js versions, database connectivity, AI provider keys, server ports, AlgoChat/Algorand connectivity, and GitHub tokens in one pass.
- **Actionable suggestions**: Each failing check includes a specific fix suggestion, not just a pass/fail status.
- **Independent of server**: Runs as a standalone command, not requiring the server to be running.

## Relationship to Other Modules

- **Config**: Uses the config loader to find and validate configuration.
- **Health**: Complements the runtime health monitor — CLI doctor checks pre-boot health, the health monitor checks runtime health.
