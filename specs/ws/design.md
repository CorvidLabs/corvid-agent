---
spec: handler.spec.md
sources:
  - server/ws/handler.ts
  - shared/ws-protocol.ts
---

## Module Structure

`server/ws/` contains one file:

- `handler.ts` — `createWebSocketHandler` factory, `broadcastAlgoChatMessage` helper, `tenantTopic` utility, and `WsData` type

The shared protocol is in:

- `shared/ws-protocol.ts` — all `ClientMessage` and `ServerMessage` type definitions, `isClientMessage` type guard

The handler is instantiated once in `server/index.ts` and passed to Bun's `websocket` option. There is no class; the factory closes over the injected services and returns `{ open, message, close }` callbacks.

## Key Functions

### `createWebSocketHandler(processManager, getBridge, authConfig, getMessenger?, getWorkTaskService?, getSchedulerService?, getOwnerQuestionManager?, getDb?)`

Returns the three Bun WebSocket lifecycle callbacks. Services are passed as getter functions (lazy resolution) to avoid circular dependency issues at startup.

**`open(ws)`** — initializes `ws.data` with empty subscriptions map, `authenticated: false`. If the connection was pre-authenticated at HTTP upgrade (query param or header), marks it authenticated, subscribes to all 6 broadcast topics (`council`, `algochat`, `scheduler`, `ollama`, `owner`, `sessions`), sends a `welcome` message, and starts the heartbeat timer. Otherwise, sets a 5-second auth timeout.

**`message(ws, raw)`** — deserializes JSON, validates via `isClientMessage`. If not authenticated, only `pong` (always allowed) and `auth` pass through. For `auth`: validates key via `timingSafeEqual`; on success, subscribes to broadcast topics, sends `welcome`, starts heartbeat; on failure, closes with code 4001. For all other message types: dispatches to the relevant handler (subscribe/unsubscribe, send_message, chat_send, agent_invoke, approval_response, create_work_task, agent_reward, schedule_approval, question_response).

**`close(ws)`** — clears heartbeat and pong timeout timers, unregisters all session subscriptions from `processManager.unsubscribe`, clears the subscriptions map.

### Heartbeat mechanism

On authentication: `setInterval` (30s) sends `{ type: 'ping', serverTime }`. After each ping: `setTimeout` (10s) closes connection with code 4002 if no `pong` received. `pong` messages clear the pending timeout timer.

### Session subscription

`subscribe` message: creates an `EventCallback` that calls `safeSend` with `{ type: 'session_event', sessionId, event }`. Registers via `processManager.subscribe(sessionId, callback)`. Stores in `ws.data.subscriptions`. `unsubscribe` and `close` call `processManager.unsubscribe` and delete from map.

### `broadcastAlgoChatMessage(server, participant, content, direction, tenantId?)`

Publishes `{ type: 'algochat_message', participant, content, direction }` to the `tenantTopic('algochat', tenantId)` pub/sub topic via `server.publish`.

### `tenantTopic(base, tenantId?)`

Returns `"${base}:${tenantId}"` if `tenantId` is provided, else just `base`. Used to scope pub/sub topics per tenant.

## Configuration Values / Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `HEARTBEAT_INTERVAL_MS` | `30000` | Server-initiated ping interval |
| `PONG_TIMEOUT_MS` | `10000` | Time to wait for pong before closing (code 4002) |
| `AUTH_TIMEOUT_MS` | `5000` | Time for unauthenticated client to send auth before closing (code 4001) |
| Agent reward min | `1000` microAlgos | Lower bound for `agent_reward` |
| Agent reward max | `100,000,000` microAlgos | Upper bound (100 ALGO) for `agent_reward` |
| Broadcast topics | `council`, `algochat`, `scheduler`, `ollama`, `owner`, `sessions` | Pub/sub topic names subscribed on auth |

## Related Resources

**Shared types (`shared/ws-protocol.ts`):**
- `ClientMessage` — discriminated union of all client→server message shapes
- `ServerMessage` — discriminated union of all server→client message shapes
- `isClientMessage` — type guard for incoming message validation
- `ServerMessageHandlerMap` — typed handler map for Angular client

**Consumed by:**
- `server/index.ts` — passes the handler to `Bun.serve({ websocket: ... })` and calls `broadcastAlgoChatMessage` from the AlgoChat bridge

**Injected services (getter pattern):**
- `processManager` — session events, approval manager, message sending
- `getBridge()` — AlgoChat bridge for `chat_send` and `agent_invoke`
- `getMessenger()` — AgentMessenger for `agent_invoke`
- `getWorkTaskService()` — WorkTaskService for `create_work_task`
- `getSchedulerService()` — SchedulerService for `schedule_approval`
- `getOwnerQuestionManager()` — OwnerQuestionManager for `question_response`
- `getDb()` — database for `agent_reward` balance lookup
