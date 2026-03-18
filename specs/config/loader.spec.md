---
module: config-loader
version: 1
status: active
files:
  - server/config/loader.ts
db_tables: []
depends_on: []
---

# Configuration Loader

## Purpose

Loads, validates, and applies defaults to the agent deployment configuration. Supports three loading strategies in priority order: explicit config file path, auto-discovered config file in the working directory (`corvid-agent.config.{ts,js,json}`), or environment variables for backward compatibility with `.env`-based deployments.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `CONFIG_DEFAULTS` | `object` | Default values for optional configuration fields (server, database, work, scheduler, process) |

### Exported Types

| Type | Description |
|------|-------------|
| `ConfigValidationError` | Describes a validation error with `path` (dot-path to field) and `message` (human-readable description) |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `configFromEnv` | `()` | `AgentDeploymentConfig` | Build a full config from environment variables, providing backward compatibility with `.env` deployments |
| `validateConfig` | `(config: AgentDeploymentConfig)` | `ConfigValidationError[]` | Validate a config and return any errors found. Empty array means valid |
| `loadAgentConfig` | `(configPath?: string)` | `Promise<AgentDeploymentConfig>` | Load, validate, and return the agent deployment config using the three-strategy priority chain |

## Invariants

1. **Loading priority**: Explicit path > auto-discovered file > environment variables. The first strategy that yields a config wins
2. **Defaults always applied**: `loadAgentConfig` applies defaults for all optional fields regardless of loading strategy
3. **Validation is non-throwing**: `loadAgentConfig` logs validation warnings but does not throw on validation errors, allowing intentional partial configs (e.g. localhost without API key)
4. **Config file formats**: Supports `.ts`, `.js` (via dynamic import) and `.json` (via `JSON.parse`). TS/JS files must export `default` or named `config`

## Behavioral Examples

### Scenario: Load from environment variables (no config file)

- **Given** no config file exists in the working directory and no explicit path is provided
- **When** `loadAgentConfig()` is called
- **Then** config is built from environment variables via `configFromEnv()`
- **And** defaults are applied for any missing optional fields

### Scenario: Auto-discover config file

- **Given** a `corvid-agent.config.ts` file exists in the working directory
- **When** `loadAgentConfig()` is called without an explicit path
- **Then** the discovered file is loaded and parsed

### Scenario: Validation warnings logged but not thrown

- **Given** a config with an invalid port (e.g. -1)
- **When** `loadAgentConfig()` is called
- **Then** validation warnings are logged
- **And** the config is still returned (no exception thrown)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Explicit config file path does not exist | Throws (file import/read fails) |
| TS/JS config file has no `default` or `config` export | Throws with descriptive error message |
| JSON config file contains invalid JSON | Throws (JSON.parse fails) |
| Validation errors found | Warnings logged, config still returned |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/types/agent-config.ts` | `AgentDeploymentConfig` type |
| `server/lib/logger.ts` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap.ts` | `loadAgentConfig` to initialize server configuration at startup |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3000` | Server port |
| `BIND_HOST` | `127.0.0.1` | Server bind address |
| `API_KEY` | — | API key for authentication |
| `DATABASE_PATH` | `./corvid-agent.db` | SQLite database path |
| `ANTHROPIC_API_KEY` | — | Anthropic provider API key |
| `DEFAULT_MODEL` | `claude-sonnet-4-20250514` | Default LLM model |

See `configFromEnv()` for the full environment variable mapping.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-18 | corvid-agent | Initial spec |
