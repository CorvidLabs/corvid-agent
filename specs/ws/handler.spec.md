---
module: ws-handler
version: 1
status: active
files:
  - server/ws/handler.ts
  - shared/ws-protocol.ts
db_tables: []
depends_on:
  - specs/middleware/auth.spec.md
  - specs/process/process-manager.spec.md
---

# WebSocket Handler

## Purpose

Manages real-time bidirectional communication between the web UI/CLI clients and the server. Handles WebSocket lifecycle (open/message/close), authentication, session event subscriptions, chat routing, approval responses, work task creation, agent invocations, agent rewards, schedule approvals, and owner question responses. Also provides a broadcast helper for AlgoChat messages.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `WsData` | Per-connection data: `{ subscriptions: Map<string, EventCallback>; walletAddress?: string; authenticated: boolean; tenantId?: string; heartbeatTimer?: ...; pongTimeoutTimer?: ...; authTimeoutTimer?: ... }` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createWebSocketHandler` | `(processManager, getBridge, authConfig, getMessenger?, getWorkTaskService?, getSchedulerService?, getOwnerQuestionManager?)` | `{ open, message, close }` | Factory returning Bun WebSocket handler callbacks |
| `broadcastAlgoChatMessage` | `(server, participant, content, direction)` | `void` | Publish an AlgoChat message to all WebSocket clients subscribed to the `algochat` topic |
| `tenantTopic` | `(base: string, tenantId?: string)` | `string` | Build tenant-scoped topic string for pub/sub routing |

### Exported Types (from shared/ws-protocol.ts)

| Type | Description |
|------|-------------|
| `ClientMessage` | Union type of all client-to-server WebSocket message shapes |
| `ClientWsMessage` | Alias for `ClientMessage` (Angular client compatibility) |
| `ServerMessage` | Union type of all server-to-client WebSocket message shapes |
| `ServerWsMessage` | Alias for `ServerMessage` (Angular client compatibility) |
| `ServerMessageType` | String literal union of all `ServerMessage` type discriminants |
| `ServerMessageOfType` | Mapped type extracting a specific `ServerMessage` variant by its `type` discriminant |
| `ServerMessageHandlerMap` | Typed handler map — one optional callback per server message type |
| `SessionEventMessage` | `{ type: 'session_event'; sessionId; event: StreamEvent }` |
| `SessionStatusMessage` | `{ type: 'session_status'; sessionId; status }` |
| `AlgochatMessageEvent` | `{ type: 'algochat_message'; participant; content; direction }` |
| `AgentBalanceMessage` | `{ type: 'agent_balance'; agentId; balance; funded }` |
| `ChatStreamMessage` | `{ type: 'chat_stream'; agentId; chunk; done }` |
| `ChatToolUseMessage` | `{ type: 'chat_tool_use'; agentId; toolName; input }` |
| `ChatThinkingMessage` | `{ type: 'chat_thinking'; agentId; active }` |
| `ChatSessionMessage` | `{ type: 'chat_session'; agentId; sessionId }` |
| `AgentMessageUpdateEvent` | `{ type: 'agent_message_update'; message: AgentMessage }` |
| `ApprovalRequestMessage` | `{ type: 'approval_request'; request: ApprovalRequestWire }` |
| `CouncilStageChangeMessage` | `{ type: 'council_stage_change'; launchId; stage; sessionIds? }` |
| `CouncilLogMessage` | `{ type: 'council_log'; log: CouncilLaunchLog }` |
| `CouncilDiscussionMessageEvent` | `{ type: 'council_discussion_message'; message: CouncilDiscussionMessage }` |
| `WorkTaskUpdateMessage` | `{ type: 'work_task_update'; task: WorkTask }` |
| `ScheduleUpdateMessage` | `{ type: 'schedule_update'; schedule: AgentSchedule }` |
| `ScheduleExecutionUpdateMessage` | `{ type: 'schedule_execution_update'; execution: ScheduleExecution }` |
| `ScheduleApprovalRequestMessage` | `{ type: 'schedule_approval_request'; executionId; scheduleId; agentId; actionType; description }` |
| `OllamaPullProgressMessage` | `{ type: 'ollama_pull_progress'; model; status; progress; downloadedBytes; totalBytes; currentLayer; error? }` |
| `WebhookUpdateMessage` | `{ type: 'webhook_update'; registration: WebhookRegistration }` |
| `WebhookDeliveryMessage` | `{ type: 'webhook_delivery'; delivery: WebhookDelivery }` |
| `MentionPollingUpdateMessage` | `{ type: 'mention_polling_update'; config: MentionPollingConfig }` |
| `WorkflowRunUpdateMessage` | `{ type: 'workflow_run_update'; run: WorkflowRun }` |
| `WorkflowNodeUpdateMessage` | `{ type: 'workflow_node_update'; nodeExecution: WorkflowNodeRun }` |
| `AgentNotificationMessage` | `{ type: 'agent_notification'; agentId; sessionId; title; message; level; timestamp }` |
| `AgentQuestionMessage` | `{ type: 'agent_question'; question: OwnerQuestionWire }` |
| `GovernanceVoteCastMessage` | `{ type: 'governance_vote_cast'; launchId; agentId; vote; weight; weightedApprovalRatio; totalVotesCast; totalMembers }` |
| `GovernanceVoteResolvedMessage` | `{ type: 'governance_vote_resolved'; launchId; status; weightedApprovalRatio; effectiveThreshold; reason }` |
| `GovernanceQuorumReachedMessage` | `{ type: 'governance_quorum_reached'; launchId; weightedApprovalRatio; threshold }` |
| `PingMessage` | `{ type: 'ping'; serverTime }` |
| `WelcomeMessage` | `{ type: 'welcome'; serverTime }` |
| `ErrorMessage` | `{ type: 'error'; message; severity?; errorCode? }` |
| `SessionErrorMessage` | `{ type: 'session_error'; sessionId; error: SessionErrorInfo }` |
| `CouncilAgentErrorMessage` | `{ type: 'council_agent_error'; launchId; agentId; agentName; error: CouncilAgentErrorInfo }` |
| `ApprovalRequestWire` | Wire type for approval requests: `{ id; sessionId; toolName; description; createdAt; timeoutMs }` |
| `OwnerQuestionWire` | Wire type for owner questions: `{ id; sessionId; agentId; question; options; context; createdAt; timeoutMs }` |
| `StreamEvent` | Session stream event payload forwarded via WebSocket (discriminated union on `eventType`) |
| `StreamEventType` | String literal union of all `StreamEvent` eventType discriminants |
| `ContentBlock` | Interface with `type: string` and optional `text?: string`. Represents a content block in assistant messages. |
| `ErrorSeverity` | `'info' \| 'warning' \| 'error' \| 'fatal'` — severity level for structured error messages |
| `SessionErrorInfo` | Structured error info for session failure recovery: `message`, `errorType`, `severity`, `recoverable`, `sessionStatus?` |
| `CouncilAgentErrorInfo` | Structured error info for council agent failures: `message`, `errorType`, `severity`, `stage`, `sessionId?`, `round?` |

### Exported Functions (from shared/ws-protocol.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isClientMessage` | `(data: unknown)` | `data is ClientMessage` | Type guard for validating incoming WebSocket messages |

