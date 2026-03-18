---
module: config-loader
version: 1
status: active
files:
  - server/config/loader.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# Configuration Loader

## Purpose

Loads, validates, and applies defaults to agent deployment configuration. Supports three loading strategies in priority order: explicit config file path, auto-discovered config file in the working directory (`corvid-agent.config.{ts,js,json}`), or environment variables. Provides backward compatibility with `.env`-based deployments while enabling structured config files.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `CONFIG_DEFAULTS` | `object` | Default values for optional server, database, work, scheduler, and process configuration fields |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `configFromEnv` | `()` | `AgentDeploymentConfig` | Builds config from environment variables, with auto-detection of enabled providers |
| `validateConfig` | `(config: AgentDeploymentConfig)` | `ConfigValidationError[]` | Validates a deployment config, returning any errors found (empty array means valid) |
| `loadAgentConfig` | `(configPath?: string)` | `Promise<AgentDeploymentConfig>` | Main entry point: loads config from file or env, applies defaults, validates, and returns the result |

### Exported Types

| Type | Description |
|------|-------------|
| `ConfigValidationError` | Validation error with `path` (dot-path to field) and `message` (human-readable description) |

## Invariants

1. Loading priority is always: explicit path > auto-discovered file > environment variables.
2. Config file discovery searches for `corvid-agent.config.ts`, `.js`, `.json` in that order.
3. Defaults are applied after loading, before validation — optional fields always have values.
4. Validation errors are logged as warnings but do not throw; the config is still returned.
5. `configFromEnv` auto-detects the anthropic provider when `ANTHROPIC_API_KEY` is set and always includes ollama as a fallback.
6. Port must be between 0 and 65535.
7. An API key is required when binding to a non-localhost address.
8. At least one provider must be enabled.
9. If the anthropic provider is enabled, its API key must be present.
10. Database path is required.

## Behavioral Examples

### Scenario: Load from environment variables (no config file)

- **Given** no explicit config path and no config file in the working directory
- **When** `loadAgentConfig()` is called
- **Then** configuration is built from `process.env` via `configFromEnv()`
- **And** defaults are applied for any missing optional fields

### Scenario: Auto-discovering a config file

- **Given** a file named `corvid-agent.config.json` exists in the current directory
- **When** `loadAgentConfig()` is called without a path argument
- **Then** the JSON file is loaded and parsed as the deployment config

### Scenario: Validation warns but does not throw

- **Given** a config with validation issues (e.g. missing provider API key)
- **When** `loadAgentConfig()` is called
- **Then** warnings are logged
- **And** the config is still returned (no exception thrown)

### Scenario: Config file must have correct export

- **Given** a `.ts` or `.js` config file that exports neither `default` nor `config`
- **When** the file is loaded
- **Then** an error is thrown explaining the required export shape

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Config file does not export `default` or `config` | Throws error |
| Invalid JSON in `.json` config file | Throws parse error |
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
| `shared/types/agent-config` | `AgentDeploymentConfig` type |
| `server/lib/logger` | `createLogger()` |
| `node:fs` | `existsSync` for config file discovery |
| `node:path` | `resolve`, `join` for path resolution |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap` | `loadAgentConfig` to initialize server configuration |
| `server/__tests__/config-loader.test.ts` | All exported functions and types |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `BIND_HOST` | `127.0.0.1` | Server bind address |
| `LOG_LEVEL` | `info` | Logging level |
| `LOG_FORMAT` | `text` | Log output format |
| `DATABASE_PATH` | `./corvid-agent.db` | SQLite database file path |
| `ANTHROPIC_API_KEY` | — | Anthropic provider API key |
| `DEFAULT_MODEL` | `claude-sonnet-4-20250514` | Default LLM model |
| `DEFAULT_PROVIDER` | auto-detected | Default LLM provider |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-18 | corvid-agent | Initial spec |
