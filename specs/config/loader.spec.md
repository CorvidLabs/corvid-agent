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

Configuration loader for agent deployments. Supports three loading strategies in priority order: explicit config file path, auto-discovered config file in the working directory (`corvid-agent.config.{ts,js,json}`), or environment variables. After loading, the config is validated and defaults are applied for optional fields.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `CONFIG_DEFAULTS` | `object` | Default values for optional server, database, work, scheduler, and process configuration fields |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `configFromEnv` | `()` | `AgentDeploymentConfig` | Builds config from environment variables, providing backward compatibility with `.env` deployments |
| `validateConfig` | `(config: AgentDeploymentConfig)` | `ConfigValidationError[]` | Validates a deployment config, returning any errors found (empty array means valid) |
| `loadAgentConfig` | `(configPath?: string)` | `Promise<AgentDeploymentConfig>` | Main entry point: loads, validates, and returns the agent deployment configuration |

### Exported Types

| Type | Description |
|------|-------------|
| `ConfigValidationError` | Validation error with `path` (dot-path to field) and `message` (human-readable description) |

## Invariants

1. Loading priority is always: explicit path > auto-discovered file > environment variables
2. Defaults are applied after loading, before returning — optional fields always have values
3. Validation warnings are logged but never throw — deployments may intentionally omit optional fields
4. Auto-discovery searches for `corvid-agent.config.ts`, `.js`, `.json` in that order
5. When binding to a non-localhost address, an API key is required

## Behavioral Examples

### Scenario: Load from environment variables (no config file)

- **Given** no explicit config path and no config file in the working directory
- **When** `loadAgentConfig()` is called
- **Then** configuration is built from `process.env` via `configFromEnv()`
- **And** defaults are applied for any missing optional fields

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
| Config file missing default/config export | Throws error |
| Invalid JSON in `.json` config file | Throws parse error |
| Validation failures | Logs warnings, returns config anyway |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/types/agent-config` | `AgentDeploymentConfig` type |
| `server/lib/logger` | `createLogger()` |

### Consumed By

| Module | What is used |
|--------|-------------|
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
