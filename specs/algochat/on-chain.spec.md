---
module: on-chain
version: 1
status: draft
files:
  - server/algochat/on-chain-transactor.ts
  - server/algochat/psk.ts
db_tables:
  - daily_spending
  - sessions
  - algochat_psk_state
  - audit_log
depends_on:
  - server/algochat/service.ts
  - server/algochat/agent-wallet.ts
  - server/algochat/agent-directory.ts
  - server/algochat/config.ts
  - server/algochat/group-sender.ts
  - server/algochat/condenser.ts
  - server/db/spending.ts
  - server/db/sessions.ts
  - server/db/audit.ts
  - server/lib/logger.ts
  - server/lib/errors.ts
  - server/lib/dedup.ts
  - server/lib/secure-wipe.ts
  - server/observability/trace-context.ts
---

# On-Chain

## Purpose

Handles all Algorand on-chain transaction operations including encrypted message construction, signing, submission, spending tracking, and message condensation fallback for inter-agent communication, as well as pre-shared key (PSK) based encrypted messaging with external contacts using ratcheted key derivation and counter-based replay protection.

## Public API

### Exported Functions

_No standalone exported functions. All functionality is exposed via exported classes._

### Exported Types

| Type | Description |
|------|-------------|
| `OnChainMemory` | Interface for on-chain memory entries: `key: string`, `content: string`, `txid: string`, `timestamp: string`, `confirmedRound: number` |
| `SendMessageOptions` | Interface for agent-to-agent sends: `fromAgentId`, `toAgentId`, `content`, `paymentMicro`, optional `messageId`, optional `sessionId` |
| `SendMessageResult` | Interface with `txid: string \| null`, optional `blockedByLimit: boolean`, optional `limitError: string` |
| `SendToAddressOptions` | Interface for direct-address sends: `senderAccount: ChatAccount`, `recipientAddress`, `recipientPublicKey: Uint8Array`, `content`, optional `paymentMicro`, optional `sessionId` |
| `PSKMessage` | Interface for received PSK messages: `sender: string`, `content: string`, `confirmedRound: number`, optional `amount: number` |
| `PSKMessageCallback` | Type alias `(message: PSKMessage) => void` |
| `PSKContactEntry` | Interface for PSK contact state: `address`, `initialPSK: Uint8Array`, `label`, `state: PSKState`, `lastRound` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `OnChainTransactor` | Handles encrypted on-chain message sending between agents with spending limit enforcement, public key caching, group transaction construction, and condense-and-fallback |
| `PSKManager` | Manages pre-shared key encrypted communication with a single external contact: polling, decryption, counter ratcheting, key rotation with grace periods, and state persistence |

#### OnChainTransactor Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, service: AlgoChatService \| null, agentWalletService: AgentWalletService, agentDirectory: AgentDirectory` | `OnChainTransactor` | Creates transactor with all required dependencies; service may be null (disables all sends) |
| `sendMessage` | `opts: SendMessageOptions` | `Promise<SendMessageResult>` | Sends encrypted on-chain message between two agents; checks spending limits, resolves wallets and public keys, prepends trace ID, uses group txn with condense fallback |
| `sendToSelf` | `agentId: string, content: string` | `Promise<string \| null>` | Sends on-chain message from agent to itself for memory/audit storage; bypasses recipient resolution |
| `readOnChainMemories` | `agentId: string, serverMnemonic: string \| null \| undefined, network: string \| undefined, options?: { limit?, afterRound?, search? }` | `Promise<OnChainMemory[]>` | Reads on-chain memories by querying self-to-self transactions via indexer, decrypting AlgoChat and memory layers |
| `sendNotificationToAddress` | `fromAgentId: string, toAddress: string, content: string` | `Promise<string \| null>` | Best-effort notification to an arbitrary address; always condenses content to 800 bytes; never throws |
| `sendBestEffort` | `fromAgentId: string, toAgentId: string, content: string, messageId?: string` | `Promise<string \| null>` | Best-effort message send with zero payment; never throws, returns txid or null |
| `sendToAddress` | `senderAccount: ChatAccount, recipientAddress: string, content: string, sessionId?: string` | `Promise<{ txid: string; fee: number } \| null>` | Sends message to an Algorand address using a specific sender account; group txn first, single-txn fallback; records spending and session ALGO spent |
| `discoverPublicKey` | `address: string` | `Promise<Uint8Array>` | Discovers or retrieves from cache a recipient's X25519 public key for encryption; 1-hour cache TTL |

#### PSKManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, service: AlgoChatService, pskConfig: PSKContactConfig, network: AlgoChatNetwork, contactId?: string` | `PSKManager` | Creates manager; restores ratchet state from DB or initializes fresh; always overrides PSK with authoritative value from config |
| `contactAddress` | _(getter)_ | `string` | Returns the contact's Algorand address |
| `psk` | _(getter)_ | `Uint8Array` | Returns the current pre-shared key bytes |
| `contactId` | _(readonly property)_ | `string` | Unique contact ID used to key multi-contact maps in bridge |
| `isInGracePeriod` | _(getter)_ | `boolean` | Returns whether the manager is currently in a PSK rotation grace period |
| `onMessage` | `callback: PSKMessageCallback` | `void` | Registers a callback for received PSK messages |
| `offMessage` | `callback: PSKMessageCallback` | `void` | Unregisters a previously registered message callback |
| `start` | `intervalMs: number` | `void` | Starts polling for incoming PSK messages at the specified interval; runs first poll immediately |
| `stop` | _(none)_ | `void` | Stops polling and persists current ratchet state to DB |
| `resetWithNewPSK` | `newPSK: Uint8Array` | `void` | Resets all ratchet state with a new PSK; clears dedup cache; restarts polling if it was running |
| `rotatePSK` | `gracePeriodMs?: number` | `Uint8Array` | Rotates the PSK with a grace period (default 5 minutes); retains old PSK for fallback decryption during grace; returns the new PSK bytes; records audit event |
| `sendMessage` | `content: string` | `Promise<string>` | Sends a PSK-encrypted message to the contact; advances send counter, derives key, encrypts, constructs and submits transaction; returns txid |

## Invariants

1. All `OnChainTransactor` methods return `null`/no-op when the `AlgoChatService` is null (service not initialized).
2. Spending limits are checked before any on-chain send; blocked sends return `{ txid: null, blockedByLimit: true }`.
3. On-chain messages include a `[trace:<id>]` prefix when a trace context is active, enabling cross-agent correlation.
4. Group transaction is always attempted first; on failure, content is condensed to 800 bytes and sent as a single transaction.
5. Transaction fees and ALGO payments are recorded via `recordAlgoSpend` and optionally `updateSessionAlgoSpent`.
6. Public key cache in `OnChainTransactor` has a 1-hour TTL (`PUBLIC_KEY_CACHE_TTL_MS = 3,600,000`).
7. `sendNotificationToAddress` and `sendBestEffort` never throw; errors are swallowed and `null` is returned.
8. PSK ratchet state (send counter, peer last counter, seen counters, last round) is persisted to `algochat_psk_state` table on every state change.
9. PSK counter validation supports multi-device scenarios: a reused counter from a new txid is accepted (txid dedup prevents true replays).
10. Counter drift exceeding 100 triggers an audit event (`psk_drift_alert`) and warning log for potential replay attack or key compromise.
11. During PSK rotation grace period (default 5 minutes), incoming messages are decrypted with both new and old PSK; after expiry, old PSK bytes are securely wiped.
12. PSK manager uses `DedupService.global()` with a per-contact namespace; max 1000 entries, 10-minute TTL.
13. Derived PSK bytes and signed transaction bytes are wiped after use via `wipeBuffer`.
14. `resetWithNewPSK` clears all ratchet state, dedup cache, and cached encryption key; automatically restarts polling if it was running.
15. PSK rotation records an audit trail entry with `'psk_rotation'` event type.

## Behavioral Examples

### Scenario: Agent-to-agent message with payment
- **Given** agent A has a wallet, agent B has a wallet with a discoverable public key, and spending limits allow
- **When** `sendMessage({ fromAgentId: A, toAgentId: B, content: "hello", paymentMicro: 1000 })` is called
- **Then** the message is encrypted with B's public key, sent as a group transaction with 1000 microAlgo payment, the spend is recorded, and the txid is returned

### Scenario: Message blocked by spending limit
- **Given** the daily ALGO spending limit has been reached
- **When** `sendMessage` is called with `paymentMicro > 0`
- **Then** `{ txid: null, blockedByLimit: true, limitError: "..." }` is returned without sending any transaction

