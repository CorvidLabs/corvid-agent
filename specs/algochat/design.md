---
spec: bridge.spec.md
sources:
  - server/algochat/bridge.ts
  - server/algochat/init.ts
  - server/algochat/psk-contact-manager.ts
  - server/algochat/psk-discovery-poller.ts
  - server/algochat/message-router.ts
---

## Layout

The AlgoChat module lives in `server/algochat/` and contains a constellation of focused services composed by `AlgoChatBridge`:

```
server/algochat/
  bridge.ts                — Central orchestrator (AlgoChatBridge)
  init.ts                  — Service initialization and wiring (initAlgoChat, wirePostInit)
  psk-contact-manager.ts   — PSKContactManager: per-contact encrypted messaging
  psk-discovery-poller.ts  — PSKDiscoveryPoller: blockchain scanning for new contacts
  message-router.ts        — MessageRouter: routes messages to correct handlers
  config.ts                — AlgoChatConfig type and loader
  service.ts               — AlgoChatService: low-level on-chain transaction handling
  psk.ts                   — PSKManager: individual encrypted contact state
  response-formatter.ts    — ResponseFormatter: format agent output for on-chain delivery
  command-handler.ts       — CommandHandler: parse and dispatch [CMD] prefixed messages
  subscription-manager.ts  — SubscriptionManager: session lifecycle subscriptions
  discovery-service.ts     — DiscoveryService: directory-based agent lookup
  work-command-router.ts   — WorkCommandRouter: routes [WORK] commands
  group-sender.ts          — Group message chunking and reassembly
  approval-format.ts       — Approval request/response formatting
```

## Components

### AlgoChatBridge (bridge.ts)
The top-level orchestrator. Composes seven focused services and wires them together:
1. **ResponseFormatter** — formats agent session output into on-chain messages
2. **CommandHandler** — parses `[CMD]`-prefixed messages and dispatches to handlers
3. **SubscriptionManager** — subscribes to session events and forwards responses on-chain
4. **DiscoveryService** — resolves agent addresses via AlgoChat directory
5. **PSKContactManager** — manages the list of PSK contacts and their individual PSKManagers
6. **PSKDiscoveryPoller** — background scanner that trial-decrypts blockchain transactions to find new mobile addresses
7. **MessageRouter** — routes inbound messages based on source type (owner, agent, PSK, unknown)

Late-injected services (set after construction): `AgentWalletService`, `AgentDirectory`, `ApprovalManager`, `OwnerQuestionManager`, `WorkTaskService`, `AgentMessenger`, `OnChainTransactor`.

### PSKContactManager (psk-contact-manager.ts)
Owns the lifecycle of PSK contacts. Each contact has an associated `PSKManager` instance tracking its individual state. Maintains a `pskAddressToId` reverse lookup map for routing inbound messages from discovered mobile addresses.

### PSKDiscoveryPoller (psk-discovery-poller.ts)
Background service that periodically scans the Algorand blockchain for transactions sent to the agent's wallet address. For each transaction, trial-decrypts the note field with each unmatched PSK contact's key. On success, records the mobile address and stops polling if no unmatched contacts remain.

### MessageRouter (message-router.ts)
Routes inbound `handleIncomingMessage` calls to the appropriate handler path:
- Known owner address → normal agent session flow
- Known agent address → `AgentMessenger` routing
- Known PSK address → decrypted PSK session flow
- Unknown address → rejected with on-chain error reply

### DedupService (internal)
Module-level deduplication keyed on Algorand transaction ID. Max 5000 entries, 24-hour TTL, SQLite-persisted for crash recovery.

## Tokens

| Constant/Config | Value | Description |
|-----------------|-------|-------------|
| `ALGORAND_NETWORK` env | `localnet` | Network selection; `testnet`/`mainnet` for external comms only |
| Dedup max entries | 5000 | Maximum tracked transaction IDs |
| Dedup TTL | 24 hours | Auto-prune window for seen transactions |
| Group chunk timeout | 5 minutes | Stale partial group messages are pruned |
| Session source | `'agent'` | AlgoChat-sourced sessions use this `source` value |
| `ownerAddresses` | from config | Addresses authorized to send messages to the agent |

## Assets

### Database Tables
- `algochat_conversations` — conversation records keyed by participant address
- `algochat_psk_state` — PSK contact state (id, nickname, key, mobile address)
- `algochat_messages` — message history
- `psk_contacts` — PSK contact directory

### External Services
- Algorand blockchain (localnet/testnet/mainnet) via `algod` and `indexer` clients
- AlgoChat service for on-chain message submission and polling
- AlgoChat directory contract for agent address lookup

### Consumed By Routes
- `server/routes/index.ts` — PSK contact CRUD endpoints, status endpoint, local message handling
- `server/ws/handler.ts` — WebSocket event forwarding for real-time UI updates
