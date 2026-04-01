---
module: types
version: 1
status: draft
files:
  - server/types/ts-algochat.d.ts
db_tables: []
depends_on: []
---

# Types

## Purpose

TypeScript declaration stubs for optional dependencies. Provides ambient type declarations for `@corvidlabs/ts-algochat` to allow compilation when the actual package is not installed.

## Public API

### Exported Interfaces

| Interface | Description |
|-----------|-------------|
| `EncryptionKeys` | Public/private key pair as Uint8Arrays |
| `ChatAccount` | Algorand chat account with address, keys, and mnemonic |
| `GeneratedChatAccount` | Wrapper containing account and mnemonic |
| `PSKState` | Pre-shared key state with counters for ratcheting |
| `PSKEnvelope` | Encrypted message envelope with ratchet counter |
| `DecryptedMessage` | Decrypted message content with extensible fields |
| `SyncMessage` | Synchronized message from blockchain with metadata |
| `NetworkPreset` | Algod/indexer URLs and tokens for network connection |
| `ConversationHandle` | Handle for a conversation with a participant |

### Exported Classes

| Class | Description |
|-------|-------------|
| `AlgorandService` | Service for sending messages and discovering keys on Algorand |
| `SendQueue` | Queue for outgoing messages |
| `SyncManager` | Manages conversation sync and message fetching |

#### AlgorandService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `config: unknown` | `AlgorandService` | Creates service with config |
| `sendMessage` | `sender, recipientAddress, recipientPublicKey, content, options?` | `Promise<{ txid, fee? }>` | Sends encrypted message |
| `publishKey` | `account: ChatAccount` | `Promise<string>` | Publishes public key to chain |
| `discoverPublicKey` | `address: string, timeout?: number` | `Promise<Uint8Array>` | Discovers someone's public key |
| `fetchMessages` | `account, participant, afterRound?, limit?` | `Promise<SyncMessage[]>` | Fetches message history |

#### SyncManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `algorandService, chatAccount, queue, options?` | `SyncManager` | Creates sync manager |
| `on` | `event: string, handler` | `void` | Registers event handler |
| `getConversations` | _(none)_ | `ConversationHandle[]` | Gets all conversations |
| `getOrCreateConversation` | `participant: string` | `ConversationHandle` | Gets or creates conversation |
| `addParticipant` | `address: string` | `void` | Adds a participant |
| `sync` | _(none)_ | `Promise<void>` | Syncs messages once |
| `start` | _(none)_ | `Promise<void>` | Starts continuous sync |
| `stop` | _(none)_ | `Promise<void>` | Stops continuous sync |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `localnet` | _(none)_ | `NetworkPreset` | Returns localnet configuration |
| `testnet` | _(none)_ | `NetworkPreset` | Returns testnet configuration |
| `mainnet` | _(none)_ | `NetworkPreset` | Returns mainnet configuration |
| `createRandomChatAccount` | _(none)_ | `GeneratedChatAccount` | Generates new random account |
| `createChatAccountFromMnemonic` | `mnemonic: string` | `ChatAccount` | Restores account from mnemonic |
| `encryptMessage` | `plaintext, senderPublicKey, recipientPublicKey` | `Uint8Array` | Encrypts a message |
| `decryptMessage` | `envelope, privateKey, publicKey` | `DecryptedMessage \| null` | Decrypts a message |
| `encodeEnvelope` | `data: unknown` | `Uint8Array` | Encodes data to envelope format |
| `decodeEnvelope` | `data: Uint8Array` | `unknown` | Decodes envelope data |
| `advanceSendCounter` | `state: PSKState` | `{ counter, state }` | Advances PSK counter |
| `derivePSKAtCounter` | `initialPSK: Uint8Array, counter: number` | `Uint8Array` | Derives PSK at specific counter |
| `encryptPSKMessage` | `plaintext, senderPublicKey, recipientPublicKey, psk, counter` | `PSKEnvelope` | Encrypts with PSK |
| `decryptPSKMessage` | `envelope, privateKey, publicKey, psk` | `DecryptedMessage \| null` | Decrypts PSK message |
| `encodePSKEnvelope` | `envelope: PSKEnvelope` | `Uint8Array` | Encodes PSK envelope |
| `decodePSKEnvelope` | `data: Uint8Array` | `PSKEnvelope` | Decodes PSK envelope |
| `isPSKMessage` | `data: Uint8Array` | `boolean` | Checks if data is PSK message |
| `validateCounter` | `state: PSKState, counter: number` | `boolean` | Validates counter against state |
| `recordReceive` | `state: PSKState, counter: number` | `PSKState` | Records received counter |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `PROTOCOL` | Object with `[key: string]: unknown` | Protocol constants including `MAX_PAYLOAD_SIZE`, `TAG_SIZE`, `MIN_PAYMENT` |

## Invariants

1. All type declarations are ambient (inside `declare module` block) — no runtime code is generated.
2. Function signatures match the actual `@corvidlabs/ts-algochat` implementation.
3. Index signatures on interfaces allow forward compatibility with additional fields.
4. Classes declared with `[key: string]: unknown` allow for additional properties.

## Behavioral Examples

### Scenario: Type checking compiles without actual package
- **Given** `@corvidlabs/ts-algochat` is not installed in `node_modules`
- **When** TypeScript compiles code importing from the module
- **Then** Compilation succeeds using these ambient declarations

### Scenario: Encryption types match expected usage
- **Given** code calls `encryptMessage(plaintext, pubKey, pubKey)`
- **When** TypeScript checks the types
- **Then** Parameters are validated as `(string | Uint8Array, Uint8Array, Uint8Array)`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Actual package installed | TypeScript prefers actual package over ambient declarations |
| Type mismatch with actual package | Compile-time error if declarations diverge from implementation |

## Dependencies

### Consumes

_(none — this is a stub module)_

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/` | All AlgoChat types for messaging |
| `server/lib/` | `EncryptionKeys`, `ChatAccount` for wallet operations |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-31 | corvid-agent | Initial spec |
