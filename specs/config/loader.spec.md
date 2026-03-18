---
module: config-loader
version: 1
status: draft
files:
  - server/config/loader.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# Config Loader

## Purpose

Loads, validates, and applies defaults to agent deployment configuration. Supports three loading strategies in priority order: explicit config file path, auto-discovered config file in the working directory, and environment variables. Provides backward compatibility with `.env`-based deployments while enabling structured config files (`.ts`, `.js`, `.json`).

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `configFromEnv` | _(none)_ | `AgentDeploymentConfig` | Builds a full deployment config from environment variables, with auto-detection of enabled providers |
| `validateConfig` | `config: AgentDeploymentConfig` | `ConfigValidationError[]` | Validates a deployment config and returns an array of errors (empty means valid) |
| `loadAgentConfig` | `configPath?: string` | `Promise<AgentDeploymentConfig>` | Main entry point: loads config from file or env, applies defaults, validates, and returns the result |

### Exported Types

| Type | Description |
|------|-------------|
| `ConfigValidationError` | Interface with `path` (dot-path to field) and `message` (human-readable error description) |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `CONFIG_DEFAULTS` | `object` | Default values for optional configuration fields: server, database, work, scheduler, and process settings |

## Invariants

1. Loading priority is always: explicit path > auto-discovered file > environment variables.
2. Config file discovery searches for `corvid-agent.config.ts`, `.js`, `.json` in that order.
3. Defaults are always applied after loading, before validation.
4. Validation errors are logged as warnings but do not throw; the config is still returned.
5. `configFromEnv` auto-detects the anthropic provider when `ANTHROPIC_API_KEY` is set and always includes ollama as a fallback.
6. Port must be between 0 and 65535.
7. An API key is required when binding to a non-localhost address.
8. At least one provider must be enabled.
9. If the anthropic provider is enabled, its API key must be present.
10. Database path is required.

## Behavioral Examples

### Scenario: Loading from environment variables when no config file exists

- **Given** no config file in the working directory and no explicit path
- **When** `loadAgentConfig()` is called
- **Then** the config is built from environment variables via `configFromEnv`, defaults are applied, and the result is returned

### Scenario: Auto-discovering a config file

- **Given** a file named `corvid-agent.config.json` exists in the current directory
- **When** `loadAgentConfig()` is called without a path argument
- **Then** the JSON file is loaded and parsed as the deployment config

### Scenario: Validation warns but does not throw

- **Given** a config where `server.bindHost` is `0.0.0.0` and `server.apiKey` is undefined
- **When** `validateConfig(config)` is called
- **Then** it returns an error for `server.apiKey` but `loadAgentConfig` still returns the config

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Config file does not export `default` or `config` | `loadConfigFile` throws an Error |
| Agent name is empty | `validateConfig` returns error at path `agent.name` |
| Default model is empty | `validateConfig` returns error at path `agent.defaultModel` |
| No enabled providers | `validateConfig` returns error at path `providers.enabledProviders` |
| Anthropic enabled without API key | `validateConfig` returns error at path `providers.anthropic.apiKey` |
| Non-localhost bind without API key | `validateConfig` returns error at path `server.apiKey` |
| Port out of range | `validateConfig` returns error at path `server.port` |
| Database path is empty | `validateConfig` returns error at path `database.path` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger` | `createLogger` for structured logging |
| `shared/types/agent-config` | `AgentDeploymentConfig` type |
| `node:fs` | `existsSync` for config file discovery |
| `node:path` | `resolve`, `join` for path resolution |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap` | `loadAgentConfig` to initialize server configuration |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-18 | corvid-agent | Initial spec |
