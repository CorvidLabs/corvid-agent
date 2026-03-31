---
spec: bridge.spec.md
---

## User Stories

- As an agent operator, I want to send and receive encrypted messages over the Algorand blockchain so that agent conversations are tamper-proof and verifiable on-chain
- As a platform administrator, I want to manage PSK (pre-shared key) contacts so that mobile users can securely communicate with agents via encrypted channels
- As an agent operator, I want slash commands (`/status`, `/stop`, `/work`, `/council`, `/credits`, `/schedule`) available over AlgoChat so that I can manage agent operations from any Algorand wallet
- As a team agent, I want to receive and respond to on-chain messages routed through the AlgoChat bridge so that I can serve users communicating via Algorand
- As an external agent, I want to send `[WORK]` prefixed messages to delegate tasks to other agents so that agent-to-agent collaboration works over the blockchain
- As a platform administrator, I want per-agent conversation access control (private, allowlist, public modes) so that I can restrict who can talk to each agent
- As an agent operator, I want group message reassembly so that long messages split across multiple transactions are handled transparently
- As a platform administrator, I want the PSK discovery poller to automatically find mobile wallet addresses via trial decryption so that new contacts are onboarded without manual address entry

## Acceptance Criteria

- `AlgoChatBridge` starts all PSK managers, sync polling, and discovery polling when `start()` is called, and stops them cleanly on `stop()`
- Incoming on-chain messages from addresses not in `config.ownerAddresses` are rejected with an on-chain error reply (owner authorization enforced)
- Local/dashboard chat messages (when `responseFn` is provided to `CommandHandler.handleCommand`) bypass owner authorization checks
- Multi-part group messages prefixed with `[GRP:N/M]` are buffered and reassembled; stale chunks older than 5 minutes are pruned
- On-chain message deduplication tracks `txid` in `processedTxids`; the set is pruned when it exceeds 500 entries
- `PSKContactManager` creates contacts with random 32-byte keys; `createPSKContact` returns `{ id, uri, nickname }`
- `PSKDiscoveryPoller` trial-decrypts blockchain transactions with each unmatched contact's PSK and records the mobile address on success
- `loadAlgoChatConfig` caches its result as a singleton; on `mainnet`, missing `ALGOCHAT_OWNER_ADDRESSES` calls `process.exit(1)`
- PSK URIs follow the format `algochat-psk://v1?addr=ADDRESS&psk=BASE64URL_PSK&label=LABEL` and PSK must decode to exactly 32 bytes
- `checkConversationAccess` enforces per-agent access modes (private, allowlist, public), per-address rate limits, and blocklisting
- The primary agent defaults to `private` conversation mode; mode changes require owner confirmation
- Approval responses (YES/NO patterns) from on-chain messages are forwarded to `approvalManager` when set
- Numbered option responses are forwarded to `ownerQuestionManager` when set
- Messages from known agent addresses (via `agentDirectory`) are routed to the messenger system, not user sessions
- On localnet, new conversations from wallets with insufficient balance trigger auto-funding via `agentWalletService`

## Constraints

- Requires `ALGOCHAT_MNEMONIC` environment variable for on-chain identity (except localnet which enables without it)
- `ALGOCHAT_SYNC_INTERVAL` defaults to 30,000ms; must be a valid number
- Owner addresses are validated with `algosdk.isValidAddress()` and uppercased for case-insensitive matching
- `CommandHandler` privileged commands (`/stop`, `/approve`, `/deny`, `/mode`, `/work`, `/agent`, `/council`, `/extend`, `/schedule`) require owner authorization; `isOwner` is fail-closed
- Council creation requires at least 2 agents; `/extend` clamps minutes to [1, 120]
- `/history` output is limited to 20 transactions
- `WorkCommandRouter.handleAgentWorkRequest` always creates an `agent_messages` DB row before attempting task creation
- Council stage listener has a 45-minute safety timeout

## Out of Scope

- Direct wallet-to-wallet payments (handled by the wallet service module)
- Algorand smart contract deployment or ABI interaction
- Non-Algorand blockchain support
- Message encryption at rest in the local database (messages are encrypted only in transit on-chain)
- Web UI rendering of AlgoChat conversations (handled by the frontend)
