---
spec: types.spec.md
sources:
  - server/types/ts-algochat.d.ts
---

## Layout

Single-file module: an ambient TypeScript declaration file that provides type stubs for the optional `@corvidlabs/ts-algochat` package.

```
server/types/
  ts-algochat.d.ts   — declare module '@corvidlabs/ts-algochat' { ... }
```

No runtime code is emitted. All declarations live inside a single `declare module` block.

## Components

### Interfaces
| Interface | Purpose |
|-----------|---------|
| `EncryptionKeys` | `publicKey: Uint8Array; privateKey: Uint8Array` — key pair |
| `ChatAccount` | Algorand chat account: address, keys, mnemonic |
| `GeneratedChatAccount` | Wrapper: `{ account: ChatAccount; mnemonic: string }` |
| `PSKState` | Pre-shared key state: counters for forward-ratcheting |
| `PSKEnvelope` | Encrypted envelope with ratchet counter |
| `DecryptedMessage` | Decrypted content with extensible index signature |
| `SyncMessage` | Blockchain-synced message with metadata |
| `NetworkPreset` | Algod/indexer URLs and tokens |
| `ConversationHandle` | Handle for a conversation with a participant |

All interfaces include `[key: string]: unknown` index signatures for forward compatibility.

### Classes
| Class | Purpose |
|-------|---------|
| `AlgorandService` | On-chain message send, key publish/discover, history fetch |
| `SendQueue` | Queue for outgoing messages |
| `SyncManager` | Conversation sync, event subscription, continuous polling |

Classes include `[key: string]: unknown` to allow additional properties from the real package.

### Key Functions
- `localnet()` / `testnet()` / `mainnet()` — return `NetworkPreset` for each Algorand network
- `createRandomChatAccount()` / `createChatAccountFromMnemonic(mnemonic)` — account creation
- `encryptMessage` / `decryptMessage` — NaCl-based asymmetric encryption
- `encryptPSKMessage` / `decryptPSKMessage` — PSK (ratchet) encryption
- `encodeEnvelope` / `decodeEnvelope` — binary serialization
- `advanceSendCounter` / `derivePSKAtCounter` / `validateCounter` / `recordReceive` — ratchet state management
- `isPSKMessage` — envelope type detection

### `PROTOCOL` constant
Object with `MAX_PAYLOAD_SIZE`, `TAG_SIZE`, `MIN_PAYMENT` and index signature for future additions.

## Tokens

None — this file contains no configurable values, only type signatures that mirror the actual `@corvidlabs/ts-algochat` package.

## Assets

### Purpose
Enables `bun x tsc --noEmit` to succeed in CI environments where `@corvidlabs/ts-algochat` is not installed. When the real package is present in `node_modules`, TypeScript prefers it over these ambient declarations.

### Consumers
- `server/algochat/` — all AlgoChat messaging, wallet, and sync operations
- `server/lib/` — `EncryptionKeys` and `ChatAccount` for wallet key management