### Exported Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `HEARTBEAT_INTERVAL_MS` | `30000` | Server-initiated ping interval (ms) |
| `PONG_TIMEOUT_MS` | `10000` | Time to wait for pong before closing (ms) |
| `AUTH_TIMEOUT_MS` | `5000` | Time to wait for post-connect authentication before closing (ms) |

## Client -> Server Messages (ClientMessage)

| Type | Fields | Description |
|------|--------|-------------|
| `auth` | `key: string` | First-message authentication with API key |
| `pong` | _(none)_ | Response to server heartbeat ping |
| `subscribe` | `sessionId: string` | Subscribe to session events for a given session |
| `unsubscribe` | `sessionId: string` | Unsubscribe from session events |
| `send_message` | `sessionId: string, content: string` | Send user input to a running session |
| `chat_send` | `agentId: string, content: string, projectId?: string` | Send a message via the local AlgoChat bridge |
| `agent_invoke` | `fromAgentId, toAgentId, content, paymentMicro?, projectId?` | Invoke one agent from another |
| `approval_response` | `requestId: string, behavior: 'allow' \| 'deny', message?` | Respond to a tool approval request |
| `create_work_task` | `agentId, description, projectId?` | Create a new work task |
| `agent_reward` | `agentId: string, microAlgos: number` | Fund an agent's wallet with ALGO |
| `schedule_approval` | `executionId: string, approved: boolean` | Approve or deny a scheduled execution |
| `question_response` | `questionId: string, answer: string, selectedOption?: number` | Answer an owner question |

## Server -> Client Messages (ServerMessage)

