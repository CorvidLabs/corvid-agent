---
spec: key-provider.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/crypto.test.ts` | Unit | Encrypt/decrypt round-trip (v2 format); legacy v1 decryption fallback; `redactMnemonic`; `sanitizeLogMessage`; `wipeBuffer`; keystore read/write/delete; env-encryption round-trip; `isEncrypted`; skipping encryption for `'{}'` |
| `server/__tests__/crypto-audit.test.ts` | Unit | `rotateWalletEncryptionKey` audit log recording; rotation success/failure scenarios |

## Manual Testing

- [ ] Encrypt a mnemonic with `encryptMnemonic`; decrypt with `decryptMnemonic`; verify output matches input
- [ ] Encrypt a mnemonic with v1 format; call `decryptMnemonic`; verify v2 attempt fails and v1 fallback succeeds
- [ ] Set `WALLET_ENCRYPTION_KEY` to an empty value and network to `testnet`; verify `getEncryptionPassphrase` throws with setup instructions
- [ ] Call `redactMnemonic` on a 25-word string; verify only first and last words are shown
- [ ] Call `sanitizeLogMessage` with an embedded mnemonic; verify mnemonic portion is redacted in output
- [ ] Save a keystore entry; manually chmod the file to `0o644`; call `readKeystore`; verify permissions are auto-fixed to `0o600`
- [ ] Attempt `rotateWalletEncryptionKey` with old == new passphrase; verify immediate failure without modification
- [ ] Call `encryptEnvVars('{}')` ; verify empty object is returned as-is (no encryption)
- [ ] Call `encryptEnvVars('{"API_KEY":"secret"}')` then `decryptEnvVars`; verify round-trip and `enc:` prefix
- [ ] Call `assertProductionReady` with no `KeyProvider` on testnet; verify it throws

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `WALLET_ENCRYPTION_KEY` unset on localnet | Default localnet key used; no error |
| `WALLET_ENCRYPTION_KEY` unset on testnet | `getEncryptionPassphrase` throws with setup instructions |
| Passphrase shorter than 32 chars on non-localnet | Warning logged; encryption proceeds (not blocked) |
| Decryption with wrong passphrase | `crypto.subtle.decrypt` throws; error propagates to caller |
| Corrupted ciphertext (truncated) | v2 fails; v1 fallback also fails; error propagates |
| `wipeBuffer` called with `null` | No-op; no error thrown |
| `wipeBuffer` called with empty `Uint8Array` | No-op (nothing to wipe) |
| Keystore file does not exist | `readKeystore` returns empty object |
| Keystore file contains invalid JSON | `readKeystore` returns empty object (catch block) |
| Keystore entry missing `address` field | Entry skipped with warning; other entries returned normally |
| Key rotation: new passphrase same as old | Returns `{ success: false }` immediately |
| Key rotation: new passphrase < 32 chars | Returns `{ success: false }` immediately |
| Key rotation: round-trip verification fails for one entry | Returns `{ success: false }`; no data committed |
| `decryptEnvVars` with legacy plaintext JSON (no `enc:` prefix) | Passed through as-is |
| `isEncrypted` called with empty string | Returns `false` |
| Each encryption call produces unique ciphertext | Different salt and IV per call; verified by comparing outputs of two calls with same input |
