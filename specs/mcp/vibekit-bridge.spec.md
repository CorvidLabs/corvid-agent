---
module: vibekit-bridge
version: 1
status: draft
files:
  - server/mcp/vibekit-bridge.ts
db_tables: []
depends_on:
  - specs/mcp/external-client.spec.md
---

# VibeKit MCP Bridge

## Purpose

Provides a pre-configured bridge to the VibeKit MCP server for Algorand smart contract operations. Builds an `McpServerConfig` that can be passed to `ExternalMcpClientManager.connectAll()`. VibeKit is optional -- if not installed, the bridge gracefully returns null.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `buildVibeKitConfig` | `(agentId: string \| null, envConfig?: VibeKitEnvConfig)` | `McpServerConfig` | Build a VibeKit MCP server config with the given agent ID and optional environment overrides. |
| `detectVibeKit` | (none) | `Promise<string \| null>` | Check if the VibeKit CLI is installed. Returns the version string, or null if not available. |
| `buildVibeKitConfigIfAvailable` | `(agentId: string \| null, envConfig?: VibeKitEnvConfig)` | `Promise<McpServerConfig \| null>` | Detect VibeKit and build config only if installed. Returns null when unavailable. |

### Exported Types

| Type | Description |
|------|-------------|
| `VibeKitEnvConfig` | Environment configuration for VibeKit: network, custom Algod/Indexer URLs and tokens. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `VIBEKIT_TOOL_CATEGORIES` | `Record<string, readonly string[]>` | Well-known VibeKit tool names grouped by category (contracts, assets, accounts, state, indexer, transactions, utilities). |
| `ALL_VIBEKIT_TOOLS` | `readonly string[]` | Flat array of all known VibeKit tool names. |

## Invariants

1. `buildVibeKitConfig` always returns a valid `McpServerConfig` with `name: 'vibekit'`, `command: 'vibekit'`, and `args: ['mcp']`.
2. The config ID follows the pattern `vibekit-<agentId>` or `vibekit-global` when agentId is null.
3. `detectVibeKit` never throws -- returns null when the CLI is not found or the process fails.
4. `buildVibeKitConfigIfAvailable` returns null when VibeKit is not installed.
5. Network defaults to testnet when no explicit configuration is provided.
6. Environment variables `VIBEKIT_NETWORK` and `ALGORAND_NETWORK` are checked as fallbacks (in that order) when `envConfig.network` is not set.
7. `ALL_VIBEKIT_TOOLS` contains no duplicates.

## Behavioral Examples

### Scenario: Building config with defaults
- **Given** no envConfig is provided and `ALGORAND_NETWORK` is not set
- **When** `buildVibeKitConfig('agent-1')` is called
- **Then** the returned config has `envVars.ALGORAND_NETWORK === 'testnet'` and `agentId === 'agent-1'`.

### Scenario: VibeKit is not installed
- **Given** the `vibekit` command is not on PATH
- **When** `buildVibeKitConfigIfAvailable('agent-1')` is called
- **Then** it returns null without throwing.

### Scenario: Custom Algod endpoint
- **Given** `envConfig.algodUrl` is `'https://custom-algod.example.com'`
- **When** `buildVibeKitConfig('agent-1', envConfig)` is called
- **Then** the returned config has `envVars.ALGOD_SERVER === 'https://custom-algod.example.com'`.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| VibeKit CLI not installed | `detectVibeKit` returns null, `buildVibeKitConfigIfAvailable` returns null |
| VibeKit CLI exits with non-zero code | `detectVibeKit` returns null |
| VibeKit CLI spawn fails (e.g. permission denied) | `detectVibeKit` returns null |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/types` | `McpServerConfig` interface |
| `server/lib/logger` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/direct-process` | Can include VibeKit config in `externalMcpConfigs` |
| `cli/commands/init` | Detects VibeKit during MCP setup |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `VIBEKIT_NETWORK` | (none) | Override Algorand network for VibeKit |
| `ALGORAND_NETWORK` | `testnet` | Fallback network when VIBEKIT_NETWORK is not set |
| `VIBEKIT_ALGOD_URL` | (none) | Custom Algod server URL |
| `VIBEKIT_ALGOD_TOKEN` | (none) | Custom Algod server token |
| `VIBEKIT_INDEXER_URL` | (none) | Custom Indexer server URL |
| `VIBEKIT_INDEXER_TOKEN` | (none) | Custom Indexer server token |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-21 | corvid-agent | Initial spec |
