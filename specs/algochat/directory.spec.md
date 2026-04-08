---
module: directory
version: 1
status: active
files:
  - server/algochat/agent-directory.ts
  - server/algochat/agent-wallet.ts
  - server/algochat/discovery-service.ts
db_tables:
  - agents
  - algochat_psk_state
depends_on:
  - server/algochat/config.ts
  - server/algochat/service.ts
  - server/db/agents.ts
  - server/db/sessions.ts
  - server/db/projects.ts
  - server/lib/crypto.ts
  - server/lib/wallet-keystore.ts
  - server/lib/secure-wipe.ts
  - server/lib/logger.ts
  - server/lib/errors.ts
  - server/process/approval-manager.ts
---

# Directory

## Purpose

Manages agent identity resolution, wallet lifecycle (creation, funding, key publishing), and runtime discovery of conversation participants and agent addresses on the Algorand network.

## Public API

### Exported Functions

_No standalone exported functions. All functionality is exposed via exported classes._

### Exported Types

| Type | Description |
|------|-------------|
| `AgentDirectoryEntry` | Interface representing a resolved agent: `agentId`, `agentName`, `walletAddress` (string or null), `publicKey` (Uint8Array or null) |
| `AgentChatAccount` | Interface wrapping an agent's wallet address and its `ChatAccount` from `@corvidlabs/ts-algochat` |
| `IsOwnerFn` | Type alias `(participant: string) => boolean` for authorization check injection |

### Exported Classes

| Class | Description |
|-------|-------------|
| `AgentDirectory` | In-memory cached directory that resolves agent IDs to wallet addresses and encryption public keys |
| `AgentWalletService` | Manages agent wallet creation, funding, mnemonic encryption/decryption, key publishing, and balance monitoring |
| `DiscoveryService` | Handles conversation seeding, periodic sender discovery via Algorand indexer, fast-polling for approvals, and agent wallet address caching |

#### AgentDirectory Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, agentWalletService: AgentWalletService` | `AgentDirectory` | Creates directory with DB and wallet service references |
| `resolve` | `agentId: string` | `Promise<AgentDirectoryEntry \| null>` | Resolves an agent ID to its directory entry with wallet address and public key; results are cached |
| `findAgentByAddress` | `walletAddress: string` | `string \| null` | Reverse-lookup: finds an agent ID by Algorand wallet address; checks cache then queries DB |
| `listAvailable` | _(none)_ | `Promise<AgentDirectoryEntry[]>` | Lists all agents from DB and resolves each to a directory entry |
| `clearCache` | _(none)_ | `void` | Clears the in-memory resolution cache |

#### AgentWalletService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, config: AlgoChatConfig, service: AlgoChatService` | `AgentWalletService` | Creates service with DB, config, and AlgoChat service references |
| `ensureWallet` | `agentId: string` | `Promise<void>` | Ensures agent has a wallet on localnet: restores from keystore or auto-creates, funds, and publishes key. No-op on testnet/mainnet |
| `fundAgent` | `agentId: string, microAlgos: number` | `Promise<void>` | Funds an agent's wallet with a specific amount from the master account |
| `getAgentChatAccount` | `agentId: string` | `Promise<AgentChatAccount \| null>` | Decrypts the stored mnemonic and returns the agent's ChatAccount; on localnet, re-creates wallet if decryption fails |
| `getBalance` | `address: string` | `Promise<number>` | Queries the on-chain ALGO balance in microAlgos for an address |
| `checkAndRefill` | `agentId: string` | `Promise<void>` | On localnet, auto-refills agent wallet if balance drops below 1 ALGO (refills 5 ALGO) |
| `publishAllKeys` | _(none)_ | `Promise<void>` | Publishes encryption keys for all agents with wallets on localnet; called at startup |

#### DiscoveryService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, config: AlgoChatConfig, service: AlgoChatService, isOwnerFn: IsOwnerFn` | `DiscoveryService` | Creates service with DB, config, AlgoChat service, and owner check function |
| `setApprovalManager` | `manager: ApprovalManager` | `void` | Injects the approval manager for fast-polling checks |
| `seedConversations` | _(none)_ | `void` | Seeds the SyncManager with known conversation participants from DB; sets lastFetchedRound to lastRound + 1 |
| `startDiscoveryPolling` | _(none)_ | `void` | Starts periodic discovery polling for new senders on the configured syncInterval; runs immediately then repeats |
| `stopDiscoveryPolling` | _(none)_ | `void` | Stops the discovery polling timer |
| `discoverNewSenders` | _(none)_ | `Promise<void>` | Queries the Algorand indexer for incoming transactions from unknown senders; adds authorized senders to the SyncManager |
| `startFastPolling` | _(none)_ | `void` | Starts 5-second polling interval for rapid approval response detection; auto-stops when no pending requests |
| `stopFastPolling` | _(none)_ | `void` | Stops the fast-polling timer |
| `getAgentWalletAddresses` | _(none)_ | `Set<string>` | Returns cached set of all agent wallet addresses including the main chat account; refreshed every 60 seconds |
| `findAgentForNewConversation` | _(none)_ | `string \| null` | Returns the configured default agent ID, or first auto-enabled agent, or first available agent |
| `getDefaultProjectId` | _(none)_ | `string` | Gets or creates a default project ID for new AlgoChat sessions |
| `cleanup` | _(none)_ | `void` | Stops all timers (fast-polling and discovery); called during bridge shutdown |