| Type | Key Fields | Description |
|------|------------|-------------|
| `session_event` | `sessionId, event: StreamEvent` | Forwarded session event (assistant output, tool use, etc.) |
| `approval_request` | `request: { id, sessionId, toolName, description, createdAt, timeoutMs }` | Tool approval request from a running session |
| `algochat_message` | `participant, content, direction` | AlgoChat message (inbound/outbound/status) |
| `agent_balance` | `agentId, balance, funded` | Updated agent wallet balance after reward |
| `chat_stream` | `agentId, chunk, done` | Streaming response from local chat |
| `chat_tool_use` | `agentId, toolName, input` | Tool use event from local chat |
| `chat_thinking` | `agentId, active` | Thinking indicator from local chat |
| `chat_session` | `agentId, sessionId` | Session info for local chat |
| `agent_message_update` | `message: AgentMessage` | Agent invocation status update |
| `work_task_update` | `task: WorkTask` | Work task creation or completion update |
| `schedule_execution_update` | `execution: ScheduleExecution` | Schedule execution after approval |
| `ping` | `serverTime: string` | Server heartbeat ping with ISO timestamp for clock sync |
| `welcome` | `serverTime: string` | Sent on connection open after authentication, provides initial clock sync |
| `error` | `message: string` | Error message |

## Invariants

1. **Authentication gate**: All message types except `auth` are rejected with an error if the WebSocket is not authenticated. Unauthenticated clients receive `"Authentication required"` error
2. **Pre-authentication at upgrade**: If the WebSocket was authenticated during HTTP upgrade (via query param or header in `index.ts`), it is marked authenticated at `open` and immediately subscribes to broadcast topics
3. **First-message auth**: If not pre-authenticated, the first message must be `{ type: "auth", key: "<key>" }`. Invalid keys cause close with code 4001
4. **No API key = auto-auth**: When `authConfig.apiKey` is null, any `auth` message auto-authenticates
5. **Timing-safe key comparison**: API key validation uses `timingSafeEqual` to prevent timing attacks
6. **Subscription cleanup on close**: When a WebSocket disconnects, all session subscriptions are cleaned up via `processManager.unsubscribe`
7. **Idempotent subscribe**: If a client subscribes to the same session twice, the second subscribe is silently ignored
8. **Broadcast topics**: Authenticated clients are subscribed to five pub/sub topics: `council`, `algochat`, `scheduler`, `ollama`, `owner`
9. **Safe send**: All outbound messages use `safeSend` which catches and ignores errors from already-closed connections
10. **Agent reward bounds**: `agent_reward` validates `microAlgos` is between 1,000 and 100,000,000 (1 mAlgo to 100 ALGO)
11. **Message validation**: Incoming messages are validated via `isClientMessage` from `shared/ws-protocol.ts`. Invalid JSON or unknown message types are rejected with an error
12. **Heartbeat on authentication**: When a connection becomes authenticated (either pre-auth at upgrade or first-message auth), a `welcome` message with `serverTime` is sent and a heartbeat interval timer starts
13. **Server-initiated ping**: Every 30 seconds, a `ping` message with `serverTime` (ISO string) is sent to authenticated connections
14. **Pong timeout**: After each `ping`, a 10-second timeout is set. If no `pong` is received within that window, the connection is closed with code 4002
15. **Pong clears timeout**: Receiving a `pong` message clears the pending pong timeout timer. `pong` is handled before the authentication gate so it cannot be blocked
16. **Heartbeat cleanup on close**: All heartbeat and pong timeout timers are cleared when a connection closes
17. **Auth timeout**: Unauthenticated connections must authenticate within 5 seconds (`AUTH_TIMEOUT_MS`). If not, the connection is closed with code 4001 (`"Authentication timeout"`)
18. **Auth timeout cleanup**: The auth timeout timer is cleared on successful authentication or connection close

## Behavioral Examples

### Scenario: Pre-authenticated WebSocket connection

- **Given** a WebSocket upgrade with `?key=<valid-key>` (authenticated at upgrade)
- **When** the connection opens
- **Then** `ws.data.authenticated` is true, and the client is subscribed to all 5 broadcast topics

### Scenario: First-message authentication

- **Given** an unauthenticated WebSocket connection
- **When** the client sends `{ "type": "auth", "key": "<valid-key>" }`
- **Then** `ws.data.authenticated` is set to true, broadcast topics are subscribed

### Scenario: Invalid auth key closes connection

- **Given** an unauthenticated WebSocket connection
- **When** the client sends `{ "type": "auth", "key": "wrong" }`
- **Then** an error message is sent and the connection is closed with code 4001

### Scenario: Message before auth is rejected

- **Given** an unauthenticated WebSocket connection
- **When** the client sends `{ "type": "subscribe", "sessionId": "..." }`
- **Then** the server responds with an error: "Authentication required"

### Scenario: Client subscribes to a session

- **Given** an authenticated WebSocket connection
- **When** client sends `{ type: "subscribe", sessionId: "abc" }`
- **Then** the handler creates an `EventCallback`, registers it with `processManager.subscribe`, and stores it in `ws.data.subscriptions`
- **When** the session emits an event
- **Then** the callback serializes it as a `session_event` ServerMessage and sends it to the client

