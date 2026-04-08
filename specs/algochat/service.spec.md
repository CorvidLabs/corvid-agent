---
module: algochat-service
version: 1
status: active
files:
  - server/algochat/service.ts
  - server/algochat/subscription-manager.ts
db_tables: []
depends_on:
  - specs/process/process-manager.spec.md
---

# AlgoChat Service & Subscription Manager

## Purpose

Initializes the AlgoChat on-chain messaging service (Algorand SDK clients, chat account, sync manager) and manages session event subscriptions for delivering responses to both on-chain participants and local browser dashboard clients.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `initAlgoChatService` | `(config: AlgoChatConfig)` | `Promise<AlgoChatService \| null>` | Initialize AlgoChat with Algorand SDK clients, chat account, and sync manager. Returns null if disabled, LocalNet unavailable, or no mnemonic on mainnet |
| `fundFromTestnetFaucet` | `(address: string)` | `Promise<void>` | Fund a new account from the Algorand testnet dispenser API. Respects `TESTNET_DISPENSER_URL` and `TESTNET_DISPENSER_TOKEN` env vars |

### Exported Types

| Type | Description |
|------|-------------|
| `AlgoChatService` | Service object containing `algorandService`, `chatAccount`, `syncManager`, `algodClient`, and `indexerClient` |
| `LocalChatSendFn` | Callback `(participant: string, content: string, direction: 'inbound' \| 'outbound') => void` for sending local chat messages to the browser |
| `LocalChatEvent` | Discriminated union of structured events for local chat streaming: `message`, `stream`, `tool_use`, `thinking`, `session_info` |
| `LocalChatEventFn` | Callback `(event: LocalChatEvent) => void` for structured local chat events |

### Exported Classes

| Class | Description |
|-------|-------------|
| `SubscriptionManager` | Manages on-chain and local (browser) subscriptions to ProcessManager session events with progress tracking, timeout management, and response delivery |

#### SubscriptionManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `hasLocalSubscription` | `(sessionId: string)` | `boolean` | Check whether a local subscription exists for a session |
| `hasChainSubscription` | `(sessionId: string)` | `boolean` | Check whether an on-chain subscription exists for a session |
| `updateLocalSendFn` | `(sessionId: string, sendFn: LocalChatSendFn)` | `void` | Update the send function for a local session (e.g. on WS reconnect) |
| `updateLocalEventFn` | `(sessionId: string, eventFn: LocalChatEventFn)` | `void` | Update the event function for a local session |
| `cleanupLocalSession` | `(sessionId: string)` | `void` | Remove all local subscription state for a session |
| `subscribeForResponse` | `(sessionId: string, participant: string)` | `void` | Subscribe for an on-chain response with acknowledgment delay, progress updates, and timeout extension |
| `subscribeForLocalResponse` | `(sessionId: string, sendFn: LocalChatSendFn)` | `void` | Subscribe for local (browser dashboard) responses with streaming events |
| `setSubscriptionTimer` | `(sessionId: string, onTimeout: () => void)` | `void` | Set or reset the subscription timeout for a session |
| `resetSubscriptionTimer` | `(sessionId: string)` | `void` | Reset the subscription timeout timer for an active subscription |
| `clearSubscriptionTimer` | `(sessionId: string)` | `void` | Clear the subscription timeout timer for a session |
| `cleanup` | `()` | `void` | Clean up all subscriptions, timers, and callbacks (called during bridge shutdown) |

## Invariants

1. **Config gating**: `initAlgoChatService` returns `null` when `config.enabled` is false, LocalNet is unreachable (for localnet network), or no mnemonic is provided on mainnet. On testnet without a mnemonic, a new account is auto-generated and funded via the testnet faucet
2. **LocalNet health check**: Before initializing on localnet, the algod `/v2/status` endpoint is probed with a 2-second timeout. If unreachable, initialization is skipped
3. **LocalNet auto-funding**: New or unfunded accounts on localnet are funded with 100 ALGO from the KMD default wallet dispenser
3a. **Testnet auto-funding**: New or unfunded accounts on testnet are funded with 10 ALGO from the Algorand testnet dispenser API (`TESTNET_DISPENSER_URL` / `TESTNET_DISPENSER_TOKEN` env vars for custom endpoints)
4. **Key publication**: After account setup, the encryption key is published on-chain so other accounts can discover and encrypt messages to this node
5. **No duplicate subscriptions**: Both `subscribeForResponse` and `subscribeForLocalResponse` are idempotent -- repeated calls for the same sessionId are no-ops
6. **Subscription timeout**: Subscriptions time out after 10 minutes of inactivity. Activity (content deltas, assistant events, turn completions) resets the timer
7. **Timeout extension**: On-chain subscriptions can extend up to 3 times (30 additional minutes) if the process is still running, sending progress updates on each extension
8. **Acknowledgment delay**: On-chain acknowledgments are delayed 10 seconds; if the response arrives within that window, the ack is skipped entirely
9. **Progress updates**: Periodic on-chain progress updates are sent every 2 minutes for long-running sessions, summarizing tools used and agents queried
10. **Last-text-block preference**: On-chain responses use the last streamed text block from the final turn, falling back to full assistant text if streaming events are not available
11. **Progress history cap**: Progress action history is capped at 100 entries via a sliding window to prevent unbounded memory growth
12. **Local stream cleanup**: Local subscriptions clean up on `session_exited`, flushing any remaining buffered text before removing state

