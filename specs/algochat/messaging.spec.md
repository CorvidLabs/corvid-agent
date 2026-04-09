---
module: algochat-messaging
version: 1
status: active
files:
  - server/algochat/agent-messenger.ts
  - server/algochat/group-sender.ts
  - server/algochat/response-formatter.ts
  - server/algochat/approval-format.ts
  - server/algochat/condenser.ts
db_tables:
  - agent_messages
  - algochat_messages
  - algochat_conversations
depends_on:
  - specs/algochat/service.spec.md
  - specs/process/process-manager.spec.md
tracks: [1458]
---

# AlgoChat Messaging

## Purpose

Handles agent-to-agent messaging (invoke, response lifecycle, on-chain payments), on-chain message splitting and reassembly for oversized payloads, response routing and event emission, approval request formatting and parsing, and intelligent message condensation for on-chain byte limits.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `splitMessage` | `(content: string, maxPayload?: number)` | `string[]` | Split a message into byte-limited chunks with `[GRP:N/M]` prefixes. Single-chunk messages have no prefix |
| `sendGroupMessage` | `(service: AlgoChatService, senderAccount: ChatAccount, recipientAddress: string, recipientPublicKey: Uint8Array, content: string, paymentMicro?: number)` | `Promise<GroupSendResult>` | Send a message on-chain, automatically splitting into an atomic group transaction if content exceeds single-envelope limit |
| `parseGroupPrefix` | `(content: string)` | `{ index: number; total: number; body: string } \| null` | Parse a `[GRP:N/M]` prefix from a decrypted message chunk |
| `reassembleGroupMessage` | `(chunks: string[])` | `string \| null` | Reassemble group message chunks into original content. Returns null if the set is incomplete or indices are invalid |
| `formatApprovalForChain` | `(request: ApprovalRequest)` | `string` | Format an approval request for on-chain sending with short ID prefix and reply instructions |
| `parseApprovalResponse` | `(content: string)` | `{ shortId: string; behavior: 'allow' \| 'deny' } \| null` | Parse a user's on-chain reply to an approval request (yes/approve/y or no/deny/n + shortId) |
| `condenseMessage` | `(content: string, maxBytes?: number, messageId?: string)` | `Promise<CondensationResult>` | Condense a message to fit within a byte limit using LLM summarization, with truncation fallback |

### Exported Types

| Type | Description |
|------|-------------|
| `AgentInvokeRequest` | Request to invoke an agent: `fromAgentId`, `toAgentId`, `content`, optional `paymentMicro`, `projectId`, `threadId`, `depth`, `fireAndForget` |
| `AgentInvokeResult` | Result of agent invocation: `{ message: AgentMessage; sessionId: string \| null }` |
| `GroupSendResult` | Result of a group send: `{ primaryTxid: string; txids: string[]; fee: number }` |
| `AlgoChatEventCallback` | Callback `(participant: string, content: string, direction: 'inbound' \| 'outbound' \| 'status', fee?: number) => void` for AlgoChat feed events |
| `CondensationResult` | Result of condensation: `{ content: string; wasCondensed: boolean; originalBytes: number; condensedBytes: number }` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `AgentMessenger` | Manages agent-to-agent message invocation, on-chain payment dispatch, response buffering, and fire-and-forget delivery |
| `ResponseFormatter` | Routes response messages to PSK contacts or on-chain, emits feed events, and persists messages to DB |

#### AgentMessenger Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setWorkCommandRouter` | `(router: WorkCommandRouter)` | `void` | Inject the work command router for handling `[WORK]` prefixed messages |
| `onMessageUpdate` | `(cb: (message: AgentMessage) => void)` | `() => void` | Register a callback for agent message status changes; returns unsubscribe function |
| `invoke` | `(request: AgentInvokeRequest)` | `Promise<AgentInvokeResult>` | Send an agent-to-agent message with on-chain payment, create a session for the target agent, and subscribe for response |
| `invokeAndWait` | `(request: AgentInvokeRequest, timeoutMs?: number)` | `Promise<{ response: string; threadId: string }>` | Invoke an agent and wait for the full response text (default 5 minute timeout) |
| `sendOnChainToSelf` | `(agentId: string, content: string)` | `Promise<string \| null>` | Send an on-chain message from an agent to itself (for memory/audit storage) |
| `sendNotificationToAddress` | `(fromAgentId: string, toAddress: string, content: string)` | `Promise<string \| null>` | Send a notification to an arbitrary Algorand address. Best-effort, never throws |
| `sendOnChainBestEffort` | `(fromAgentId: string, toAgentId: string, content: string, messageId?: string)` | `Promise<string \| null>` | Best-effort on-chain message send. Returns txid or null, never throws |

