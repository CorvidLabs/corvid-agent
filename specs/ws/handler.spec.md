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
| `WsData` | Per-connection data: `{ subscriptions: Map<string, EventCallback>; walletAddress?: string; authenticated: boolean }` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createWebSocketHandler` | `(processManager, getBridge, authConfig, getMessenger?, getWorkTaskService?, getSchedulerService?, getOwnerQuestionManager?)` | `{ open, message, close }` | Factory returning Bun WebSocket handler callbacks |
| `broadcastAlgoChatMessage` | `(server, participant, content, direction)` | `void` | Publish an AlgoChat message to all WebSocket clients subscribed to the `algochat` topic |

## Client -> Server Messages (ClientMessage)

| Type | Fields | Description |
|------|--------|-------------|
| `auth` | `key: string` | First-message authentication with API key |
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
