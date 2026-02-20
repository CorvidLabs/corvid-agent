---
module: algochat-bridge
version: 1
status: active
files:
  - server/algochat/bridge.ts
db_tables:
  - algochat_conversations
  - algochat_psk_state
  - algochat_messages
  - psk_contacts
depends_on:
  - specs/process/process-manager.spec.md
  - specs/db/sessions.spec.md
---

# AlgoChat Bridge

## Purpose

Central orchestrator for the AlgoChat on-chain messaging system. Bridges Algorand blockchain messaging with the agent session system. Composes four focused services (ResponseFormatter, CommandHandler, SubscriptionManager, DiscoveryService) and handles message routing, PSK contact management, group message reassembly, approval/question forwarding, and discovery polling for unmatched contacts.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `AlgoChatEventCallback` | Re-exported from `./response-formatter` — callback for AlgoChat events |
| `LocalChatSendFn` | Re-exported from `./subscription-manager` — function to send local chat messages |
| `LocalChatEvent` | Re-exported from `./subscription-manager` — local chat event type |
| `LocalChatEventFn` | Re-exported from `./subscription-manager` — local chat event callback |

### Exported Classes

| Class | Description |
|-------|-------------|
| `AlgoChatBridge` | Central orchestrator composing ResponseFormatter, CommandHandler, SubscriptionManager, DiscoveryService |

#### AlgoChatBridge Constructor

| Parameter | Type | Description |
|-----------|------|-------------|
| `db` | `Database` | SQLite database handle |
| `processManager` | `ProcessManager` | For starting/resuming sessions |
| `config` | `AlgoChatConfig` | AlgoChat configuration (mnemonic, network, sync interval) |
| `service` | `AlgoChatService` | Low-level on-chain messaging service |

#### AlgoChatBridge Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setAgentWalletService` | `(service: AgentWalletService)` | `void` | Late-inject wallet service |
| `getAgentWalletService` | `()` | `AgentWalletService \| null` | Get the injected wallet service |
| `setAgentDirectory` | `(directory: AgentDirectory)` | `void` | Late-inject agent directory |
| `setApprovalManager` | `(manager: ApprovalManager)` | `void` | Late-inject approval manager for forwarding approvals to chat |
| `setOwnerQuestionManager` | `(manager: OwnerQuestionManager)` | `void` | Late-inject owner question manager |
| `setWorkTaskService` | `(service: WorkTaskService)` | `void` | Late-inject work task service |
| `setAgentMessenger` | `(messenger: AgentMessenger)` | `void` | Late-inject agent messenger |
| `sendApprovalRequest` | `(participant: string, request: ApprovalRequestWire)` | `Promise<void>` | Send a tool approval request to a participant via on-chain message |
| `start` | `()` | `void` | Start all PSK managers, sync polling, and discovery polling |
| `stop` | `()` | `void` | Stop all PSK managers, polling timers, and session subscriptions |
| `onEvent` | `(callback: AlgoChatEventCallback)` | `void` | Subscribe to AlgoChat events |
| `offEvent` | `(callback: AlgoChatEventCallback)` | `void` | Unsubscribe from events |
| `getStatus` | `()` | `Promise<AlgoChatStatus>` | Get system status (wallet address, network, contacts, conversations) |
| `getPSKExchangeURI` | `()` | `{ uri, address, network, label } \| null` | Get the PSK exchange URI for the first contact |
| `generatePSKExchangeURI` | `()` | `{ uri, address, network, label }` | Generate a new PSK exchange URI |
| `createPSKContact` | `(nickname: string)` | `{ id, uri, nickname }` | Create a new PSK contact with random key |
| `listPSKContacts` | `()` | `Array<{ id, nickname, ... }>` | List all PSK contacts with status |
| `renamePSKContact` | `(id: string, nickname: string)` | `boolean` | Rename a PSK contact |
| `cancelPSKContact` | `(id: string)` | `boolean` | Deactivate a PSK contact and clean up |
| `getPSKContactURI` | `(id: string)` | `string \| null` | Get the exchange URI for a specific contact |
| `getCommandHandler` | `()` | `CommandHandler` | Access the command handler for route forwarding |
| `handleLocalMessage` | `(agentId, content, sendFn, eventFn?)` | `Promise<void>` | Handle a message from the local web UI chat |
| `handleIncomingMessage` | `(participant, content, confirmedRound, txid?)` | `Promise<void>` | Handle an incoming on-chain message (main routing logic) |

