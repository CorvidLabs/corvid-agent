---
spec: bridge.spec.md
---

## Product Requirements

- Developers can connect their local machine to a running corvid-agent instance over a secure WebSocket, enabling agents to perform file and command operations on the developer's machine without opening inbound ports.
- The bridge connection is always outbound from the developer's machine, making it work transparently behind NAT, firewalls, and corporate proxies.
- Capabilities are negotiated per-session and capped by server configuration, so operators can enable or disable read, write, and exec access independently.
- Agents can list all active bridge sessions and route requests to specific sessions by ID using MCP tools.

## User Stories

- As a developer, I want to connect my local machine to corvid-agent via `fledge-plugin-bridge` so that agents can read and modify files in my local workspace
- As an agent, I want to call `corvid_bridge_sessions` to see which developer machines are connected so I can route file requests to the correct session
- As an agent, I want to call `corvid_bridge_request` with a `file.read` request so I can read a file from a connected developer's machine
- As an operator, I want to set `BRIDGE_ALLOW_EXEC=false` so that bridge sessions are restricted to file operations only, preventing agents from running arbitrary commands on developer machines
- As a platform administrator, I want idle sessions automatically reaped after 30 minutes so that abandoned connections don't consume server resources

## Acceptance Criteria

- A client that connects to `/api/bridge` (or `/api/bridge/ws`) and sends a valid `auth` message receives `{ type: "auth-ok", sessionId: "..." }` and appears in `GET /api/bridge/sessions`
- A client with the wrong token receives `{ error: "Invalid token" }` and is disconnected with close code 4001
- A client that does not send an auth message within the auth timeout window is disconnected with close code 4001
- `BridgeService.sendRequest()` resolves with the `BridgeResponse` when the client replies within the timeout
- `BridgeService.sendRequest()` rejects with a timeout error when no response arrives within `timeoutMs`
- Path arguments containing `..` (after POSIX normalization) are rejected before the request reaches the client
- Path arguments containing null bytes are rejected before the request reaches the client
- `exec` commands containing shell metacharacters are rejected before the request reaches the client
- `exec` commands matching the `DANGEROUS_COMMANDS` pattern are rejected before the request reaches the client
- Capability mismatches (e.g., `file.write` on a read-only session) are rejected before the request reaches the client
- Rate limiting enforces a maximum of 120 requests per session per 60-second window
- Sessions idle for more than 30 minutes are closed with code 4003 and removed
- `BRIDGE_ALLOW_READ=false` prevents all `file.read` and `file.list` operations regardless of client-requested capabilities
- `BRIDGE_ALLOW_WRITE=true` enables `file.write` operations; default is disabled
- `BRIDGE_ALLOW_EXEC=true` enables `exec` operations; default is disabled

## Constraints

- The bridge WebSocket endpoint (`/api/bridge`) uses its own first-message auth handshake (same API key, sent as `token` in the auth message)
- Bridge session IDs are server-generated UUIDs — the client cannot choose its own session ID
- Content payloads for file writes are capped at 10 MB; paths at 4096 characters; commands at 8192 characters
- The bridge has no persistent storage — sessions are in-memory only and lost on server restart
- `exec` commands are passed as argument arrays or simple strings; shell interpretation (pipes, redirects, chaining) is explicitly blocked

## Out of Scope

- Implementing the client-side bridge (that is handled by `fledge-plugin-bridge`)
- File streaming for large binary files
- Bidirectional streaming or real-time log tailing
- Bridge session persistence across server restarts
- Project-level scoping of bridge sessions (currently any authenticated agent can use any bridge session)