### Scenario: Group transaction fails, condense fallback
- **Given** a message is too large for a single group transaction or the group send throws
- **When** `sendEncryptedMessage` catches the group send error
- **Then** the content is condensed to 800 bytes, sent as a single transaction, and the txid is returned

### Scenario: PSK message received from contact
- **Given** the PSK manager is polling and a new payment transaction with a PSK note arrives from the contact
- **When** the poll cycle processes the transaction
- **Then** the PSK envelope is decoded, the counter is validated, the key is derived at the counter, the message is decrypted, the ratchet state is updated, and all registered callbacks are invoked with the `PSKMessage`

### Scenario: PSK rotation with grace period
- **Given** the current PSK is active and the contact is sending messages
- **When** `rotatePSK(300000)` is called (5-minute grace)
- **Then** a new random 32-byte PSK is generated, the old PSK is retained for 5 minutes, ratchet state is reset, an audit event is recorded, and the new PSK is returned to the caller for secure transmission to the contact

### Scenario: Multi-device counter reuse
- **Given** two devices share the same wallet and PSK with the contact
- **When** both devices send messages with overlapping counters
- **Then** the PSK manager accepts messages with reused counters from new txids, relying on txid-based dedup for true replay protection

## Error Cases

| Condition | Behavior |
|-----------|----------|
| AlgoChatService is null | All `OnChainTransactor` sends return `null` / no-op |
| No wallet for sender agent | Returns `{ txid: null }`; logged at debug level |
| No wallet address for recipient agent | Returns `{ txid: null }`; logged at debug level |
| Public key discovery fails | Returns `{ txid: null }`; logged at debug level |
| Spending limit exceeded | Returns `{ txid: null, blockedByLimit: true, limitError }` |
| Group send fails | Falls back to condense + single transaction |
| Single transaction send fails (sendToAddress) | Error propagates to caller |
| PSK decryption fails (both new and old PSK) | Warning logged; txid tracked to prevent retry; message skipped |
| PSK counter drift > 100 | Audit event recorded, warning logged; counter is resynced |
| No indexer client for PSK polling | Warning logged; poll returns immediately |
| Callback throws during PSK message dispatch | Error logged; other callbacks still invoked |
| `sendNotificationToAddress` fails at any step | Returns `null`; error swallowed |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/algochat/service.ts` | `AlgoChatService` (algodClient, indexerClient, chatAccount, algorandService) |
| `server/algochat/agent-wallet.ts` | `AgentWalletService.getAgentChatAccount()` for wallet resolution |
| `server/algochat/agent-directory.ts` | `AgentDirectory.resolve()` for recipient address and public key lookup |
| `server/algochat/config.ts` | `PSKContactConfig`, `AlgoChatConfig` |
| `server/algochat/group-sender.ts` | `sendGroupMessage()` for multi-transaction message sending |
| `server/algochat/condenser.ts` | `condenseMessage()` for truncating content to fit single transactions |
| `server/db/spending.ts` | `checkAlgoLimit`, `recordAlgoSpend` |
| `server/db/sessions.ts` | `updateSessionAlgoSpent` |
| `server/db/audit.ts` | `recordAudit` (PSK rotation and drift events) |
| `server/lib/logger.ts` | `createLogger` |
| `server/lib/errors.ts` | `NotFoundError` |
| `server/lib/dedup.ts` | `DedupService.global()` for PSK transaction deduplication |
| `server/lib/secure-wipe.ts` | `wipeBuffer` for wiping derived keys and signed transactions |
| `server/observability/trace-context.ts` | `getTraceId()` for cross-agent trace correlation |
| `@corvidlabs/ts-algochat` | `ChatAccount`, `PSKState`, PSK encryption/decryption functions, envelope encoding/decoding, counter management |
| `algosdk` | Algorand SDK for transaction construction and signing (PSK sends) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/agent-messenger.ts` | `OnChainTransactor.sendMessage()`, `sendBestEffort()`, `sendToSelf()` for agent message delivery |
| `server/algochat/response-formatter.ts` | `OnChainTransactor.sendToAddress()` for on-chain response delivery to users |
| `server/algochat/bridge.ts` | `OnChainTransactor` (instantiation), `PSKManager` (instantiation, lifecycle, message routing) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
