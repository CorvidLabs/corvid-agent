---
module: ws-handler
version: 1
status: active
files:
  - server/ws/handler.ts
db_tables: []
depends_on:
  - specs/middleware/auth.spec.md
---

# WebSocket Handler

## Purpose

Manages WebSocket connections for the corvid-agent dashboard. Handles client authentication (first-message or pre-authenticated via upgrade), routes 11 client message types to the appropriate services, manages per-connection session event subscriptions, and broadcasts server messages to topic subscribers.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createWebSocketHandler` | `(processManager, getBridge, authConfig, getMessenger?, getWorkTaskService?, getSchedulerService?, getOwnerQuestionManager?)` | `{ open, message, close }` | Creates Bun WebSocket handler with auth, routing, and cleanup |
| `broadcastAlgoChatMessage` | `(server, participant, content, direction)` | `void` | Publish an AlgoChat message to all subscribed WebSocket clients |

### Exported Types

| Type | Description |
|------|-------------|
| `WsData` | Per-connection data: `{ subscriptions: Map<string, EventCallback>; walletAddress?: string; authenticated: boolean }` |

## Invariants

1. **Auth gate**: Unauthenticated connections can only send `{ type: "auth" }`. All other message types are rejected with "Authentication required" until authenticated
2. **Pre-authenticated via upgrade**: Connections authenticated during HTTP upgrade (via `?key=` query param) have `authenticated=true` set in `ws.data` before `open` fires; they subscribe to broadcast topics immediately
3. **First-message auth**: The first message on an unauthenticated connection must be `{ type: "auth", key: "<key>" }`. Invalid key closes the connection with code 4001
4. **Subscription cleanup on close**: When a WebSocket connection closes, all session subscriptions are unsubscribed via `processManager.unsubscribe` and the subscriptions map is cleared
5. **safeSend wraps errors**: The `safeSend` helper catches exceptions from `ws.send` (e.g., closed connection during async callback) and silently ignores them
6. **11 client message types**: `auth`, `subscribe`, `unsubscribe`, `send_message`, `chat_send`, `agent_invoke`, `approval_response`, `create_work_task`, `agent_reward`, `schedule_approval`, `question_response`
7. **Broadcast topics**: Authenticated connections subscribe to 5 topics: `council`, `algochat`, `scheduler`, `ollama`, `owner`
8. **Invalid JSON/format**: Non-JSON messages receive an error response "Invalid JSON"; messages that fail `isClientMessage` validation receive "Invalid message format"

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

### Scenario: Subscribe to session events

- **Given** an authenticated WebSocket connection
- **When** the client sends `{ "type": "subscribe", "sessionId": "abc" }`
- **Then** `processManager.subscribe("abc", callback)` is called and the callback is stored in `ws.data.subscriptions`

### Scenario: Connection close cleans up subscriptions

- **Given** an authenticated WebSocket with subscriptions to sessions "abc" and "def"
- **When** the connection closes
- **Then** `processManager.unsubscribe` is called for both sessions and the subscriptions map is cleared

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Invalid JSON | Error message: "Invalid JSON" |
| Invalid message format | Error message: "Invalid message format" |
| Already authenticated | Error message: "Already authenticated" |
| Auth required | Error message: "Authentication required. Send { \"type\": \"auth\", \"key\": \"<key>\" } first." |
| Invalid API key (WS auth) | Error sent, connection closed with code 4001 |
| Session not running (`send_message`) | Error: "Session {id} is not running" |
| Bridge not available (`chat_send`) | Error: "AlgoChat is not available" |
| Messenger not available (`agent_invoke`) | Error: "Agent messaging not available" |
| Work task service not available | Error: "Work task service not available" |
| Scheduler not available | Error: "Scheduler service not available" |
| Question manager not available | Error: "Owner question service not available" |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `ProcessManager` (subscribe, unsubscribe, sendMessage, approvalManager) |
| `server/middleware/auth.ts` | `AuthConfig`, `timingSafeEqual` |
| `server/algochat/bridge.ts` | `AlgoChatBridge` (handleLocalMessage) |
| `server/algochat/agent-messenger.ts` | `AgentMessenger` (invoke) |
| `server/work/service.ts` | `WorkTaskService` (create, onComplete) |
| `server/scheduler/service.ts` | `SchedulerService` (resolveApproval) |
| `server/process/owner-question-manager.ts` | `OwnerQuestionManager` (resolveQuestion) |
| `shared/ws-protocol.ts` | `ClientMessage`, `ServerMessage`, `isClientMessage` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `createWebSocketHandler`, `broadcastAlgoChatMessage` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
