---
module: config/loader
version: 1
status: active
files:
  - server/config/loader.ts
depends_on: []
---

# Config Loader

## Purpose

Loads, validates, and applies defaults to agent deployment configuration. Supports three loading strategies in priority order: explicit config file path, auto-discovered config file in the working directory, and environment variables (backward-compatible with `.env`).

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `configFromEnv` | `()` | `AgentDeploymentConfig` | Builds config entirely from environment variables |
| `validateConfig` | `(config: AgentDeploymentConfig)` | `ConfigValidationError[]` | Validates a deployment config, returns errors found |
| `loadAgentConfig` | `(configPath?: string)` | `Promise<AgentDeploymentConfig>` | Loads, validates, and returns the agent deployment configuration |

### Exported Types

| Type | Description |
|------|-------------|
| `ConfigValidationError` | Validation error with dot-path and message |

### Exported Constants

| Constant | Description |
|----------|-------------|
| `CONFIG_DEFAULTS` | Default values for server, database, work, scheduler, and process config |

## Invariants

1. `loadAgentConfig` always applies defaults before returning — optional fields have safe fallback values.
2. Validation warnings are logged but do not throw — deployments may intentionally omit optional fields.
3. Environment variable loading is fully backward-compatible with `.env.example` mappings.
4. Config file discovery checks `corvid-agent.config.ts`, `.js`, `.json` in that order.
5. Explicit `configPath` takes priority over auto-discovery, which takes priority over env vars.

## Behavioral Examples

### Scenario: No config file, env vars only

- **Given** no config file exists in the working directory
- **When** `loadAgentConfig()` is called without a path
- **Then** config is built from environment variables via `configFromEnv()`

### Scenario: Validation catches missing required fields

- **Given** a config with an empty `agent.name`
- **When** `validateConfig()` is called
- **Then** the result contains an error with path `agent.name`

### Scenario: Non-localhost binding requires API key

- **Given** a config with `server.bindHost` set to `0.0.0.0` and no `server.apiKey`
- **When** `validateConfig()` is called
- **Then** the result contains an error requiring an API key

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Config file missing default/named export | Throws with descriptive message |
| Invalid port (< 0 or > 65535) | Returns validation error at `server.port` |
| No enabled providers | Returns validation error at `providers.enabledProviders` |
| Anthropic enabled without API key | Returns validation error at `providers.anthropic.apiKey` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/types/agent-config` | `AgentDeploymentConfig` type |
| `server/lib/logger` | `createLogger()` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/__tests__/config-loader.test.ts` | `configFromEnv`, `validateConfig`, `loadAgentConfig`, `CONFIG_DEFAULTS` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-18 | corvid-agent | Initial spec — restore 100% spec coverage |