#### ResponseFormatter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setAgentWalletService` | `(service: AgentWalletService)` | `void` | Inject the optional agent wallet service for per-agent sending |
| `setOnChainTransactor` | `(transactor: OnChainTransactor)` | `void` | Inject the OnChainTransactor for on-chain message delivery |
| `setPskManagerLookup` | `(fn: (address: string) => PSKManager \| null)` | `void` | Inject a PSK manager lookup function for multi-contact PSK routing |
| `onEvent` | `(callback: AlgoChatEventCallback)` | `void` | Register a callback for AlgoChat feed events |
| `offEvent` | `(callback: AlgoChatEventCallback)` | `void` | Unregister a feed event callback |
| `sendResponse` | `(participant: string, content: string)` | `Promise<void>` | Send a response on-chain. Routes through PSK if available, otherwise via OnChainTransactor or direct send |
| `emitEvent` | `(participant: string, content: string, direction: 'inbound' \| 'outbound' \| 'status', fee?: number)` | `void` | Emit a feed event: persists to DB and notifies all registered callbacks |
| `splitPskContent` | `(content: string, maxBytes: number)` | `string[]` | Split content into byte-limited chunks for PSK sends, breaking at newlines when possible |

## Invariants

1. **Self-invocation prevention**: `AgentMessenger.invoke` throws `ValidationError` if `fromAgentId === toAgentId`
2. **Agent existence**: Both source and target agents must exist in the database or `NotFoundError` is thrown
3. **Default payment**: If no `paymentMicro` is specified, defaults to 1000 microAlgos (0.001 ALGO)
4. **Thread ID generation**: If no `threadId` is provided, a new UUID is generated for the conversation thread
5. **Thread history cap**: Conversation history for threads is capped at 10 exchanges or 8000 characters
6. **Fire-and-forget semantics**: When `fireAndForget` is true, the message is marked completed immediately after delivery with no session created and no response expected
7. **Work command routing**: Messages starting with `[WORK]` are routed through `WorkCommandRouter` if available, bypassing normal session creation
8. **Circuit breaker integration**: `MessagingGuard` check is performed before message dispatch; blocked messages are created in `failed` state with appropriate error codes (`CIRCUIT_OPEN` or `RATE_LIMITED`)
9. **On-chain cost tracking**: Initial on-chain send cost is tracked against the new session via `updateSessionAlgoSpent`
10. **Response buffering**: Agent responses are buffered per-turn; only the last turn's response is used for the final reply
11. **Group message atomicity**: Multi-chunk messages are sent as an Algorand atomic group transaction (all-or-nothing delivery)
12. **Group prefix format**: Multi-chunk messages use `[GRP:N/M]` prefix per chunk; single-chunk messages have no prefix
13. **First chunk carries payment**: In multi-chunk group transactions, only the first transaction carries the payment amount; remaining transactions use the minimum payment
14. **PSK chunking with delay**: Oversized PSK messages are split into 800-byte chunks with 4.5-second delays between sends to ensure different block ordering
15. **Response routing order**: `sendResponse` routes PSK contacts first, then per-agent wallet via OnChainTransactor, then falls back to direct send
16. **Spending limit enforcement**: `sendResponse` checks the daily ALGO spending limit before sending; blocked messages are logged as dead letters
17. **Event persistence**: `emitEvent` persists every message to the `algochat_messages` table before notifying callbacks
18. **Approval description truncation**: Approval descriptions exceeding 700 bytes are truncated with binary-safe byte slicing
19. **Condensation cascade**: `condenseMessage` tries the default LLM provider first, then all registered providers, then falls back to byte truncation
20. **Condensation reference suffix**: When a `messageId` is provided, a reference suffix `[full: NNB, id:XXXXXXXX]` is appended so the full content can be looked up from the on-chain record
21. **Condensation passthrough**: Messages already within the byte limit are returned unchanged with `wasCondensed: false`

