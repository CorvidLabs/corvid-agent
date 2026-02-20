---
module: algochat-config
version: 1
status: active
files:
  - server/algochat/config.ts
db_tables: []
depends_on: []
---

# AlgoChat Config

## Purpose

Loads and caches AlgoChat configuration from environment variables. Handles Algorand network selection, mnemonic parsing, PSK contact URI parsing, and owner address validation. Configuration is loaded once and cached for the process lifetime.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `PSKContactConfig` | Pre-configured PSK contact from environment: `{ address, psk: Uint8Array, label? }` |
| `AlgoChatConfig` | Full configuration object: mnemonic, network, syncInterval, defaultAgentId, enabled flag, pskContact, ownerAddresses |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `loadAlgoChatConfig` | `()` | `AlgoChatConfig` | Load config from env vars (cached after first call) |
| `parseOwnerAddresses` | `(network: AlgoChatNetwork)` | `Set<string>` | Parse and validate ALGOCHAT_OWNER_ADDRESSES. Exported for testing |

## Invariants

1. **Config caching**: `loadAlgoChatConfig` returns a cached singleton after the first call. Configuration is immutable for the process lifetime
2. **Mainnet owner requirement**: On `mainnet`, if no valid `ALGOCHAT_OWNER_ADDRESSES` are configured, `parseOwnerAddresses` calls `process.exit(1)` — refusing to start with open privileged commands
3. **Address normalization**: Owner addresses are uppercased for case-insensitive matching
4. **Address validation**: Each owner address is validated with `isValidAddress()` from algosdk. Invalid addresses are logged and skipped
5. **Network fallback**: Without a mnemonic, network defaults to `localnet` (unless explicitly `mainnet`)
6. **Enabled logic**: AlgoChat is enabled if a mnemonic is provided OR if network is `localnet`
7. **PSK URI format**: `algochat-psk://v1?addr=ADDRESS&psk=BASE64URL_PSK&label=LABEL`. PSK must decode to exactly 32 bytes
8. **Sync interval default**: Falls back to 30,000ms if `ALGOCHAT_SYNC_INTERVAL` is not a valid number

## Behavioral Examples

### Scenario: Standard mainnet config

- **Given** `ALGOCHAT_MNEMONIC` is set, `ALGORAND_NETWORK=mainnet`, `ALGOCHAT_OWNER_ADDRESSES=ADDR1,ADDR2`
- **When** `loadAlgoChatConfig()` is called
- **Then** returns config with `enabled: true`, `network: 'mainnet'`, 2 owner addresses

### Scenario: Mainnet without owner addresses

- **Given** `ALGORAND_NETWORK=mainnet`, `ALGOCHAT_OWNER_ADDRESSES` is empty
- **When** `loadAlgoChatConfig()` is called
- **Then** `process.exit(1)` is called — fatal error

### Scenario: Localnet without mnemonic

- **Given** no `ALGOCHAT_MNEMONIC` set, no `ALGORAND_NETWORK` set
- **When** `loadAlgoChatConfig()` is called
- **Then** returns config with `enabled: true` (localnet default), `network: 'localnet'`

### Scenario: PSK URI parsing

- **Given** `ALGOCHAT_PSK_URI=algochat-psk://v1?addr=ABC123&psk=dGVzdC4...&label=MyPhone`
- **When** config is loaded
- **Then** `pskContact` is set with decoded 32-byte PSK and label "MyPhone"

### Scenario: Invalid PSK URI (wrong key length)

- **Given** `ALGOCHAT_PSK_URI` with a PSK that decodes to 16 bytes
- **When** config is loaded
- **Then** `pskContact` is `null`, warning logged: "psk must be 32 bytes"

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No mnemonic on non-mainnet | AlgoChat enabled in localnet mode |
| No owner addresses on mainnet | `process.exit(1)` — fatal |
| No owner addresses on testnet/localnet | Warning logged, privileged commands disabled |
| Invalid owner address (fails checksum) | Skipped with error log |
| Invalid PSK URI (missing addr/psk) | `pskContact` set to `null`, warning logged |
| PSK not 32 bytes | `pskContact` set to `null`, warning logged |
| PSK URI parse failure | `pskContact` set to `null`, warning logged |
| Invalid sync interval | Falls back to 30,000ms |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `algosdk` | `isValidAddress` for owner address validation |
| `shared/types` | `AlgoChatNetwork` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `loadAlgoChatConfig()` at startup to configure AlgoChat |
| `server/algochat/bridge.ts` | `AlgoChatConfig` type for constructor parameter |
| `server/process/manager.ts` | Reads `config.ownerAddresses` for credit exemption |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `ALGOCHAT_MNEMONIC` | (none) | 25-word Algorand mnemonic for on-chain identity |
| `ALGORAND_NETWORK` | `localnet` | Algorand network: `localnet`, `testnet`, `mainnet` |
| `AGENT_NETWORK` | `localnet` | Agent network (may differ from Algorand network) |
| `ALGOCHAT_SYNC_INTERVAL` | `30000` | Polling interval in milliseconds |
| `ALGOCHAT_DEFAULT_AGENT_ID` | (none) | Default agent ID for AlgoChat conversations |
| `ALGOCHAT_PSK_URI` | (none) | Pre-shared key contact URI |
| `ALGOCHAT_OWNER_ADDRESSES` | (none) | Comma-separated Algorand addresses for privileged access |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
