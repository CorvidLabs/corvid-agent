---
module: config-loader
version: 1
status: active
files:
  - server/config/loader.ts
db_tables: []
depends_on: []
---

# Config Loader

## Purpose

Configuration loader for agent deployments. Supports three loading strategies in priority order: explicit config file path, auto-discovered config file (`corvid-agent.config.{ts,js,json}`) in the working directory, and environment variables (backward-compatible with `.env` approach). After loading, the config is validated and defaults are applied for optional fields.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `ConfigValidationError` | Validation error with `path` (dot-path to field) and `message` (human-readable description) |

### Exported Constants

| Constant | Description |
|----------|-------------|
| `CONFIG_DEFAULTS` | Default values for server (port, bindHost, logLevel, logFormat, shutdownGraceMs), database (path, backupMaxKeep), work (maxIterations, maxPerDay, drainTimeoutMs, queue), scheduler (pollIntervalMs, maxConcurrentExecutions, minScheduleIntervalMs), and process (maxTurnsBeforeContextReset, inactivityTimeoutMs) |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `configFromEnv` | `()` | `AgentDeploymentConfig` | Build config entirely from environment variables. Provides backward compatibility with `.env` deployments |
| `validateConfig` | `(config: AgentDeploymentConfig)` | `ConfigValidationError[]` | Validate a deployment config, returning errors found. Empty array means valid |
| `loadAgentConfig` | `(configPath?: string)` | `Promise<AgentDeploymentConfig>` | Load, validate, and return the agent deployment configuration using the three-strategy priority chain |

## Invariants

1. **Loading priority**: Explicit `configPath` > auto-discovered config file > environment variables
2. **Auto-discovery order**: Searches for `corvid-agent.config.ts`, then `.js`, then `.json` in the working directory
3. **Defaults always applied**: `applyDefaults` runs on every loaded config regardless of source
4. **Validation is non-fatal**: Validation errors are logged as warnings but do not throw — some deployments intentionally run without an API key on localhost
5. **Provider auto-detection**: If `ENABLED_PROVIDERS` is not set, anthropic is added when `ANTHROPIC_API_KEY` is present, and ollama is always added as fallback
6. **Non-localhost requires API key**: Binding to a non-localhost address without an API key produces a validation error
7. **Config file formats**: `.json` files are parsed with `JSON.parse`; `.ts` and `.js` files are dynamically imported (Bun handles TS natively) and must export `default` or named `config`

## Behavioral Examples

### Scenario: Load from explicit config path

- **Given** `configPath` is `/app/config.json`
- **When** `loadAgentConfig('/app/config.json')` is called
- **Then** loads and parses the JSON file, applies defaults, validates, and returns config

### Scenario: Auto-discover config file

- **Given** no `configPath`, `corvid-agent.config.ts` exists in cwd
- **When** `loadAgentConfig()` is called
- **Then** discovers and loads the `.ts` file

### Scenario: Fall back to environment variables

- **Given** no `configPath`, no config file in cwd
- **When** `loadAgentConfig()` is called
- **Then** builds config from `process.env` via `configFromEnv()`

### Scenario: Validation warns on missing provider key

- **Given** config has `enabledProviders: ['anthropic']` but no `anthropic.apiKey`
- **When** `validateConfig(config)` is called
- **Then** returns error at path `providers.anthropic.apiKey`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Config file exports neither `default` nor `config` | Throws Error |
| Invalid port (negative or > 65535) | Validation error at `server.port` |
| Non-localhost bind without API key | Validation error at `server.apiKey` |
| No enabled providers | Validation error at `providers.enabledProviders` |
| Missing agent name | Validation error at `agent.name` |
| Missing default model | Validation error at `agent.defaultModel` |
| Missing default provider | Validation error at `agent.defaultProvider` |
| Missing database path | Validation error at `database.path` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/types/agent-config` | `AgentDeploymentConfig` type |
| `server/lib/logger` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `loadAgentConfig()` at startup |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-18 | corvid-agent | Initial spec |
