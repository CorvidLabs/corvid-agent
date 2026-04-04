---
module: discord-rest-client
version: 1
status: active
files:
  - server/discord/rest-client.ts
db_tables: []
depends_on:
  - specs/discord/bridge.spec.md
---

# Discord REST Client

## Purpose

Thin wrapper around the discord.js `REST` client that encapsulates rate limit handling and provides a typed adapter for sending messages, managing interactions, and performing channel operations via the Discord REST API. Replaces raw `fetch` calls to the Discord API with the discord.js library's built-in rate limit queue and retry logic.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `DiscordRestClient` | Wrapper around discord.js `REST` that provides typed methods for common Discord API operations |

### DiscordRestClient Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `respondToInteraction` | `(interactionId: string, interactionToken: string, data: { type: number; data: Record<string, unknown> })` | `Promise<APIInteractionResponse>` | Respond to a Discord interaction (slash command, button, etc) |
| `deferInteraction` | `(interactionId: string, interactionToken: string, ephemeral?: boolean)` | `Promise<void>` | Defer an interaction response for long-running operations |
| `editDeferredResponse` | `(applicationId: string, interactionToken: string, data: Record<string, unknown>)` | `Promise<APIMessage>` | Edit a previously deferred interaction response |
| `sendMessage` | `(channelId: string, data: Record<string, unknown>)` | `Promise<APIMessage>` | Send a message to a channel |
| `editMessage` | `(channelId: string, messageId: string, data: Record<string, unknown>)` | `Promise<APIMessage>` | Edit an existing message |
| `deleteMessage` | `(channelId: string, messageId: string)` | `Promise<void>` | Delete a message |
| `addReaction` | `(channelId: string, messageId: string, emoji: string)` | `Promise<void>` | Add a reaction to a message |
| `sendTypingIndicator` | `(channelId: string)` | `Promise<void>` | Trigger typing indicator in a channel |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `initializeRestClient` | `(token: string)` | `void` | Initialize the global REST client singleton with a bot token |
| `getRestClient` | `()` | `DiscordRestClient` | Get the global REST client instance; throws if not initialized |
| `_setRestClientForTesting` | `(client: DiscordRestClient \| null)` | `void` | Test-only: inject a mock client or reset to null |

## Invariants

1. The global REST client is a singleton — `initializeRestClient` must be called exactly once before any `getRestClient` calls.
2. `getRestClient` throws if the client has not been initialized.
3. All REST methods log errors with structured context before re-throwing.
4. The discord.js REST client handles rate limiting automatically via its internal queue.
5. API version is pinned to `'10'` (Discord API v10).

## Behavioral Examples

### Scenario: Send a message to a channel

- **Given** the REST client is initialized with a valid bot token
- **When** `sendMessage('123456', { content: 'Hello' })` is called
- **Then** a POST request is sent to the Discord channel messages endpoint and the created message is returned

### Scenario: Client not initialized

- **Given** `initializeRestClient` has not been called
- **When** `getRestClient()` is called
- **Then** an `Error` is thrown with message "REST client not initialized. Call initializeRestClient() first."

## Error Cases

| Condition | Behavior |
|-----------|----------|
| REST client not initialized | `getRestClient` throws `Error` |
| Discord API returns error | Error is logged with context, then re-thrown to caller |
| Rate limited by Discord | Handled automatically by discord.js REST queue (transparent retry) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `discord.js` | `REST`, `Routes`, `APIMessage`, `APIInteractionResponse` types |
| `server/lib/logger.ts` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/embeds.ts` | `getRestClient` for sending Discord messages |
| `server/discord/bridge.ts` | `initializeRestClient` during bot startup |

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-04-03 | Initial spec — discord.js REST client wrapper with singleton management |
