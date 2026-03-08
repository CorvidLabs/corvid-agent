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
| `dispose` | `()` | `void` | No-op (no cached secrets) |

## Invariants

1. `createKeyProvider` always returns a valid `KeyProvider` implementation
2. `EnvKeyProvider.getEncryptionPassphrase()` throws on testnet/mainnet if WALLET_ENCRYPTION_KEY is not set
3. `EnvKeyProvider.getEncryptionPassphrase()` returns a non-empty string on success
4. `KeyProvider.dispose()` is safe to call multiple times
5. When a `KeyProvider` is passed to `AgentWalletService`, all encrypt/decrypt operations use it instead of config-based passphrase resolution

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
| 2026-03-08 | CorvidAgent | Initial spec — KeyProvider interface + EnvKeyProvider |