## Behavioral Examples

### Scenario: Standard localnet initialization
- **Given** `config.enabled` is true, `config.network` is `localnet`, and LocalNet is running
- **When** `initAlgoChatService(config)` is called
- **Then** returns an `AlgoChatService` with `algorandService`, `chatAccount`, `syncManager`, `algodClient`, and `indexerClient`

### Scenario: Testnet initialization without mnemonic
- **Given** `config.enabled` is true, `config.network` is `testnet`, and no mnemonic is configured
- **When** `initAlgoChatService(config)` is called
- **Then** generates a new account, funds it via the testnet faucet, publishes the encryption key, and returns an `AlgoChatService`

### Scenario: LocalNet unavailable
- **Given** `config.enabled` is true, `config.network` is `localnet`, and LocalNet is not running
- **When** `initAlgoChatService(config)` is called
- **Then** returns `null` and logs "LocalNet not available"

### Scenario: Disabled config
- **Given** `config.enabled` is false
- **When** `initAlgoChatService(config)` is called
- **Then** returns `null` immediately

### Scenario: On-chain response with quick reply
- **Given** `subscribeForResponse` is called for a session
- **When** the session produces a response within 10 seconds
- **Then** the on-chain acknowledgment is skipped and only the final response is sent

### Scenario: On-chain response with long processing
- **Given** `subscribeForResponse` is called for a session using agent-to-agent tools
- **When** the session takes longer than 10 seconds
- **Then** an acknowledgment is sent immediately upon detecting agent calls, and progress updates are sent every 2 minutes

### Scenario: Local subscription WS reconnect
- **Given** a local subscription exists for a session
- **When** `updateLocalSendFn` is called with a new send function
- **Then** subsequent events are delivered through the new send function

### Scenario: Subscription timeout with running process
- **Given** an on-chain subscription exists and the timer expires
- **When** the process is still running and fewer than 3 extensions have occurred
- **Then** the timeout is extended, a progress status is sent on-chain, and the timer resets

## Error Cases

| Condition | Behavior |
|-----------|----------|
| AlgoChat disabled in config | Returns `null`, logs "Disabled" |
| LocalNet not reachable (localnet network) | Returns `null`, logs info message |
| No mnemonic and on mainnet | Returns `null`, logs info message |
| Testnet faucet request fails | Throws `Error` with status code and body |
| Key publication fails | Logs warning, continues (key may already exist) |
| KMD default wallet not found | Throws `NotFoundError` |
| Initialization exception | Catches error, logs, returns `null` |
| Subscription timeout (max extensions reached) | Sends partial response with whatever text has been buffered |
| Subscription timeout (session not running) | Sends final buffered response |
| Local subscription timeout | Cleans up subscription, sends any remaining buffered text |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@corvidlabs/ts-algochat` | `AlgorandService`, `ChatAccount`, `SyncManager`, `SendQueue`, network presets (`localnet`, `testnet`, `mainnet`), `createChatAccountFromMnemonic`, `createRandomChatAccount` |
| `algosdk` | `Algodv2`, `Indexer`, `Kmd`, `mnemonicToSecretKey`, `secretKeyToMnemonic`, `makePaymentTxnWithSuggestedParamsFromObject` |
| `server/algochat/config` | `AlgoChatConfig` type |
| `server/lib/logger` | `createLogger` |
| `server/lib/errors` | `NotFoundError` |
| `server/process/manager` | `ProcessManager` (subscribe/unsubscribe API) |
| `server/process/types` | `ClaudeStreamEvent`, `extractContentText` |
| `server/algochat/response-formatter` | `ResponseFormatter` (for sending on-chain responses and emitting events) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `initAlgoChatService` for startup initialization |
| `server/algochat/bridge.ts` | `AlgoChatService` type, `SubscriptionManager` class |
| `server/algochat/response-formatter.ts` | `AlgoChatService` type for constructor |
| `server/algochat/on-chain-transactor.ts` | `AlgoChatService` type for on-chain sends |
| `server/algochat/agent-wallet.ts` | `AlgoChatService` type |
| `server/algochat/message-router.ts` | `SubscriptionManager` via bridge |
| `server/routes/onboarding.ts` | `AlgoChatBridge` for wallet/bridge status in onboarding endpoint |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
