---
spec: handler.spec.md
---

## Automated Testing

No test files currently exist for this module. Recommended test file:

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/ws/handler.test.ts` | Unit | Auth flow (pre-auth, first-message, invalid key, auth timeout), heartbeat ping/pong/timeout, subscription/unsubscription lifecycle, message routing to each handler, agent_reward bounds validation, safeSend no-op on closed connection |

Key fixtures: a mock Bun `ServerWebSocket` object with `send`, `subscribe`, `close` spies; stub `processManager` with controllable `subscribe`/`unsubscribe`; fake timer control for heartbeat and timeout assertions.

## Manual Testing

- [ ] Open the dashboard; verify the WebSocket connects and the session list loads (confirms pre-auth at HTTP upgrade works).
- [ ] Connect via `wscat -c ws://localhost:4000/ws` without a key; send a non-auth message; verify "Authentication required" error is returned.
- [ ] Wait 5+ seconds without authenticating; verify the connection is closed with code 4001 "Authentication timeout".
- [ ] After connecting and authenticating, wait 30+ seconds without activity; verify a `ping` message arrives and the server closes with 4002 if no `pong` is sent.
- [ ] Subscribe to a running session; verify `session_event` messages stream in as the agent executes.
- [ ] Send `{ type: "approval_response", requestId: "...", behavior: "allow" }` while an approval is pending; verify the session resumes.
- [ ] Send `{ type: "agent_reward", agentId: "...", microAlgos: 999 }`; verify the "out of range" error is returned.

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Pre-authenticated at HTTP upgrade | `ws.data.authenticated = true` at `open`; topics subscribed; `welcome` sent; heartbeat started |
| First-message `auth` with valid key | Authenticated; topics subscribed; `welcome` sent; heartbeat started |
| First-message `auth` with invalid key | Error sent; connection closed with code 4001 |
| `auth` sent when already authenticated | Error: "Already authenticated" |
| `auth` not received within 5 seconds | Connection closed with code 4001 "Authentication timeout" |
| `pong` received before authentication | Handled (auth gate bypassed for pong); no error |
| `pong` not received within 10s of ping | Connection closed with code 4002 |
| `pong` received clears timeout | No spurious close |
| No API key configured (`authConfig.apiKey = null`) | Any `auth` message auto-authenticates |
| Invalid JSON message | Error: "Invalid JSON" |
| Unknown message type | Error: "Invalid message format" |
| `subscribe` to same session twice | Second subscribe silently ignored |
| Client disconnects with active subscriptions | All subscriptions unregistered from processManager |
| `send_message` to session not in DB | Error: "Session {id} not found" |
| `send_message` to idle session in DB | Session auto-resumed; message delivered |
| `chat_send` when bridge not initialized | Error: "AlgoChat is not available" |
| `agent_invoke` when messenger not initialized | Error: "Agent messaging not available" |
| `create_work_task` when service not set | Error: "Work task service not available" |
| `agent_reward` with `microAlgos = 999` | Error: "microAlgos must be between 1000 and 100000000" |
| `agent_reward` with `microAlgos = 100000001` | Error: "microAlgos must be between 1000 and 100000000" |
| `schedule_approval` when scheduler not set | Error: "Scheduler service not available" |
| `question_response` when manager not set | Error: "Owner question service not available" |
| `safeSend` called on already-closed connection | Error caught and ignored; no crash |
| `broadcastAlgoChatMessage` with tenantId | Published to `algochat:{tenantId}` topic |
| `broadcastAlgoChatMessage` without tenantId | Published to `algochat` topic |
