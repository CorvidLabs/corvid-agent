---
module: bridge-service
version: 1
status: draft
files:
  - server/bridge/service.ts
  - server/bridge/types.ts
db_tables: []
depends_on:
  - specs/mcp/tools/tool-handlers.spec.md
---

# Bridge Service

## Purpose

Manages bridge sessions — persistent WebSocket connections from external development environments (e.g., VS Code, Cursor) that expose file system and execution capabilities to the agent. The service maintains a session registry, routes typed requests to connected clients, and handles response correlation with timeouts.

## Public API

### Exported Types (from types.ts)

| Type | Description |
|------|-------------|
| `BridgeSession` | Internal session state: sessionId, label, projectId, capabilities, ws, timestamps, pending requests |
| `BridgeWsData` | WebSocket upgrade data: type, sessionId, authenticated flag, auth timeout timer |
| `BridgeCapabilities` | Re-export from shared protocol: read, write, exec booleans |
| `BridgeRequest` | Re-export from shared protocol |
| `BridgeResponse` | Re-export from shared protocol |
| `BridgeSessionInfo` | Re-export from shared protocol |

### Exported Classes

| Class | Description |
|-------|-------------|
| `BridgeService` | Singleton session registry and request router |

#### BridgeService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `listSessions` | `()` | `BridgeSessionInfo[]` | List all active sessions with metadata |
| `getSession` | `(sessionId: string)` | `BridgeSession \| undefined` | Look up a session by ID |
| `registerSession` | `(sessionId, label, projectId, capabilities, ws)` | `void` | Register a new bridge session |
| `removeSession` | `(sessionId: string)` | `void` | Remove session and clean up pending requests |
| `sendRequest` | `(sessionId, request, timeoutMs?)` | `Promise<BridgeResponse>` | Send a request to a connected session, with timeout |
| `handleResponse` | `(sessionId, response)` | `void` | Correlate a response from a session to its pending request |

## Invariants

1. Each session has a unique sessionId
2. Removing a session rejects all its pending requests with "Bridge session closed"
3. Requests time out after the configured timeoutMs (default 30s) and are cleaned up
4. Capability validation occurs before sending — missing capability throws synchronously
5. The `ping` request type requires no capabilities

## Behavioral Examples

### Scenario: Capability validation

- **Given** a session with capabilities `{ read: true, write: false, exec: false }`
- **When** `sendRequest` is called with `request.type = 'file.write'`
- **Then** the promise is rejected with "Missing capability: 'write' is required for file.write"

### Scenario: Request timeout

- **Given** a registered session with a pending request
- **When** no response arrives within `timeoutMs`
- **Then** the pending request is rejected with "Request timeout after {timeoutMs}ms" and removed

### Scenario: Session removal with pending requests

- **Given** a session with 3 pending requests
- **When** `removeSession` is called
- **Then** all 3 pending requests are rejected with "Bridge session closed" and timers cleared

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Session not found (sendRequest) | Promise rejected: "Bridge session not found" |
| Session not found (handleResponse) | Logs warning, no-op |
| No pending request for response ID | Logs warning, no-op |
| Missing capability | Promise rejected with descriptive error |
| Request timeout | Promise rejected: "Request timeout after {ms}ms" |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/bridge-protocol.ts` | `BridgeCapabilities`, `BridgeRequest`, `BridgeResponse`, `BridgeSessionInfo` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers/bridge.ts` | `listSessions()`, `sendRequest()` |
| `server/routes/bridge.ts` | `listSessions()`, `getSession()` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-06 | corvid-agent | Initial spec (#2287) |
