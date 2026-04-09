---
module: key-provider
version: 1
status: draft
files:
  - server/lib/key-provider.ts
depends_on:
  - server/lib/crypto.ts
  - server/lib/logger.ts
---

# Key Provider

## Purpose

Abstraction layer for wallet encryption key management. Decouples the encryption passphrase retrieval from environment variables, enabling future integrations with AWS Secrets Manager, HashiCorp Vault, or similar KMS backends. The default `EnvKeyProvider` preserves existing behavior.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createKeyProvider` | `(network?: string, serverMnemonic?: string \| null)` | `KeyProvider` | Factory that returns the appropriate provider based on config |
| `assertProductionReady` | `(keyProvider: KeyProvider \| null, network: string)` | `Promise<void>` | Validates KeyProvider is configured with a strong passphrase on testnet/mainnet; no-op on localnet |
| `detectPlaintextKeyConfig` | `(network: string)` | `string[]` | Scans env for plaintext key issues; returns warning messages. No-op on localnet |

### Exported Types

| Type | Description |
|------|-------------|
| `KeyProvider` | Interface for resolving the wallet encryption passphrase |

### Exported Classes

| Class | Description |
|-------|-------------|
| `EnvKeyProvider` | Default provider — resolves passphrase from WALLET_ENCRYPTION_KEY env var |

#### KeyProvider Interface Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getEncryptionPassphrase` | `()` | `Promise<string>` | Retrieve the encryption passphrase for mnemonic encrypt/decrypt |
| `dispose` | `()` | `void` | Clean up cached key material or connections |

#### EnvKeyProvider Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getEncryptionPassphrase` | `()` | `Promise<string>` | Delegates to crypto.ts getEncryptionPassphrase() |
| `getNetwork` | `()` | `string` | Returns the configured network |
| `dispose` | `()` | `void` | No-op (no cached secrets) |

## Invariants

1. `createKeyProvider` always returns a valid `KeyProvider` implementation
2. `EnvKeyProvider.getEncryptionPassphrase()` throws on testnet/mainnet if WALLET_ENCRYPTION_KEY is not set
3. `EnvKeyProvider.getEncryptionPassphrase()` returns a non-empty string on success
4. `KeyProvider.dispose()` is safe to call multiple times
5. When a `KeyProvider` is passed to `AgentWalletService`, all encrypt/decrypt operations use it instead of config-based passphrase resolution
6. `assertProductionReady` is a no-op on localnet
7. `assertProductionReady` throws if no KeyProvider is supplied on testnet/mainnet
8. `assertProductionReady` throws if WALLET_ENCRYPTION_KEY is missing or shorter than 32 chars on non-localnet
9. `ALLOW_PLAINTEXT_KEYS` is deprecated and ignored — mainnet requires WALLET_ENCRYPTION_KEY (#924)
10. `detectPlaintextKeyConfig` returns no warnings on localnet
11. `AgentWalletService` legacy fallback (no KeyProvider) is only allowed on localnet; throws on testnet/mainnet

## Behavioral Examples

### Scenario: Default provider on localnet

- **Given** no KMS configuration is set in env
- **When** `createKeyProvider('localnet', null)` is called
- **Then** an `EnvKeyProvider` is returned
- **And** `getEncryptionPassphrase()` returns the default localnet key

### Scenario: Explicit encryption key

- **Given** `WALLET_ENCRYPTION_KEY` is set to a 64-char hex string
- **When** `createKeyProvider('testnet', null)` is called
- **Then** `getEncryptionPassphrase()` returns the env var value

### Scenario: Missing key on mainnet

- **Given** `WALLET_ENCRYPTION_KEY` is not set
- **When** `createKeyProvider('mainnet', null)` is called and `getEncryptionPassphrase()` is invoked
- **Then** an error is thrown requiring WALLET_ENCRYPTION_KEY

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No WALLET_ENCRYPTION_KEY on testnet/mainnet | Throws with setup instructions |
| Short WALLET_ENCRYPTION_KEY on non-localnet | Logs warning, returns key |
| `assertProductionReady` with null provider on testnet/mainnet | Throws requiring KeyProvider |
| `assertProductionReady` with missing WALLET_ENCRYPTION_KEY on testnet/mainnet | Throws requiring explicit env var |
| `assertProductionReady` with short WALLET_ENCRYPTION_KEY on mainnet | Throws requiring >= 32 chars |
| `assertProductionReady` with provider that returns short passphrase | Throws describing length requirement |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/crypto.ts` | `getEncryptionPassphrase()` |
| `server/lib/logger.ts` | `createLogger()` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/agent-wallet.ts` | `KeyProvider` interface for encrypt/decrypt passphrase |
| `server/algochat/init.ts` | `createKeyProvider()` factory |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `WALLET_ENCRYPTION_KEY` | localnet default | Passphrase for AES-256-GCM mnemonic encryption |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-12 | CorvidAgent | #924 — remove ALLOW_PLAINTEXT_KEYS, add detectPlaintextKeyConfig, enforce KeyProvider on non-localnet |
| 2026-03-08 | CorvidAgent | Initial spec — KeyProvider interface + EnvKeyProvider |
