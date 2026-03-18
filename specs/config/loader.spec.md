---
module: config-loader
version: 1
status: draft
files:
  - server/config/loader.ts
---

# Configuration Loader

## Purpose

Loads, validates, and applies defaults to agent deployment configuration. Supports three loading strategies in priority order: explicit config file path, auto-discovered config file in the working directory, and environment variables (backward-compatible with `.env` deployments).

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `CONFIG_DEFAULTS` | `object` (as const) | Default values for optional configuration fields, organized by section: `server` (port 3000, bindHost 127.0.0.1, logLevel info, logFormat text, shutdownGraceMs 30s), `database` (path ./corvid-agent.db, backupMaxKeep 10), `work` (maxIterations 3, maxPerDay 100, drainTimeoutMs 5min, queue concurrency 2 / poll 5s), `scheduler` (poll 30s, maxConcurrent 2, minInterval 5min), `process` (maxTurns 8, inactivityTimeout 30min). |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `configFromEnv` | — | `AgentDeploymentConfig` | Builds a complete deployment config from `process.env`. Maps every env var from `.env.example` to the corresponding config field. Auto-detects enabled providers when `ENABLED_PROVIDERS` is not set (adds `anthropic` if `ANTHROPIC_API_KEY` present, always adds `ollama` as fallback). Parses comma-separated lists for multi-value fields. |
| `validateConfig` | `config: AgentDeploymentConfig` | `ConfigValidationError[]` | Validates a deployment config, returning an array of errors (empty means valid). Checks required fields (agent name, defaultModel, defaultProvider), server port range (0-65535), API key requirement for non-localhost binds, at least one enabled provider, Anthropic API key when anthropic is enabled, and database path presence. |
| `loadAgentConfig` | `configPath?: string` | `Promise<AgentDeploymentConfig>` | Main entry point. Loads config using three strategies in priority order: (1) explicit `configPath`, (2) auto-discovered `corvid-agent.config.{ts,js,json}` in cwd, (3) environment variables. Applies defaults for optional fields and validates the result. Logs validation warnings but does not throw on validation failures. |

### Exported Types

| Type | Description |
|------|-------------|
| `ConfigValidationError` | Validation error with `path` (dot-path to offending field, e.g. `'server.port'`) and `message` (human-readable description). |

## Invariants

1. Loading strategy priority is always: explicit path > auto-discovered file > environment variables. A later strategy is only used if the prior one does not apply.
2. Auto-discovery searches for config files in this exact order: `corvid-agent.config.ts`, `corvid-agent.config.js`, `corvid-agent.config.json`. The first match wins.
3. Config files (`.ts` / `.js`) must export either a `default` or named `config` export; otherwise `loadConfigFile` throws.
4. `applyDefaults` mutates the config in place using nullish coalescing (`??=`), so explicitly-set falsy values like `0` are preserved.
5. Validation errors are logged as warnings but never cause `loadAgentConfig` to throw — some deployments intentionally omit fields (e.g. no API key on localhost).
6. `configFromEnv` always includes `ollama` in `enabledProviders` as a fallback when `ENABLED_PROVIDERS` is not set.
7. `CONFIG_DEFAULTS` is frozen (`as const`) and must not be mutated at runtime.

## Behavioral Examples

### Scenario: Load config from explicit file path
- **Given** `loadAgentConfig('/path/to/config.ts')` is called
- **When** the file exports a valid `AgentDeploymentConfig` as default export
- **Then** that config is loaded, defaults are applied, validation runs, and the config is returned

### Scenario: Auto-discover config file
- **Given** `loadAgentConfig()` is called with no arguments
- **When** `corvid-agent.config.ts` exists in the current working directory
- **Then** that file is loaded instead of falling back to environment variables

### Scenario: Fall back to environment variables
- **Given** `loadAgentConfig()` is called with no arguments
- **When** no config file exists in the working directory
- **Then** `configFromEnv()` is used to build the config from `process.env`

### Scenario: Environment variable provider auto-detection
- **Given** `ENABLED_PROVIDERS` is not set and `ANTHROPIC_API_KEY` is set
- **When** `configFromEnv()` is called
- **Then** `enabledProviders` contains both `'anthropic'` and `'ollama'`

### Scenario: Defaults applied for missing optional fields
- **Given** a config with no `scheduler` section
- **When** `loadAgentConfig` applies defaults
- **Then** `scheduler.pollIntervalMs` is `30_000`, `maxConcurrentExecutions` is `2`, `minScheduleIntervalMs` is `300_000`

### Scenario: Validation warns but does not throw
- **Given** a config with `server.port = -1`
- **When** `loadAgentConfig` runs validation
- **Then** a warning is logged with the port error but the config is still returned

### Scenario: JSON config file loading
- **Given** `loadAgentConfig('/path/to/config.json')` is called
- **When** the file contains valid JSON
- **Then** it is parsed via `JSON.parse` and returned as `AgentDeploymentConfig`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Config file path provided but file does not exist | Throws (file read fails) |
| `.ts` / `.js` config file has no `default` or `config` export | Throws with descriptive message |
| `.json` config file contains invalid JSON | Throws (JSON.parse error) |
| `agent.name` is empty | Returns validation error `{ path: 'agent.name', message: 'Agent name is required' }` |
| `server.port` outside 0-65535 | Returns validation error for `server.port` |
| Non-localhost `bindHost` without `apiKey` | Returns validation error for `server.apiKey` |
| No enabled providers | Returns validation error for `providers.enabledProviders` |
| Anthropic provider enabled without API key | Returns validation error for `providers.anthropic.apiKey` |
| No database path | Returns validation error for `database.path` |
| `configFromEnv` with no env vars set | Returns config with defaults; `enabledProviders` contains only `['ollama']` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `lib/logger` | `createLogger` for structured logging |
| `shared/types/agent-config` | `AgentDeploymentConfig` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `bootstrap` | `loadAgentConfig` to initialize server configuration at startup |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-18 | corvid-agent | Initial spec |