## Invariants

1. **PSK contact isolation**: Each PSK contact has its own `PSKManager` instance. Mobile address discovery is per-contact, with reverse lookup via `pskAddressToId` map
2. **On-chain message dedup**: Incoming messages are tracked by `txid` in `processedTxids` set. Set is pruned when it exceeds 500 entries (oldest removed)
3. **Group message reassembly**: Multi-part group messages (prefixed with `[GRP:N/M]`) are buffered in `pendingGroupChunks` and reassembled when all parts arrive. Stale chunks (>5 minutes) are pruned
4. **Owner authorization**: On-chain messages from non-owner addresses are rejected with an on-chain error reply. Owner addresses are checked against `config.ownerAddresses`
5. **Approval forwarding**: When `approvalManager` is set, incoming messages are checked for approval responses (YES/NO patterns) before normal processing
6. **Question forwarding**: When `ownerQuestionManager` is set, incoming messages are checked for numbered option responses before normal processing
7. **Agent message routing**: Messages from known agent addresses (via `agentDirectory`) are routed to the messenger system instead of creating user sessions
8. **Discovery polling**: Unmatched PSK contacts trigger a discovery poller that scans blockchain transactions to our address, trial-decrypts with each unmatched contact's PSK to find the sender's address
9. **Session lifecycle**: Each conversation gets a linked session. The bridge subscribes to session events and forwards responses back on-chain. Session exit and errors are reported to the participant
10. **Localnet auto-funding**: On localnet, new conversations from wallets with insufficient balance trigger auto-funding via `agentWalletService`

## Behavioral Examples

### Scenario: Incoming on-chain message from owner

- **Given** a configured AlgoChat bridge with owner addresses
- **When** a message arrives from an owner address for the first time
- **Then** a conversation record is created, a new session is started, and the bridge subscribes to session events
- **When** the session produces a response
- **Then** the response is sent back on-chain to the participant

### Scenario: PSK contact discovery

- **Given** a PSK contact created but mobile address not yet known
- **When** the discovery poller runs and finds a transaction to our address
- **Then** the poller trial-decrypts the note with each unmatched contact's PSK
- **When** decryption succeeds for a contact
- **Then** the mobile address is recorded, the PSK manager starts listening, and discovery polling stops if no more unmatched contacts remain

### Scenario: Group message reassembly

- **Given** an incoming message with prefix `[GRP:1/3]`
- **When** parts 2/3 and 3/3 arrive
- **Then** the message is reassembled and processed as a single message
- **If** not all parts arrive within 5 minutes
- **Then** stale chunks are pruned from the buffer

### Scenario: Approval response via on-chain

- **Given** a pending approval request for a session
- **When** the owner sends "YES" on-chain
- **Then** the bridge parses it as an approval response and resolves the approval

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Message from non-owner address | On-chain error reply: owner-only access |
| Agent not found for conversation | Message dropped with log warning |
| Session start fails | Error sent on-chain to participant |
| PSK contact not found for cancel | Returns `false` |
| Discovery poller finds no transactions | Continues polling at next interval |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/sessions.ts` | `getConversationByParticipant`, `createConversation`, `updateConversationRound`, `listConversations`, `createSession` |
| `server/db/agents.ts` | `getAgent` |
| `server/process/manager.ts` | `ProcessManager` for session lifecycle |
| `server/algochat/config.ts` | `AlgoChatConfig` type |
| `server/algochat/service.ts` | `AlgoChatService` for on-chain messaging |
| `server/algochat/psk.ts` | `PSKManager` for encrypted contacts |
| `server/algochat/response-formatter.ts` | `ResponseFormatter` |
| `server/algochat/command-handler.ts` | `CommandHandler` |
| `server/algochat/subscription-manager.ts` | `SubscriptionManager` |
| `server/algochat/discovery-service.ts` | `DiscoveryService` |
| `server/algochat/group-sender.ts` | `parseGroupPrefix`, `reassembleGroupMessage` |
| `server/algochat/approval-format.ts` | `formatApprovalForChain`, `parseApprovalResponse` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Lifecycle: construction, `start()`, `stop()`, service wiring |
| `server/ws/handler.ts` | `onEvent`, `offEvent` for WebSocket event forwarding |
| `server/routes/algochat.ts` | All PSK contact methods, `getStatus`, `handleLocalMessage` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