## Behavioral Examples

### Scenario: Standard agent-to-agent invoke
- **Given** agent A and agent B both exist in the database
- **When** `invoke({ fromAgentId: A, toAgentId: B, content: "Hello" })` is called
- **Then** an `agent_messages` row is created, on-chain payment is sent, a session is created for agent B, and the response is subscribed for delivery

### Scenario: Fire-and-forget message
- **Given** agent A and agent B both exist
- **When** `invoke({ fromAgentId: A, toAgentId: B, content: "FYI", fireAndForget: true })` is called
- **Then** the message is marked `completed` immediately, no session is created, `sessionId` is null in the result

### Scenario: Circuit breaker blocks invocation
- **Given** the messaging guard has an open circuit for agent B
- **When** `invoke({ fromAgentId: A, toAgentId: B, content: "Hello" })` is called
- **Then** a message row is created in `failed` state with `errorCode: 'CIRCUIT_OPEN'`, no session is started

### Scenario: Invoke and wait with timeout
- **Given** agent A invokes agent B via `invokeAndWait`
- **When** the session completes within the timeout
- **Then** returns `{ response, threadId }` with the agent's full response text

### Scenario: Message exceeds single envelope
- **Given** a message content exceeds the AlgoChat single-envelope byte limit (866 bytes plaintext)
- **When** `sendGroupMessage` is called
- **Then** the message is split into chunks with `[GRP:N/M]` prefixes, encrypted, grouped atomically with `assignGroupID`, signed, and submitted as a single batch

### Scenario: Single-chunk message
- **Given** a message fits within the single-envelope limit
- **When** `splitMessage` is called
- **Then** returns a single-element array with no `[GRP:]` prefix

### Scenario: Group message reassembly
- **Given** three chunks `[GRP:1/3]AAA`, `[GRP:3/3]CCC`, `[GRP:2/3]BBB` (out of order)
- **When** `reassembleGroupMessage` is called
- **Then** returns `AAABBBCCC` (sorted by index)

### Scenario: Incomplete group
- **Given** only 2 of 3 expected group chunks are provided
- **When** `reassembleGroupMessage` is called
- **Then** returns `null`

### Scenario: PSK response routing
- **Given** a participant address has a PSK manager registered
- **When** `sendResponse(participant, longContent)` is called
- **Then** content is split into 800-byte chunks and sent sequentially with 4.5s delays

### Scenario: Approval request formatting
- **Given** an `ApprovalRequest` with id `abc12345...` and description "Delete file X"
- **When** `formatApprovalForChain(request)` is called
- **Then** returns `[APPROVE?:abc12345] Delete file X\n\nReply 'yes abc12345' or 'no abc12345'`

### Scenario: Approval response parsing
- **Given** content `"yes abc12345"`
- **When** `parseApprovalResponse(content)` is called
- **Then** returns `{ shortId: 'abc12345', behavior: 'allow' }`

### Scenario: Condensation within limit
- **Given** a message of 500 bytes and maxBytes of 800
- **When** `condenseMessage(content, 800)` is called
- **Then** returns original content with `wasCondensed: false`

### Scenario: Condensation via LLM
- **Given** a message of 2000 bytes and maxBytes of 800
- **When** `condenseMessage(content, 800, messageId)` is called
- **Then** uses the default LLM provider to summarize, returns condensed content prefixed with `[condensed]` and a reference suffix

