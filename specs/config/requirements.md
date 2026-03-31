---
spec: loader.spec.md
---

## User Stories

- As an agent operator, I want to configure my deployment with a `corvid-agent.config.ts` file so that I can use typed, version-controlled configuration instead of scattered environment variables
- As an agent operator, I want the config loader to fall back to environment variables when no config file exists so that simple deployments work without creating a config file
- As an agent developer, I want config validation to warn about problems without crashing so that a partially valid config still boots the server while surfacing issues in logs
- As a platform administrator, I want auto-detection of enabled providers based on available API keys so that I do not need to manually list providers
- As an agent operator, I want sensible defaults applied to all optional fields so that I only need to specify values I want to override

## Acceptance Criteria

- `loadAgentConfig()` loads config in priority order: explicit path argument > auto-discovered file in CWD > environment variables
- Config file discovery searches for `corvid-agent.config.ts`, `.js`, `.json` in that order in the current working directory
- Config files must export either `default` or `config`; missing exports throw a descriptive error
- `CONFIG_DEFAULTS` provides defaults for server (port: 3000, bindHost: 127.0.0.1, logLevel: info, logFormat: text), database (path, backupMaxKeep), work, scheduler, and process fields
- Defaults are applied after loading but before validation, ensuring optional fields always have values
- `validateConfig()` returns an array of `ConfigValidationError` objects (empty array means valid) and never throws
- Validation checks: port between 0-65535, non-empty agent name, non-empty default model, at least one enabled provider, anthropic API key present when anthropic provider is enabled, API key required for non-localhost bind, non-empty database path
- `configFromEnv()` auto-detects the anthropic provider when `ANTHROPIC_API_KEY` is set and always includes ollama as a fallback provider
- Validation errors are logged as warnings but do not prevent server startup
- Invalid JSON in a `.json` config file throws a parse error at load time

## Constraints

- Config file formats supported: TypeScript (.ts), JavaScript (.js), JSON (.json)
- Environment variable names follow existing conventions: `PORT`, `BIND_HOST`, `LOG_LEVEL`, `LOG_FORMAT`, `DATABASE_PATH`, `ANTHROPIC_API_KEY`, `DEFAULT_MODEL`, `DEFAULT_PROVIDER`
- The `AgentDeploymentConfig` type from `shared/types/agent-config` is the canonical config shape
- Config loading is async (file imports may be async); callers must `await loadAgentConfig()`

## Out of Scope

- Hot-reloading config changes without server restart
- Config file generation or scaffolding CLI commands
- YAML or TOML config file formats
- Remote config stores (Consul, etcd, etc.)
- Encrypted config values or secret references
