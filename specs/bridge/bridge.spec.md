---
module: bridge
version: 1
status: stable
files:
  - shared/bridge-protocol.ts
  - server/bridge/types.ts
  - server/bridge/service.ts
  - server/bridge/service.test.ts
  - server/mcp/tool-handlers/bridge.ts
  - server/routes/bridge.ts
db_tables: []
depends_on:
  - server/lib/logger.ts
  - server/middleware/guards.ts
  - server/mcp/sdk-tools.ts
---

# Bridge

## Purpose

Provides a secure WebSocket tunnel so developers can connect their local machines to a running corvid-agent instance. An agent can then perform file reads, file writes, directory listings, and command execution on the developer's machine without opening inbound ports — the connection is always outbound from the developer's machine.

The bridge is intended for the `fledge-plugin-bridge` Kotlin plugin but can be used by any client that implements the protocol.

## Public API

### Exported Types

#### `shared/bridge-protocol.ts`

| Type | Description |
|------|-------------|
| `BridgeAuthMessage` | First message from client: `{ type, token, projectId, capabilities, label? }` |
| `BridgeCapabilities` | `{ read: boolean, write: boolean, exec: boolean }` — operation permission flags |
| `BridgeRequest` | Agent-to-client request: `{ id, type, path?, content?, command?, cwd? }` |
| `BridgeResponse` | Client-to-server reply: `{ id, type, success, data?, error? }` |
| `BridgeSessionInfo` | Serializable session view for HTTP/MCP endpoints |

#### `server/bridge/types.ts`

| Type | Description |
|------|-------------|
| `BridgeSession` | Internal session: includes WebSocket ref, pending request map, timestamps |
| `BridgeWsData` | WebSocket connection metadata: `{ type: 'bridge', sessionId, authenticated, authTimeoutTimer? }` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `BridgeService` | Core session registry and request router (see methods below) |

### Exported Functions

| Function | Module | Parameters | Returns | Description |
|----------|--------|-----------|---------|-------------|
| `handleDevBridgeRoutes` | `server/routes/bridge.ts` | `(req, url, db, ctx, bridgeService)` | `Promise<Response \| null>` | HTTP route handler for `/api/bridge/sessions` endpoints |
| `handleBridgeListSessions` | `server/mcp/tool-handlers/bridge.ts` | `(ctx, args)` | `Promise<ToolResult>` | MCP handler for `corvid_bridge_sessions` |
| `handleBridgeRequest` | `server/mcp/tool-handlers/bridge.ts` | `(ctx, args)` | `Promise<ToolResult>` | MCP handler for `corvid_bridge_request` |

### Exported Constants

| Constant | Module | Value | Description |
|----------|--------|-------|-------------|
| `MAX_PATH_LENGTH` | `server/bridge/service.ts` | 4096 | Max characters in a path argument |
| `MAX_CONTENT_LENGTH` | `server/bridge/service.ts` | 10 485 760 | Max bytes in file write content |
| `MAX_COMMAND_LENGTH` | `server/bridge/service.ts` | 8192 | Max characters in an exec command |
| `RATE_LIMIT_WINDOW_MS` | `server/bridge/service.ts` | 60 000 | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `server/bridge/service.ts` | 120 | Max requests per session per window |
| `IDLE_SESSION_TIMEOUT_MS` | `server/bridge/service.ts` | 1 800 000 | Idle session reap threshold (ms) |
| `IDLE_REAP_INTERVAL_MS` | `server/bridge/service.ts` | 60 000 | How often idle sessions are checked (ms) |

### BridgeService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `listSessions` | `()` | `BridgeSessionInfo[]` | Returns all active sessions (serializable) |
| `getSession` | `(sessionId: string)` | `BridgeSession \| undefined` | Internal session lookup |
| `registerSession` | `(sessionId, label, projectId, caps, ws)` | `void` | Called on successful auth handshake |
| `removeSession` | `(sessionId: string)` | `void` | Removes session and rejects all pending requests |
| `sendRequest` | `(sessionId, request, timeoutMs?)` | `Promise<BridgeResponse>` | Validates and forwards request to client |
| `handleResponse` | `(sessionId, response)` | `void` | Resolves pending promise when client replies |
| `intersectCapabilities` | `(clientCaps: BridgeCapabilities)` | `BridgeCapabilities` | Caps client requests to server-configured maximums |
| `dispose` | `()` | `void` | Clears timers and removes all sessions |

### HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/bridge/sessions` | List all active bridge sessions |
| `GET` | `/api/bridge/sessions/:id` | Get a single session by ID (404 if not found) |

### WebSocket Endpoint

| Path | Description |
|------|-------------|
| `/api/bridge` | Bridge client connection point; requires auth handshake as first message. Also accepts `/api/bridge/ws` for backwards compatibility. |

### MCP Tools (registered when `bridgeService` is available)

| Tool | Description |
|------|-------------|
| `corvid_bridge_sessions` | List active bridge sessions |
| `corvid_bridge_request` | Send a request through a named bridge session |

## Invariants

