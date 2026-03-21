---
module: discord-message-commands
version: 1
status: draft
files:
  - server/discord/command-handlers/message-commands.ts
depends_on:
  - specs/discord/bridge.spec.md
  - specs/db/migrations.spec.md
---

# Discord Message Commands

## Purpose

Handles the Discord `/message` slash command — a pure conversation mode with no tools, no code execution, and no web searches. This is the first public-facing command available to untrusted users at BASIC permission level.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleMessageCommand` | `(ctx: InteractionContext, interaction: DiscordInteractionData, permLevel: number, getOption: (name: string) => string \| undefined, userId: string)` | `Promise<void>` | Handles the `/message` slash command by creating a conversation-only session with no tools |

## Invariants

1. Requires `PermissionLevel.BASIC` or higher — rejects with permission error otherwise.
2. Both `agent` and `message` options are required; responds with error if either is missing.
3. Agent name matching is case-insensitive and strips model suffixes like ` (claude-opus-4-6)`.
4. Sessions are created with `conversationOnly: true` — no coding tools are available.
5. Session name follows the pattern `Discord message:<channelId>`.
6. No worktree is created (no coding tools means no git isolation needed).
7. The mention session is persisted both in-memory (`ctx.mentionSessions`) and in the database for server restart recovery.

## Behavioral Examples

### Scenario: Successful message command

- **Given** a user with BASIC permission sends `/message agent:CorvidAgent message:Hello`
- **When** `handleMessageCommand` is called
- **Then** acknowledges the interaction, creates a conversation-only session, starts the process, and subscribes for inline response

### Scenario: Insufficient permissions

- **Given** a user with permission level below BASIC
- **When** `handleMessageCommand` is called
- **Then** responds with "You do not have permission to use this command."

### Scenario: Agent not found

- **Given** the specified agent name does not match any configured agent
- **When** `handleMessageCommand` is called
- **Then** responds with the agent name and lists available agents

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Permission level below BASIC | Responds with permission denied message |
| Missing agent or message option | Responds with "Please provide both an agent and a message." |
| No agents configured | Responds with "No agents configured." |
| Agent name not found | Responds with available agent names |
| No projects configured | Responds with "No projects configured." |
| No channel ID on interaction | Responds with "Could not determine channel." |
| DB persist failure for mention session | Logs warning, does not fail the command |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/discord/commands` | `InteractionContext` type |
| `server/discord/types` | `DiscordInteractionData`, `PermissionLevel` |
| `server/db/agents` | `listAgents` |
| `server/db/sessions` | `createSession` |
| `server/db/projects` | `listProjects` |
| `server/db/discord-mention-sessions` | `saveMentionSession` |
| `server/discord/message-handler` | `withAuthorContext` |
| `server/discord/embeds` | `respondToInteraction`, `sendTypingIndicator` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/commands.ts` | Command dispatch routing for `/message` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-20 | corvid-agent | Initial spec |
