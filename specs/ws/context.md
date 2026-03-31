# WebSocket — Context

## Why This Module Exists

The web dashboard and CLI need real-time bidirectional communication with the server — streaming agent responses, live council updates, notification delivery, and interactive commands. The WebSocket handler manages all real-time connections, multiplexing many concerns over a single connection per client.

## Architectural Role

WebSocket is the **real-time communication layer** — it's the alternative to REST for interactions that need streaming or push delivery. It handles both client→server commands and server→client events.

## Key Design Decisions

- **Multi-purpose protocol**: A single WebSocket connection handles chat, session subscriptions, approvals, work tasks, agent invocations, rewards, schedule approvals, and owner questions. This avoids connection proliferation.
- **Shared protocol definition**: The wire protocol (`ws-protocol.ts`) is in the `shared/` directory, ensuring type safety between client and server.
- **Authentication at connect**: WebSocket connections are authenticated during the upgrade handshake, not per-message. This keeps per-message overhead low.
- **Tenant-scoped broadcast**: Messages are broadcast to tenant-scoped topics via the event broadcasting module.

## Relationship to Other Modules

- **Events**: Receives events to broadcast to connected clients.
- **Middleware**: Uses auth middleware for connection authentication.
- **Process Manager**: Routes chat messages to agent sessions.
- **Client**: The Angular frontend connects via WebSocket for real-time updates.
- **Shared**: Wire protocol types are shared between client and server.
