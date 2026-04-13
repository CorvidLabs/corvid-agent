---
module: config-loader
version: 2
status: active
files:
  - server/config/loader.ts
  - server/db/runtime-config.ts
db_tables:
  - runtime_config
depends_on:
  - specs/lib/infra/infra.spec.md
tracks: [1490]
---

# Config Loader

## Purpose

Loads, validates, and applies defaults to agent deployment configuration. Supports three loading strategies in priority order: explicit config file path, auto-discovered config file in the working directory (`corvid-agent.config.{ts,js,json}`), or environment variables. Provides backward compatibility with `.env`-based deployments while enabling structured config files.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `CONFIG_DEFAULTS` | `object` | Default values for optional server (port, bindHost, logLevel, logFormat, shutdownGraceMs), database (path, backupMaxKeep), work (maxIterations, maxPerDay, drainTimeoutMs, queue), scheduler (pollIntervalMs, maxConcurrentExecutions, minScheduleIntervalMs), and process (maxTurnsBeforeContextReset, inactivityTimeoutMs) configuration fields |

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
| `RuntimeConfigKey` | Union of valid runtime config key strings (from `RUNTIME_CONFIG_KEYS`) |

### Runtime Config Exports (`server/db/runtime-config.ts`)

| Export | Kind | Description |
|--------|------|-------------|
| `RUNTIME_CONFIG_KEYS` | `const` | Array of valid runtime config key names |
| `RuntimeConfigKey` | `type` | Union type derived from `RUNTIME_CONFIG_KEYS` |
| `getRuntimeConfig` | `function(db) → Record<string, string>` | Returns all runtime_config rows as key→value map; returns `{}` if table missing |
| `setRuntimeConfigKey` | `function(db, key, value) → void` | Upserts a single runtime config key |
| `updateRuntimeConfigBatch` | `function(db, updates) → number` | Updates multiple keys in one transaction, returns count written |
| `deleteRuntimeConfigKey` | `function(db, key) → boolean` | Deletes a runtime config key, returns true if row existed |

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
- **And** defaults are applied for any missing optional fields

### Scenario: Auto-discovering a config file

- **Given** a file named `corvid-agent.config.json` exists in the current directory
- **When** `loadAgentConfig()` is called without a path argument
- **Then** the JSON file is loaded and parsed as the deployment config

### Scenario: Validation warns but does not throw

- **Given** config has `enabledProviders: ['anthropic']` but no `anthropic.apiKey`
- **When** `validateConfig(config)` is called
- **Then** returns error at path `providers.anthropic.apiKey`

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
| `server/bootstrap` | `loadAgentConfig` to initialize server configuration at startup |
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

## Runtime Config API

Three new endpoints for runtime-safe configuration without `.env` edits:

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/settings/env-status` | operator+ | Returns which env vars are set; secrets masked, safe values shown |
| `GET /api/settings/runtime` | operator+ | Returns current `runtime_config` table as key→value map |
| `PUT /api/settings/runtime` | owner | Updates one or more keys in `runtime_config` |

Valid runtime config keys: `log_level`, `work_max_iterations`, `work_max_per_day`, `agent_timeout_ms`, `ollama_host`, `brave_search_api_key`.

The `runtime_config` table is created by migration `120_runtime_config` (Layer 1 — requires human approval). Until the migration runs, GET endpoints return empty objects and PUT returns a SQLite error.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-18 | corvid-agent | Initial spec |
| 2026-04-13 | jackdaw | Add runtime config API section and runtime-config.ts to files list |