1. The first message on any bridge WebSocket connection MUST be a valid `auth` message. Non-auth first messages cause immediate close with code 1008.
2. Client capabilities are always intersected with server-configured maximums (`BRIDGE_ALLOW_*` env vars). A client can never gain more capability than the server allows.
3. Every `BridgeRequest` sent to a client MUST have a matching pending `Promise` entry. Responses that reference unknown IDs are silently dropped.
4. A pending request that receives no response within `timeoutMs` (default 30 000 ms) is rejected with a timeout error and removed from the pending map.
5. Sessions idle for longer than `IDLE_SESSION_TIMEOUT_MS` (30 min) are reaped: the WebSocket is closed with code 4003 and the session is removed.
6. Path arguments MUST NOT contain `..` after POSIX normalization (path traversal prevention).
7. Path and `cwd` arguments MUST NOT contain null bytes.
8. `exec` command arguments MUST NOT contain shell metacharacters (`;`, `|`, `&`, `` ` ``, `$()`, `{}`, `[]`, `<>`, `!`, newlines, backslash).
9. `exec` command arguments MUST NOT match the `DANGEROUS_COMMANDS` pattern (e.g., `rm -rf`, `mkfs`, `shutdown`).
10. Each session is independently rate-limited: max `RATE_LIMIT_MAX_REQUESTS` (120) requests per `RATE_LIMIT_WINDOW_MS` (60 s).
11. `read` capability is enabled by default; `write` and `exec` are opt-in via `BRIDGE_ALLOW_WRITE=true` / `BRIDGE_ALLOW_EXEC=true`.

## Behavioral Examples

### Scenario: Successful auth and file read

- **Given** a developer connects to `/api/bridge/ws` and sends `{ type: "auth", token: "<api-key>", projectId: "proj-1", capabilities: { read: true, write: false, exec: false }, label: "My MacBook" }`
- **When** the server validates the token
- **Then** the server replies `{ type: "auth-ok", sessionId: "<uuid>" }`, registers the session, and the session appears in `GET /api/bridge/sessions`

### Scenario: Agent reads a remote file

- **Given** a session `sess-abc` with `read: true` is registered
- **When** an agent calls `corvid_bridge_request` with `session_id: "sess-abc"`, `request_type: "file.read"`, `path: "/home/dev/project/src/index.ts"`
- **Then** the server sends a `BridgeRequest` JSON frame to the client WebSocket; the client processes it and replies with `{ id: "...", type: "file.read", success: true, data: "<file contents>" }`; the agent receives the file contents as text

### Scenario: Auth failure — wrong token

- **Given** the server has an API key configured
- **When** a client sends `{ type: "auth", token: "wrong-key", ... }`
- **Then** the server sends `{ error: "Invalid token" }` and closes the connection with code 4001

### Scenario: Path traversal blocked

- **Given** a bridge session with `read: true`
- **When** an agent sends a `file.read` request with `path: "../../etc/passwd"`
- **Then** `sendRequest()` rejects with `"Path traversal detected"` before sending anything to the client

### Scenario: Idle session reaped

- **Given** a session has been idle for more than 30 minutes
- **When** the reap interval fires (every 60 s)
- **Then** the session WebSocket is closed with code 4003 ("Idle timeout") and the session is removed

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Non-auth first message | Send `{ error: "First message must be auth" }`, close code 1008 |
| Wrong API token | Send `{ error: "Invalid token" }`, close code 4001 |
| Auth timeout (no first message within ~10 s) | Close code 4001, "Authentication timeout" |
| Session not found for `sendRequest` | Reject with `"Bridge session not found"` |
| Missing capability for request type | Reject with `"Missing capability: '<cap>' is required for <type>"` |
| Path traversal in `path` or `cwd` | Reject with `"Path traversal detected"` |
| Null byte in path | Reject with `"Path contains null bytes"` |
| Shell metacharacter in command | Reject with `"Command contains disallowed shell metacharacters"` |
| Dangerous command pattern | Reject with `"Command matches blocked pattern"` |
| Path exceeds MAX_PATH_LENGTH (4096) | Reject with `"Path exceeds maximum length of 4096 characters"` |
| Content exceeds MAX_CONTENT_LENGTH (10 MB) | Reject with `"Content exceeds maximum size of..."` |
| Command exceeds MAX_COMMAND_LENGTH (8192) | Reject with `"Command exceeds maximum length of 8192 characters"` |
| Rate limit exceeded (120 req/60 s) | Reject with `"Rate limit exceeded"` |
| Request timeout | Reject with `"Request timeout after <N>ms"` |
| Bridge service unavailable (HTTP/MCP) | 503 response / `errorResult('Bridge service not available')` |
| Bridge session not found (HTTP) | 404 `{ error: "Session not found" }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger('BridgeService')` |
| `server/middleware/guards.ts` | `timingSafeEqual` for token comparison |
| `server/mcp/sdk-tools.ts` | Tool registration hook |
| `server/lib/response.ts` | `json()` helper in HTTP routes |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Instantiates `BridgeService`, wires WebSocket upgrade for `/api/bridge/ws`, passes to WS handler and route handler |
| `server/ws/handler.ts` | Calls `handleBridgeMessage`, `removeSession` on close |
| `server/routes/bridge.ts` | `listSessions()`, `getSession()` |
| `server/mcp/tool-handlers/bridge.ts` | `listSessions()`, `sendRequest()` |
| `server/process/mcp-service-container.ts` | Provides `bridgeService` to MCP tool context |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `BRIDGE_ALLOW_READ` | `true` | Allow file read and list operations. Set to `'false'` to disable. |
| `BRIDGE_ALLOW_WRITE` | `false` | Allow file write operations. Set to `'true'` to enable. |
| `BRIDGE_ALLOW_EXEC` | `false` | Allow command execution. Set to `'true'` to enable. |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-06 | Jackdaw | Initial spec — documents bridge module added in PR #2287 |