### Scenario: Condensation fallback to truncation
- **Given** all LLM providers fail during condensation
- **When** `condenseMessage(content, 800)` is called
- **Then** falls back to byte-truncation with `...` suffix

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Self-invocation (`fromAgentId === toAgentId`) | Throws `ValidationError` |
| Source agent not found | Throws `NotFoundError` |
| Target agent not found | Throws `NotFoundError` |
| Circuit breaker open for target | Message created in `failed` state with `CIRCUIT_OPEN` error code |
| Rate limit exceeded | Message created in `failed` state with `RATE_LIMITED` error code |
| Spending limit blocks on-chain send | Message marked `failed` with `SPENDING_LIMIT` error code |
| On-chain payment send fails | Warning logged, proceeds without txid |
| Agent response is empty | Message marked `failed` with `EMPTY_RESPONSE` error code |
| On-chain response send fails | Message marked `failed` with `RESPONSE_SEND_FAILED` error code |
| `invokeAndWait` timeout exceeded | Resolves with partial response if available, rejects if no response at all |
| `invokeAndWait` no session created | Throws `ExternalServiceError` |
| `splitMessage` with non-positive maxPayload | Throws `ValidationError` |
| Daily ALGO spending limit exceeded in `sendResponse` | Message logged as dead letter, send skipped |
| PSK send failure | Error logged as dead letter with full context |
| On-chain send failure in `sendResponse` | Dead letter logged with participant, conversation, content preview |
| All LLM providers fail during condensation | Falls back to byte truncation with `...` suffix |
| Event callback throws | Error swallowed, logged, other callbacks still called |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@corvidlabs/ts-algochat` | `ChatAccount`, `encryptMessage`, `encodeEnvelope`, `PROTOCOL` constants |
| `algosdk` | `makePaymentTxnWithSuggestedParamsFromObject`, `assignGroupID`, `Transaction` |
| `server/algochat/service` | `AlgoChatService` type |
| `server/algochat/config` | `AlgoChatConfig` type |
| `server/algochat/on-chain-transactor` | `OnChainTransactor` for on-chain message delivery |
| `server/algochat/agent-wallet` | `AgentWalletService` for per-agent wallet selection |
| `server/algochat/psk` | `PSKManager` for PSK message routing |
| `server/algochat/work-command-router` | `WorkCommandRouter` for `[WORK]` message handling |
| `server/algochat/messaging-guard` | `MessagingGuard`, `MessagingGuardConfig` for circuit breaker and rate limiting |
| `server/process/manager` | `ProcessManager` (subscribe, unsubscribe, startProcess, isRunning) |
| `server/process/types` | `ClaudeStreamEvent`, `extractContentText` |
| `server/process/approval-types` | `ApprovalRequest` type |
| `server/db/agents` | `getAgent` |
| `server/db/sessions` | `createSession`, `getConversationByParticipant`, `updateSessionAlgoSpent` |
| `server/db/agent-messages` | `createAgentMessage`, `updateAgentMessageStatus`, `getAgentMessage`, `getThreadMessages` |
| `server/db/spending` | `checkAlgoLimit` |
| `server/db/algochat-messages` | `saveAlgoChatMessage` |
| `server/db/audit` | `recordAudit` |
| `server/db/projects` | `listProjects`, `createProject` (lazy require for default project) |
| `server/lib/logger` | `createLogger` |
| `server/lib/errors` | `ValidationError`, `NotFoundError`, `ExternalServiceError` |
| `server/observability/event-context` | `createEventContext`, `runWithEventContext` |
| `server/observability/metrics` | `agentMessagesTotal` counter |
| `server/providers/registry` | `LlmProviderRegistry` (for condensation) |
| `shared/types` | `AgentMessage` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `AgentMessenger` instantiation at startup |
| `server/routes/agents.ts` | `AgentMessenger.invoke` for agent-to-agent API |
| `server/routes/councils.ts` | `AgentMessenger` for council discussion messaging |
| `server/routes/mcp-api.ts` | `AgentMessenger` for MCP API message sending |
| `server/process/manager.ts` | `AgentMessenger` for tool-initiated agent invocations |
| `server/ws/handler.ts` | `AgentMessenger.onMessageUpdate` for WebSocket broadcasting |
| `server/workflow/service.ts` | `AgentMessenger` for workflow step messaging |
| `server/scheduler/service.ts` | `AgentMessenger` for scheduled agent invocations |
| `server/councils/discussion.ts` | `AgentMessenger` for council discussion message dispatch |
| `server/notifications/service.ts` | `AgentMessenger` for notification delivery |
| `server/notifications/question-dispatcher.ts` | `AgentMessenger` for question routing |
| `server/db/memory-sync.ts` | `AgentMessenger` for memory sync messages |
| `server/algochat/bridge.ts` | `ResponseFormatter` class, `AlgoChatEventCallback` type, `formatApprovalForChain`, `parseApprovalResponse` |
| `server/algochat/on-chain-transactor.ts` | `condenseMessage` for on-chain message size management |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
