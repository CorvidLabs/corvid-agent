---
module: crypto
version: 1
status: draft
files:
  - server/lib/crypto.ts
  - server/lib/secure-mnemonic.ts
  - server/lib/secure-wipe.ts
  - server/lib/wallet-keystore.ts
  - server/lib/key-rotation.ts
  - server/lib/env-encryption.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
  - specs/db/audit.spec.md
---

# Crypto

## Purpose

Provides wallet-level cryptographic operations for the corvid-agent platform: AES-256-GCM encryption/decryption of mnemonics with PBKDF2 key derivation, secure memory wiping of key material, mnemonic redaction for safe logging, persistent encrypted wallet keystore with file-permission hardening, and key rotation for re-encrypting all wallet mnemonics under a new passphrase.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getEncryptionPassphrase` | `network?: string, serverMnemonic?: string \| null` | `string` | Resolves encryption passphrase from `WALLET_ENCRYPTION_KEY` env var, server mnemonic, or default localnet key. Throws on non-localnet without explicit key. |
| `encryptMnemonic` | `plaintext: string, serverMnemonic?: string \| null, network?: string` | `Promise<string>` | Encrypts a mnemonic using AES-256-GCM with PBKDF2 (600k iterations). Returns base64-encoded `salt(16) + iv(12) + ciphertext`. Wipes intermediate buffers. |
| `decryptMnemonic` | `encrypted: string, serverMnemonic?: string \| null, network?: string` | `Promise<string>` | Decrypts a mnemonic. Tries v2 format first (per-entry salt, 600k iterations), falls back to legacy v1 (static salt, 100k iterations). |
| `encryptMemoryContent` | `plaintext: string, serverMnemonic?: string \| null, network?: string` | `Promise<string>` | Encrypts arbitrary content for on-chain storage (e.g., agent memories). Delegates to `encryptMnemonic`. |
| `decryptMemoryContent` | `encrypted: string, serverMnemonic?: string \| null, network?: string` | `Promise<string>` | Decrypts content encrypted with `encryptMemoryContent`. Delegates to `decryptMnemonic`. |
| `redactMnemonic` | `mnemonic: string` | `string` | Redacts a mnemonic for safe logging: shows first and last words with `***` in between, plus word count. Returns `'***'` if fewer than 3 words. |
| `looksLikeMnemonic` | `value: string` | `boolean` | Checks whether a string looks like an Algorand mnemonic (exactly 25 lowercase alpha words). Does not validate the checksum. |
| `sanitizeLogMessage` | `message: string` | `string` | Scans a log message for sequences that look like mnemonics (25-word runs of lowercase alpha) and redacts them in place. |
| `wipeBuffer` | `buf: Uint8Array \| ArrayBuffer \| null \| undefined` | `void` | Zero-fills a buffer in place. Writes random bytes first to defeat dead-store elimination, then fills with zeros. |
| `wipeBuffers` | `...bufs: Array<Uint8Array \| ArrayBuffer \| null \| undefined>` | `void` | Wipes multiple buffers. Convenience for finally blocks. |
| `withSecureBuffer` | `buf: Uint8Array, operation: (buf: Uint8Array) => Promise<T>` | `Promise<T>` | Executes an async operation with a buffer, wiping the buffer in the finally block regardless of success or failure. |
| `getKeystorePath` | (none) | `string` | Returns the keystore file path from `WALLET_KEYSTORE_PATH` env var, defaulting to `'./wallet-keystore.json'`. |
| `readKeystore` | (none) | `KeystoreData` | Reads and validates the wallet keystore JSON file. Verifies file permissions (0o600). Returns empty object on any error (missing file, invalid format, bad permissions). |
| `getKeystoreEntry` | `agentName: string` | `KeystoreEntry \| null` | Retrieves a single agent's wallet entry from the keystore, or null if not found. |
| `saveKeystoreEntry` | `agentName: string, address: string, encryptedMnemonic: string` | `void` | Saves or updates an agent's wallet entry in the keystore. Uses atomic write (temp file + rename). |
| `removeKeystoreEntry` | `agentName: string` | `void` | Removes an agent's wallet entry from the keystore if it exists. Uses atomic write. |
| `encryptMnemonicWithPassphrase` | `plaintext: string, passphrase: string` | `Promise<string>` | Encrypts a mnemonic with an explicit passphrase (bypasses env-based resolution). Used by KeyProvider-aware callers. |
| `decryptMnemonicWithPassphrase` | `encrypted: string, passphrase: string` | `Promise<string>` | Decrypts a mnemonic with an explicit passphrase (v2 format only). Used by KeyProvider-aware callers. |
| `rotateWalletEncryptionKey` | `db: Database, oldPassphrase: string, newPassphrase: string, _network: string` | `Promise<RotationResult>` | Re-encrypts all wallet mnemonics (DB + keystore) from old passphrase to new. All-or-nothing with round-trip verification. Records audit log entry. |
| `encryptEnvVars` | `jsonStr: string` | `string` | Encrypts a JSON env_vars string using AES-256-GCM with PBKDF2 (600k iterations). Returns `"enc:" + base64(salt + iv + authTag + ciphertext)`. Skips encryption for empty objects (`{}`). Uses `WALLET_ENCRYPTION_KEY` via `getEncryptionPassphrase`. |
| `decryptEnvVars` | `stored: string` | `string` | Decrypts an env_vars string from storage. Handles both encrypted (`enc:` prefix) and legacy plaintext JSON transparently. |
| `isEncrypted` | `stored: string` | `boolean` | Checks whether a stored env_vars value is already encrypted (starts with `enc:` prefix). |

### Exported Types

| Type | Description |
|------|-------------|
| `KeystoreEntry` | `{ address: string; encryptedMnemonic: string }` -- a single wallet entry in the keystore file. |
| `KeystoreData` | `Record<string, KeystoreEntry>` -- the full keystore keyed by agent name. |
| `RotationResult` | `{ success: boolean; agentsRotated: number; keystoreEntriesRotated: number; error?: string }` -- result of a key rotation operation. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `ENCRYPTED_PREFIX` | `string` | `'enc:'` — prefix that marks an encrypted env_vars blob, used to distinguish from legacy plaintext JSON. |

### Exported Classes

(none)

## Invariants

1. `WALLET_ENCRYPTION_KEY` environment variable is required for testnet and mainnet; the default localnet key is only acceptable on localnet.
2. Minimum passphrase length is 32 characters for non-localnet networks; shorter keys emit a warning.
3. Encryption uses AES-256-GCM with PBKDF2 key derivation at 600,000 iterations (current v2 format).
4. Each encryption produces a unique random salt (16 bytes) and IV (12 bytes); no salt/IV reuse.
5. Encrypted format is base64-encoded `salt(16) + iv(12) + ciphertext` (v2). Legacy v1 format uses `iv(12) + ciphertext` with a static salt and 100,000 iterations.
6. Decryption tries v2 format first, falls back to v1 for backward compatibility.
7. All intermediate cryptographic buffers (salt, IV, combined arrays) are wiped in finally blocks via `wipeBuffer`.
8. `wipeBuffer` writes random bytes before zeroing to defeat compiler dead-store elimination optimizations.
9. Keystore file is created with mode 0o600 (owner read/write only); permissions are verified on every read and auto-fixed if too permissive.
10. Keystore writes are atomic: write to a `.tmp` file then rename, preventing corruption on crash.
11. On Windows, POSIX permission checks are skipped (chmod is a no-op; Windows uses ACLs).
12. Key rotation is all-or-nothing: decrypt all, re-encrypt all, verify round-trip for each entry, then commit atomically.
13. Key rotation requires new passphrase to differ from old and be at least 32 characters.
14. Key rotation records an audit log entry via `recordAudit` on success.
15. Mnemonic redaction shows only first and last words; strings shorter than 3 words are fully redacted to `'***'`.
16. `sanitizeLogMessage` detects runs of 20+ consecutive lowercase words and slides a 25-word window to find and redact mnemonic-shaped substrings.
17. Algorand mnemonics are defined as exactly 25 lowercase alpha words for detection purposes.
18. `encryptEnvVars` uses synchronous `node:crypto` (not Web Crypto) to avoid async cascades in DB accessors.
19. `encryptEnvVars` skips encryption for empty objects (`{}`) — no secrets to protect.
20. `encryptEnvVars` format is `"enc:" + base64(salt(16) + iv(12) + authTag(16) + ciphertext)` using AES-256-GCM with PBKDF2 at 600,000 iterations.
21. `decryptEnvVars` transparently passes through legacy plaintext JSON (strings not starting with `enc:`).
22. `encryptEnvVars` uses the same key material as wallet encryption (`WALLET_ENCRYPTION_KEY` via `getEncryptionPassphrase`) but with independent per-entry salt.

## Behavioral Examples

### Scenario: Encrypting and decrypting a mnemonic
- **Given** a plaintext mnemonic and `WALLET_ENCRYPTION_KEY` is set
- **When** `encryptMnemonic` is called followed by `decryptMnemonic` on the result
- **Then** the decrypted output matches the original plaintext

### Scenario: Decrypting a legacy v1 encrypted mnemonic
- **Given** a mnemonic encrypted with the v1 format (static salt, 100k iterations)
- **When** `decryptMnemonic` is called
- **Then** v2 decryption fails silently, falls back to v1, and returns the correct plaintext

### Scenario: Missing encryption key on testnet
- **Given** `WALLET_ENCRYPTION_KEY` is not set and network is `'testnet'`
- **When** `getEncryptionPassphrase('testnet')` is called
- **Then** it throws an Error requiring `WALLET_ENCRYPTION_KEY` to be set

### Scenario: Redacting a mnemonic for logging
- **Given** a 25-word mnemonic string
- **When** `redactMnemonic` is called
- **Then** the result shows only the first and last words with `***` in between and `(25 words)` suffix

### Scenario: Wiping a buffer after use
- **Given** a `Uint8Array` containing sensitive key material
- **When** `wipeBuffer` is called
- **Then** all bytes in the buffer are set to zero

### Scenario: Keystore atomic write
- **Given** a new wallet entry for agent "alice"
- **When** `saveKeystoreEntry('alice', address, encryptedMnemonic)` is called
- **Then** data is written to a `.tmp` file first, then atomically renamed to the keystore path with 0o600 permissions

### Scenario: Key rotation with round-trip verification
- **Given** agents with encrypted mnemonics in DB and keystore
- **When** `rotateWalletEncryptionKey(db, oldPass, newPass, network)` is called
- **Then** all mnemonics are decrypted with old key, re-encrypted with new key, verified via round-trip, committed atomically, and an audit log entry is recorded

### Scenario: Key rotation with same passphrase
- **Given** old and new passphrases are identical
- **When** `rotateWalletEncryptionKey` is called
- **Then** it returns `{ success: false, error: 'New passphrase must differ from old passphrase' }` without modifying any data

### Scenario: Sanitizing a log message containing a mnemonic
- **Given** a log message that contains a 25-word lowercase alpha sequence
- **When** `sanitizeLogMessage` is called
- **Then** the mnemonic portion is replaced with a redacted form showing only first and last words

### Scenario: Encrypting and decrypting env vars
- **Given** a JSON string `'{"API_KEY":"secret123"}'` and `WALLET_ENCRYPTION_KEY` is set
- **When** `encryptEnvVars` is called followed by `decryptEnvVars` on the result
- **Then** the decrypted output matches the original JSON string, and the encrypted form starts with `enc:`

### Scenario: Skipping encryption for empty env vars
- **Given** an empty JSON object string `'{}'`
- **When** `encryptEnvVars('{}')` is called
- **Then** it returns `'{}'` unchanged (no encryption applied)

### Scenario: Decrypting legacy plaintext env vars
- **Given** a stored env_vars string `'{"KEY":"value"}'` (no `enc:` prefix)
- **When** `decryptEnvVars` is called
- **Then** the string is returned as-is (plaintext pass-through)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `WALLET_ENCRYPTION_KEY` missing on non-localnet | `getEncryptionPassphrase` throws Error with setup instructions |
| Passphrase shorter than 32 chars on non-localnet | Warning logged; encryption proceeds (not blocked) |
| Decryption with wrong passphrase | `crypto.subtle.decrypt` throws; error propagates to caller |
| Corrupted/truncated ciphertext | v2 decryption fails, v1 fallback also fails; error propagates |
| Keystore file has permissions more permissive than 0o600 | Auto-fix attempted via chmod; if chmod fails, `readKeystore` returns empty object |
| Keystore file contains invalid JSON | `readKeystore` returns empty object (catch block) |
| Keystore entry missing required fields | Entry is skipped with a warning log; other valid entries are returned |
| Key rotation round-trip verification fails | Returns `{ success: false }` with error message; no data is written |
| New passphrase same as old in rotation | Returns `{ success: false }` immediately |
| New passphrase shorter than 32 chars in rotation | Returns `{ success: false }` immediately |
| `wipeBuffer` called with null/undefined | No-op (guard clause) |
| Keystore write fails (disk error) | Error logged; temp file cleanup attempted |
| `decryptEnvVars` with wrong passphrase | `createDecipheriv` throws; error propagates to caller |
| `decryptEnvVars` with corrupted `enc:` payload | Buffer slicing or decryption fails; error propagates |
| `isEncrypted` on empty string | Returns false (does not start with `enc:`) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `lib/logger` | `createLogger` for structured logging in crypto, wallet-keystore, and key-rotation |
| `lib/secure-wipe` | `wipeBuffer` used by crypto.ts and key-rotation.ts for secure memory cleanup |
| `lib/wallet-keystore` | `readKeystore`, `getKeystorePath`, `KeystoreData` used by key-rotation.ts |
| `db/audit` | `recordAudit` used by key-rotation.ts to log rotation events |
| Web Crypto API | `crypto.subtle` for PBKDF2, AES-256-GCM encrypt/decrypt |
| `node:crypto` | Synchronous `createCipheriv`, `createDecipheriv`, `pbkdf2Sync`, `randomBytes` in env-encryption.ts |
| `node:fs` | File system operations in wallet-keystore.ts and key-rotation.ts |
| `bun:sqlite` | `Database` type used by key-rotation.ts for DB queries |

### Consumed By

| Module | What is used |
|--------|-------------|
| `algochat/wallets` | `encryptMnemonic`, `decryptMnemonic` for wallet creation and recovery |
| `algochat/bridge` | `decryptMnemonic` for signing Algorand transactions |
| `algochat/memories` | `encryptMemoryContent`, `decryptMemoryContent` for on-chain memory storage |
| `process/manager` | `getKeystoreEntry`, `saveKeystoreEntry` for agent wallet lifecycle |
| `routes/wallets` | `readKeystore`, `getKeystoreEntry`, `removeKeystoreEntry` for wallet management API |
| `routes/admin` | `rotateWalletEncryptionKey` for owner-initiated key rotation |
| `lib/crypto` | `wipeBuffer` from secure-wipe used internally |
| `lib/logger` | `sanitizeLogMessage` as safety net in structured logging |
| `middleware/startup` | `looksLikeMnemonic` for startup env validation |
| `db/projects`, `db/agents` | `encryptEnvVars`, `decryptEnvVars` for encrypting env_vars JSON blobs before DB storage and decrypting on read |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-08 | CorvidAgent | Added encryptMnemonicWithPassphrase, decryptMnemonicWithPassphrase for KeyProvider integration (#383) |
| 2026-03-13 | corvid-agent | Added env-encryption (encryptEnvVars, decryptEnvVars, isEncrypted, ENCRYPTED_PREFIX) for env_vars at-rest encryption |
