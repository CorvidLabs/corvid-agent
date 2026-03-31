---
spec: channels.spec.md
---

## User Stories

- As an agent developer, I want a unified `ChannelAdapter` interface so that I can add new messaging integrations without modifying the core session system
- As a platform administrator, I want all inbound messages normalized to a `SessionMessage` format so that the rest of the system is channel-agnostic
- As an agent developer, I want a `getStatus()` method on every adapter so that I can monitor channel health and connectivity programmatically
- As a team agent, I want outbound messages sent via a single `sendMessage(participant, content)` call so that my responses reach users regardless of which channel they are on

## Acceptance Criteria

- `ChannelAdapter` interface defines `sendMessage(participant, content)`, `onMessage(handler)`, `start()`, `stop()`, and `getStatus()` methods
- `SessionMessage` type includes `id`, `channelType`, `participant`, `content`, `direction` (`'inbound' | 'outbound'`), `timestamp`, and optional `metadata`
- `ChannelStatus` type includes `channelType`, `enabled`, `connected`, and optional `details`
- All channel adapters normalize inbound messages to `SessionMessage` before passing them to handlers; no channel-specific types leak beyond the adapter boundary
- `SessionMessage.direction` is strictly `'inbound'` or `'outbound'` -- no other values are valid
- Each `SessionMessage.id` is unique within its channel type; the adapter generates or propagates unique IDs
- `start()` is idempotent: calling it on an already-running adapter has no effect
- `stop()` is idempotent: calling it on an already-stopped adapter does not throw
- `getStatus()` is side-effect-free and does not alter adapter state
- `channelType` on both `ChannelAdapter` and `SessionMessage` is readonly and immutable after construction
- `metadata` on `SessionMessage` is optional and unstructured; consumers must not depend on its presence
- Adapters handle null or missing fields in external payloads gracefully without throwing
- `onMessage()` handlers registered before `start()` receive all inbound messages; no messages are dropped during initialization

## Constraints

- This is a types-only module with no runtime dependencies; it defines contracts that adapters implement
- `sendMessage()` returns `Promise<void>`; adapters handle their own retries and error propagation internally
- Supported channel types: AlgoChat, Slack, Discord, Telegram, WebSocket, WhatsApp, Signal

## Out of Scope

- Channel adapter implementations (each bridge module provides its own adapter)
- Message persistence or history (handled by the session/database layer)
- Message routing logic (handled by the process manager and bridge modules)
- Channel configuration storage (each adapter reads its own environment variables)
- Cross-channel message forwarding or translation
