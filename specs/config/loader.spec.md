---
module: config-loader
version: 1
status: draft
files:
  - server/config/loader.ts
db_tables: []
depends_on: []
---

# Configuration Loader

## Purpose

Loads, validates, and applies defaults to the agent deployment configuration. Supports three loading strategies in priority order: explicit file path, auto-discovered config file in the working directory, and environment variables. This provides flexibility for different deployment styles — config files for structured deployments, env vars for backward-compatible `.env`-based setups.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `CONFIG_DEFAULTS` | `object` | Default values for optional configuration fields (server port, bind host, log level, database path, work limits, scheduler intervals, process timeouts). |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `configFromEnv` | _(none)_ | `AgentDeploymentConfig` | Builds a full deployment config from environment variables. Maps every `.env.example` var to the corresponding config field. Auto-detects enabled providers if `ENABLED_PROVIDERS` is not set. |
| `validateConfig` | `config: AgentDeploymentConfig` | `ConfigValidationError[]` | Validates a deployment config. Returns an empty array if valid. Checks required fields (agent name, model, provider), port range, API key requirement for non-localhost binding, and provider key presence. |
| `loadAgentConfig` | `configPath?: string` | `Promise<AgentDeploymentConfig>` | Main entry point. Loads config via the three-strategy priority chain, applies defaults, validates (logs warnings but does not throw), and returns the final config. |

### Exported Types

| Type | Description |
|------|-------------|
| `ConfigValidationError` | `{ path: string; message: string }` — a validation error with the dot-path to the offending field and a human-readable message. |

## Invariants

1. Loading priority: explicit path > auto-discovered file > environment variables. Only one strategy is used per call.
2. Auto-discovery searches for `corvid-agent.config.ts`, `.js`, `.json` in the current working directory, in that order.
3. Config files (`.ts`/`.js`) must export a `default` or named `config` export; otherwise `loadConfigFile` throws.
4. Defaults are applied via nullish coalescing (`??=`) — explicitly-set values (including falsy ones like `0` or `''`) are never overridden.
5. Validation warnings are logged but do not cause `loadAgentConfig` to throw, allowing intentional minimal deployments (e.g., localhost without API key).
6. `configFromEnv` auto-enables `anthropic` provider when `ANTHROPIC_API_KEY` is present and always includes `ollama` as fallback if no `ENABLED_PROVIDERS` are set.

## Behavioral Examples

### Scenario: Load from explicit config path

- **Given** `loadAgentConfig('/path/to/config.ts')` is called
- **When** the file exports a valid config
- **Then** the config is loaded from that file, defaults applied, and validation run

### Scenario: Auto-discover config file

- **Given** `loadAgentConfig()` is called with no path and `corvid-agent.config.json` exists in `process.cwd()`
- **When** the file contains valid JSON
- **Then** the config is loaded from the discovered file

### Scenario: Fall back to environment variables

- **Given** `loadAgentConfig()` is called with no path and no config file exists
- **When** environment variables are set
- **Then** `configFromEnv()` is used to build the config

### Scenario: Validation warnings

- **Given** a config with port `70000` and no API key on a non-localhost bind
- **When** `validateConfig` is called
- **Then** two errors are returned: invalid port and missing API key

### Scenario: Defaults applied to partial config

- **Given** a config file that omits `work` and `scheduler` sections
- **When** `loadAgentConfig` processes it
- **Then** `CONFIG_DEFAULTS.work` and `CONFIG_DEFAULTS.scheduler` values are applied

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Config file does not exist | `loadConfigFile` throws (file not found) |
| Config file has no `default` or `config` export | `loadConfigFile` throws with descriptive message |
| JSON config file has invalid JSON | `JSON.parse` throws |
| Validation errors found | Warnings logged via `log.warn`, config still returned |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/types/agent-config.ts` | `AgentDeploymentConfig` type definition |
| `server/lib/logger.ts` | `createLogger` for structured logging |
| `node:fs` | `existsSync` for config file discovery |
| `node:path` | `resolve`, `join` for path resolution |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap.ts` | Calls `loadAgentConfig` at startup |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| _(all `.env` vars)_ | _(see CONFIG_DEFAULTS)_ | Full env var mapping is in `configFromEnv()` — see source for complete list |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-18 | corvid-agent | Initial spec — close 447/448 coverage gap |
