---
spec: loader.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/config-loader.test.ts` | Unit | `configFromEnv` (provider auto-detection), `validateConfig` (all 9 error conditions), `loadAgentConfig` (explicit path, auto-discovery, env fallback), `CONFIG_DEFAULTS` application |

This module has dedicated, comprehensive unit tests covering all three loading strategies and every validation rule.

## Manual Testing

- [ ] Create a `corvid-agent.config.json` in the project root with a minimal valid config; start the server and verify it uses the file config (log should mention config file loaded)
- [ ] Delete the config file and set `ANTHROPIC_API_KEY` in the environment; start the server and verify it falls back to env-based config
- [ ] Set `BIND_HOST` to `0.0.0.0` without setting `API_KEY`; verify the server logs a warning about missing API key for non-localhost binding
- [ ] Test auto-discovery order: place both `corvid-agent.config.ts` and `corvid-agent.config.json` in cwd; verify `.ts` is loaded (higher priority)

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Config file exports neither `default` nor `config` | Throws error explaining required export shape |
| Config `.json` file contains invalid JSON | Throws `SyntaxError` from JSON.parse |
| `validateConfig` called with valid config | Returns empty array |
| `validateConfig` with `enabledProviders: []` | Returns error at `providers.enabledProviders` |
| `validateConfig` with `enabledProviders: ['anthropic']` and no `anthropic.apiKey` | Returns error at `providers.anthropic.apiKey` |
| `validateConfig` with `port: -1` | Returns error at `server.port` |
| `validateConfig` with `port: 65536` | Returns error at `server.port` |
| `validateConfig` with `port: 0` | Valid (port 0 = OS assigns) |
| `validateConfig` with `port: 65535` | Valid (maximum valid port) |
| `validateConfig` with `bindHost: '0.0.0.0'` and no `apiKey` | Returns error at `server.apiKey` |
| `validateConfig` with `bindHost: '127.0.0.1'` and no `apiKey` | Valid (localhost binding; no API key required) |
| `loadAgentConfig` with validation errors | Errors logged as warnings; config still returned |
| `configFromEnv` with no `ANTHROPIC_API_KEY` | `enabledProviders` contains only `['ollama']` |
| `configFromEnv` with `ANTHROPIC_API_KEY` set | `enabledProviders` contains `['anthropic', 'ollama']` |
| `CONFIG_DEFAULTS` applied when field is missing | Default value appears in returned config |
| `CONFIG_DEFAULTS` not applied when field is explicitly set to `0` | Explicit `0` is NOT overridden by default |
