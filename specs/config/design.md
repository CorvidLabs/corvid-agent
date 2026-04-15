---
spec: loader.spec.md
sources:
  - server/config/loader.ts
---

## Layout

The config module is a single file:

```
server/config/
  loader.ts    — configFromEnv, validateConfig, loadAgentConfig, CONFIG_DEFAULTS, ConfigValidationError
shared/types/
  agent-config.ts    — AgentDeploymentConfig type (the structured config schema)
```

## Components

### loadAgentConfig(configPath?) — Main Entry Point
Three-strategy loading chain (highest priority first):
1. **Explicit path**: If `configPath` is provided, load that file directly
2. **Auto-discovery**: Search cwd for `corvid-agent.config.ts`, then `.js`, then `.json`
3. **Environment variables**: Call `configFromEnv()` as final fallback

After loading, applies `CONFIG_DEFAULTS` for any missing optional fields, then calls `validateConfig` and logs any errors as warnings (does not throw).

### configFromEnv() — Environment Variable Strategy
Builds `AgentDeploymentConfig` from `process.env`. Key auto-detection:
- If `ANTHROPIC_API_KEY` is set → includes `anthropic` in `enabledProviders`
- Always includes `ollama` as a fallback provider
- `DEFAULT_MODEL` and `DEFAULT_PROVIDER` control the agent model selection

### validateConfig(config) — Validation Layer
Returns an array of `ConfigValidationError` (never throws). Checks:
- `agent.name` is non-empty
- `agent.defaultModel` is non-empty
- `providers.enabledProviders` has at least one entry
- If anthropic is enabled, `providers.anthropic.apiKey` must be present
- If `server.bindHost` is not localhost (`127.0.0.1` or `::1`), `server.apiKey` must be set
- `server.port` is in range `[0, 65535]`
- `database.path` is non-empty

### CONFIG_DEFAULTS
Applied to the loaded config object before validation. Covers:
- `server.port = 3000`, `server.bindHost = '127.0.0.1'`, `server.logLevel = 'info'`, `server.logFormat = 'text'`, `server.shutdownGraceMs = 5000`
- `database.backupMaxKeep = 5`
- `work.maxIterations = 50`, `work.maxPerDay = 20`, `work.drainTimeoutMs = 30000`
- `scheduler.pollIntervalMs = 60000`, `scheduler.maxConcurrentExecutions = 3`, `scheduler.minScheduleIntervalMs = 300000`
- `process.maxTurnsBeforeContextReset = 100`, `process.inactivityTimeoutMs = 1800000`

## Tokens

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `BIND_HOST` | `127.0.0.1` | Server bind address |
| `LOG_LEVEL` | `info` | Logging level (`debug`/`info`/`warn`/`error`) |
| `LOG_FORMAT` | `text` | Log format (`text` or `json`) |
| `DATABASE_PATH` | `./corvid-agent.db` | SQLite database file path |
| `ANTHROPIC_API_KEY` | — | Auto-detected; enables anthropic provider |
| `DEFAULT_MODEL` | `claude-sonnet-4-20250514` | Default LLM model |
| `DEFAULT_PROVIDER` | auto-detected | Default LLM provider |

Config file names (auto-discovery order):
1. `corvid-agent.config.ts`
2. `corvid-agent.config.js`
3. `corvid-agent.config.json`

## Assets

### Consumed By
- `server/bootstrap.ts` — calls `loadAgentConfig` during startup
- `server/__tests__/config-loader.test.ts` — full unit test coverage of all three loading strategies and validation rules