### Scenario: Client sends chat message via AlgoChat

- **Given** an authenticated WebSocket and an active AlgoChat bridge
- **When** client sends `{ type: "chat_send", agentId: "a1", content: "Hello" }`
- **Then** `bridge.handleLocalMessage` is called with a send function that forwards responses as `algochat_message` ServerMessages
- **And** streaming events are forwarded as `chat_stream`, `chat_tool_use`, `chat_thinking`, `chat_session` messages

### Scenario: Approval response forwarding

- **Given** a session with a pending approval request
- **When** client sends `{ type: "approval_response", requestId: "r1", behavior: "allow" }`
- **Then** `processManager.approvalManager.resolveRequest` is called with the response

### Scenario: Heartbeat ping-pong cycle

- **Given** an authenticated WebSocket connection
- **When** 30 seconds elapse after connection
- **Then** the server sends `{ type: "ping", serverTime: "<ISO>" }`
- **When** the client responds with `{ type: "pong" }`
- **Then** the pong timeout timer is cleared

### Scenario: Stale connection detected via pong timeout

- **Given** an authenticated WebSocket connection
- **When** the server sends a `ping` and no `pong` is received within 10 seconds
- **Then** the connection is closed with code 4002

### Scenario: Welcome message on connect

- **Given** a WebSocket upgrade with pre-authentication
- **When** the connection opens
- **Then** the server sends `{ type: "welcome", serverTime: "<ISO>" }` for clock sync

### Scenario: Auth timeout closes idle unauthenticated connection

- **Given** an unauthenticated WebSocket connection (not pre-authenticated at upgrade)
- **When** the client does not send `{ "type": "auth", "key": "..." }` within 5 seconds
- **Then** the server closes the connection with code 4001 and reason `"Authentication timeout"`

### Scenario: WebSocket disconnects with active subscriptions

- **Given** a WebSocket with subscriptions to sessions "s1" and "s2"
- **When** the WebSocket disconnects
- **Then** both subscriptions are unregistered from the ProcessManager and the subscriptions map is cleared

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Invalid JSON message | Error message: `"Invalid JSON"` |
| Message fails `isClientMessage` validation | Error message: `"Invalid message format"` |
| `auth` sent when already authenticated | Error message: `"Already authenticated"` |
| `auth` with invalid key | Error message `"Invalid API key"`, connection closed with code 4001 |
| Non-auth message before authentication | Error message: `"Authentication required..."` |
| `send_message` to non-running session | Error message: `"Session {id} is not running"` |
| `chat_send` when bridge is null | Error message: `"AlgoChat is not available"` |
| `agent_invoke` when messenger is null | Error message: `"Agent messaging not available"` |
| `create_work_task` when service is null | Error message: `"Work task service not available"` |
| `agent_reward` with microAlgos out of range | Error message: `"microAlgos must be between 1000 and 100000000"` |
| `agent_reward` when wallet service is null | Error message: `"Wallet service not available"` |
| `schedule_approval` when scheduler is null | Error message: `"Scheduler service not available"` |
| `schedule_approval` for unknown execution | Error message: `"Execution not found or not awaiting approval"` |
| `question_response` when manager is null | Error message: `"Owner question service not available"` |
| `question_response` for unknown question | Error message: `"Question not found or already answered"` |
| Pong not received within 10s of ping | Connection closed with code 4002 `"Pong timeout"` |
| Auth not completed within 5s of connect | Connection closed with code 4001 `"Authentication timeout"` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` — subscribe/unsubscribe to session events, sendMessage, approvalManager |
| `server/algochat/bridge.ts` | `AlgoChatBridge` — handleLocalMessage, getAgentWalletService |
| `server/algochat/agent-messenger.ts` | `AgentMessenger` — invoke for agent-to-agent messaging |
| `server/work/service.ts` | `WorkTaskService` — create, onComplete |
| `server/scheduler/service.ts` | `SchedulerService` — resolveApproval |
| `server/process/owner-question-manager.ts` | `OwnerQuestionManager` — resolveQuestion |
| `server/middleware/auth.ts` | `AuthConfig`, `timingSafeEqual` |
| `shared/ws-protocol.ts` | `ClientMessage`, `ServerMessage`, `isClientMessage` |
| `server/db/agents.ts` | `getAgent` (lazy import for agent_reward balance fetch) |
| `server/db/agent-messages.ts` | `getAgentMessage` (lazy import for invoke status update) |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `createWebSocketHandler` — passed to Bun's `websocket` option; `broadcastAlgoChatMessage` for publishing chat events |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
