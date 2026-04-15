---
spec: key-provider.spec.md
sources:
  - server/lib/crypto.ts
  - server/lib/secure-mnemonic.ts
  - server/lib/secure-wipe.ts
  - server/lib/wallet-keystore.ts
  - server/lib/key-rotation.ts
  - server/lib/env-encryption.ts
  - server/lib/key-provider.ts
---

## Layout

Crypto module spans several files under `server/lib/`:
- `crypto.ts` — core AES-256-GCM encrypt/decrypt, mnemonic redaction, log sanitization
- `secure-wipe.ts` — `wipeBuffer`, `wipeBuffers`, `withSecureBuffer` for safe key material cleanup
- `secure-mnemonic.ts` — `looksLikeMnemonic`, `sanitizeLogMessage` helpers
- `wallet-keystore.ts` — file-backed keystore with atomic write and 0o600 permissions
- `key-rotation.ts` — `rotateWalletEncryptionKey` for re-encrypting all wallets under new passphrase
- `env-encryption.ts` — `encryptEnvVars`, `decryptEnvVars`, `isEncrypted` for env_vars at-rest encryption
- `key-provider.ts` — `KeyProvider` abstraction layer and `EnvKeyProvider` default implementation

## Components

### crypto.ts (core encryption)
Two format versions:
- **v2 (current):** AES-256-GCM, PBKDF2 600k iterations, per-entry random salt (16 bytes) + IV (12 bytes). Format: `base64(salt + iv + ciphertext)`
- **v1 (legacy):** same algorithm, static salt, 100k iterations. Decryption falls back to v1 after v2 failure

Web Crypto API (`crypto.subtle`) used for async encrypt/decrypt. All intermediate buffers wiped in `finally` blocks.

### secure-wipe.ts
Defeats dead-store elimination by writing random bytes before zeroing. Guard clause for null/undefined inputs. `withSecureBuffer` provides RAII-style cleanup.

### wallet-keystore.ts
JSON file at `WALLET_KEYSTORE_PATH` (default `./wallet-keystore.json`):
- Permissions verified (0o600) on every read; auto-fixed if too permissive
- Writes are atomic: write to `.tmp` then rename
- Returns empty object on any read error (missing file, bad permissions, invalid JSON)

### key-rotation.ts
All-or-nothing rotation:
1. Decrypt all wallets (DB + keystore) with old passphrase
2. Re-encrypt all with new passphrase
3. Round-trip verification for each entry
4. Atomic commit of all entries
5. Audit log via `recordAudit`

Guards: new passphrase must differ from old; must be ≥ 32 chars.

### env-encryption.ts
Uses synchronous `node:crypto` (not Web Crypto) to avoid async cascades in DB accessors. Format: `"enc:" + base64(salt + iv + authTag + ciphertext)`. Skips encryption for `'{}'` (no secrets).

### key-provider.ts (abstraction layer)
`KeyProvider` interface with `getEncryptionPassphrase()` and `dispose()`. Enables future KMS/Vault integrations without changing callers. `EnvKeyProvider` is the current default.

`createKeyProvider(network, serverMnemonic)` is the factory used at server startup. `assertProductionReady` validates key strength before going live on testnet/mainnet.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| PBKDF2 iterations (v2) | 600,000 | Current format; high iteration count for key stretching |
| PBKDF2 iterations (v1 legacy) | 100,000 | Legacy format for backward compatibility decryption |
| Salt length | 16 bytes | Random per-encryption salt |
| IV length | 12 bytes | Random per-encryption IV |
| Minimum passphrase length | 32 chars | For non-localnet networks; shorter keys emit a warning |
| `ENCRYPTED_PREFIX` | `'enc:'` | Marks encrypted env_vars blobs |
| Keystore file permissions | `0o600` | Owner read/write only |

## Assets

**Env vars:**
- `WALLET_ENCRYPTION_KEY` — required for testnet/mainnet; optional on localnet (uses default key)
- `WALLET_KEYSTORE_PATH` — path to keystore JSON file (default: `./wallet-keystore.json`)

**DB tables accessed:**
- `agents` (via `key-rotation.ts`) — reads and updates `encrypted_mnemonic` column
- `audit_log` (via `key-rotation.ts`) — records rotation events

**External APIs:**
- Web Crypto API (`crypto.subtle`) — PBKDF2 + AES-256-GCM in async crypto functions
- `node:crypto` — synchronous AES-256-GCM in env-encryption.ts
