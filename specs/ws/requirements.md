---
spec: handler.spec.md
---

## User Stories

- As an agent operator, I want real-time session event streaming over WebSocket so that the dashboard shows live agent output without polling
- As an agent operator, I want to send chat messages and approval responses through WebSocket so that I can interact with running agents in real time
- As a platform administrator, I want WebSocket connections authenticated via API key (header or query param) so that unauthorized clients cannot subscribe to session events
- As an agent developer, I want a typed WebSocket protocol with discriminated unions so that both server and client handle all message types exhaustively
- As a team agent, I want agent-to-agent invocation via WebSocket so that agents can trigger other agents from the dashboard UI
- As an agent operator, I want heartbeat ping/pong to detect stale connections so that zombie WebSocket connections are cleaned up automatically
- As an agent operator, I want schedule approval and owner question response via WebSocket so that time-sensitive decisions can be made from the live dashboard

## Acceptance Criteria

- `createWebSocketHandler()` returns `{ open, message, close }` callbacks compatible with Bun's WebSocket handler
- All message types except `auth` and `pong` are rejected with `"Authentication required"` if the connection is not authenticated
- Pre-authenticated connections (via query param or header at upgrade) are marked authenticated at `open` and immediately subscribed to broadcast topics: `council`, `algochat`, `scheduler`, `ollama`, `owner`
- First-message auth: unauthenticated connections must send `{ type: "auth", key: "<key>" }` as their first message; invalid keys close the connection with code 4001
- When `authConfig.apiKey` is null, any `auth` message auto-authenticates (localhost no-key mode)
- API key validation uses `timingSafeEqual()` to prevent timing attacks
- Unauthenticated connections must authenticate within `AUTH_TIMEOUT_MS` (5000ms) or be closed with code 4001
- Server sends `{ type: "welcome", serverTime }` on successful authentication for clock sync
- Server sends `{ type: "ping", serverTime }` every `HEARTBEAT_INTERVAL_MS` (30000ms); client must respond with `{ type: "pong" }` within `PONG_TIMEOUT_MS` (10000ms) or the connection is closed with code 4002
- `pong` messages are handled before the authentication gate so they cannot be blocked
- `subscribe` registers an `EventCallback` with `processManager.subscribe` and stores it in `ws.data.subscriptions`; duplicate subscribes are silently ignored
- On WebSocket close, all session subscriptions are unregistered from `processManager` and all timers (heartbeat, pong timeout, auth timeout) are cleared
- `chat_send` delegates to `bridge.handleLocalMessage` and streams responses as `chat_stream`, `chat_tool_use`, `chat_thinking`, `chat_session` messages
- `approval_response` calls `processManager.approvalManager.resolveRequest` with the client's allow/deny decision
- `agent_reward` validates `microAlgos` between 1,000 and 100,000,000; out-of-range values return an error message
- `isClientMessage()` type guard validates incoming JSON; invalid JSON returns `"Invalid JSON"` error; unknown types return `"Invalid message format"` error
- `broadcastAlgoChatMessage()` publishes to all clients subscribed to the `algochat` topic
- `tenantTopic()` builds tenant-scoped topic strings for multi-tenant pub/sub routing
- All outbound messages use `safeSend()` which catches and ignores errors from already-closed connections

## Constraints

- WebSocket handler runs on Bun's native WebSocket server; no ws or socket.io library
- The `WsData` per-connection structure must track subscriptions map, authentication state, wallet address, tenant ID, and all timer references
- `shared/ws-protocol.ts` is the single source of truth for all message type definitions shared between server and Angular client
- `ServerMessage` is a union of 30+ message types; all use `type` as the discriminant field
- `ClientMessage` supports 11 message types: auth, pong, subscribe, unsubscribe, send_message, chat_send, agent_invoke, approval_response, create_work_task, agent_reward, schedule_approval, question_response
- Maximum concurrent subscriptions per connection is bounded by the number of active sessions

## Out of Scope

- WebSocket reconnection logic (handled client-side)
- Message compression or binary protocols
- WebSocket load balancing across multiple server instances
- Persistent message queuing for offline clients
- Rate limiting individual WebSocket messages (rate limiting is HTTP-only)