## Invariants

1. `AgentDirectory.resolve()` always caches successful results; subsequent calls for the same `agentId` return from cache without DB or wallet queries.
2. `AgentWalletService.ensureWallet()` is a no-op on non-localnet networks; wallet creation is only automatic on localnet.
3. On localnet, if a stored mnemonic cannot be decrypted (key mismatch), `getAgentChatAccount` automatically re-creates the wallet, funds it, and publishes a new key.
4. The persistent wallet keystore (file-based) survives DB rebuilds; `ensureWallet` checks it before creating a new wallet.
5. `DiscoveryService.discoverNewSenders()` only adds senders that pass the `isOwnerFn` authorization check.
6. `DiscoveryService.seedConversations()` sets `lastFetchedRound` to `lastRound + 1` to avoid re-processing already-seen messages.
7. Agent wallet address cache in `DiscoveryService` has a 60-second TTL before refresh.
8. Fast-polling automatically stops when the approval manager reports no pending requests.
9. `checkAndRefill` only operates on localnet and uses a threshold of 1 ALGO and refill amount of 5 ALGO.
10. Default funding amount for new agent wallets is 10 ALGO.

## Behavioral Examples

### Scenario: First-time agent wallet creation on localnet
- **Given** an agent exists in the DB without a wallet address, and no keystore entry exists
- **When** `ensureWallet(agentId)` is called on localnet
- **Then** a new wallet is created, stored encrypted in the DB, saved to the persistent keystore, funded with 10 ALGO via KMD dispenser, and the encryption key is published on-chain

### Scenario: Wallet restoration from keystore after DB rebuild
- **Given** an agent's wallet exists in the persistent keystore but not in the DB (DB was rebuilt)
- **When** `ensureWallet(agentId)` is called
- **Then** the wallet address and encrypted mnemonic are restored from the keystore into the DB, balance is checked, and re-funded if zero

### Scenario: Discovering new senders via indexer
- **Given** the indexer returns transactions from an address not yet in the SyncManager
- **When** `discoverNewSenders()` runs and the sender passes `isOwnerFn`
- **Then** a new conversation is created in the SyncManager for that sender

### Scenario: Resolving agent directory entry
- **Given** an agent exists in the DB with a wallet address
- **When** `AgentDirectory.resolve(agentId)` is called
- **Then** the agent's directory entry is returned with wallet address and encryption public key, and cached for future lookups

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Agent not found in DB during `resolve()` | Returns `null` |
| Public key discovery fails during `resolve()` | Entry is returned with `publicKey: null`; logged at debug level |
| Wallet creation fails on localnet | Error is logged; `ensureWallet` returns silently |
| Mnemonic decryption fails on non-localnet | Returns `null`; error logged |
| Mnemonic decryption fails on localnet | Wallet is re-created automatically; if re-creation also fails, returns `null` |
| No indexer client available | `discoverNewSenders()` returns immediately |
| Balance query fails | Returns `0`; error logged |
| KMD default wallet not found during funding | Throws `NotFoundError` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/algochat/config.ts` | `AlgoChatConfig` (network, mnemonic, syncInterval, defaultAgentId, ownerAddresses) |
| `server/algochat/service.ts` | `AlgoChatService` (algodClient, indexerClient, chatAccount, syncManager, algorandService) |
| `server/db/agents.ts` | `getAgent`, `setAgentWallet`, `getAgentWalletMnemonic`, `addAgentFunding`, `listAgents`, `getAlgochatEnabledAgents` |
| `server/db/sessions.ts` | `listConversations` |
| `server/db/projects.ts` | `listProjects`, `createProject` |
| `server/lib/crypto.ts` | `encryptMnemonic`, `decryptMnemonic` |
| `server/lib/wallet-keystore.ts` | `getKeystoreEntry`, `saveKeystoreEntry` |
| `server/lib/secure-wipe.ts` | `wipeBuffer` |
| `server/lib/logger.ts` | `createLogger` |
| `server/lib/errors.ts` | `NotFoundError` |
| `server/process/approval-manager.ts` | `ApprovalManager` (for fast-polling checks) |
| `@corvidlabs/ts-algochat` | `createRandomChatAccount`, `createChatAccountFromMnemonic`, `ChatAccount` |
| `algosdk` | Algorand SDK for transaction construction, KMD dispenser operations |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/bridge.ts` | `AgentDirectory`, `AgentWalletService`, `DiscoveryService` (instantiation and lifecycle management) |
| `server/algochat/on-chain-transactor.ts` | `AgentWalletService` (wallet resolution), `AgentDirectory` (recipient resolution) |
| `server/algochat/command-handler.ts` | `DiscoveryService` via `CommandHandlerContext` (findAgentForNewConversation, getDefaultProjectId) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
