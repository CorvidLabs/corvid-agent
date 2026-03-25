---
module: discord-message-commands
version: 2
status: draft
files:
  - server/discord/command-handlers/message-commands.ts
depends_on:
  - specs/discord/bridge.spec.md
  - specs/db/migrations.spec.md
  - specs/buddy/visible-discord.spec.md
---

# Discord Message Commands

## Purpose

Handles the Discord `/message` slash command — a lightweight, sandboxed interaction mode. All users (including admins) get the same restricted tool set: read-only code tools and memory recall. This is intentionally lighter than `/session` or `@mention` — messages are for quick questions, not real work. For full tool access, use `/session`.

## Public API

### Exported Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MESSAGE_BUILTIN_TOOLS` | `['Read', 'Glob', 'Grep']` | Read-only built-in tools for all `/message` sessions |
| `MESSAGE_MCP_TOOLS` | `['corvid_recall_memory', 'corvid_read_on_chain_memories']` | MCP tools for all `/message` sessions |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleMessageCommand` | `(ctx: InteractionContext, interaction: DiscordInteractionData, permLevel: number, getOption: (name: string) => string \| undefined, userId: string)` | `Promise<void>` | Handles the `/message` slash command with sandboxed tool access for all permission levels |

## Invariants

1. **Requires `PermissionLevel.BASIC` or higher** — rejects with permission error otherwise.
2. **Both `agent` and `message` options are required**; responds with error if either is missing.
3. **Agent name matching is case-insensitive** and strips model suffixes like ` (claude-opus-4-6)`.
4. **ALL sessions use restricted tools** — no admin bypass. Everyone gets `MESSAGE_BUILTIN_TOOLS` + `MESSAGE_MCP_TOOLS` regardless of permission level.
5. **Session name follows the pattern `Discord message:<channelId>`** — no "full-message" variant.
6. **No worktree is created** — restricted tools means no git isolation needed.
7. **The mention session is persisted** both in-memory (`ctx.mentionSessions`) and in the database for server restart recovery.
8. **Buddy sessions get visible callback** — when a buddy is specified, the `onRoundComplete` callback posts each round's output as a colored embed in the channel.

## Behavioral Examples

### Scenario: Successful message command

- **Given** a user with BASIC permission sends `/message agent:CorvidAgent message:Hello`
- **When** `handleMessageCommand` is called
- **Then** acknowledges the interaction, creates a restricted session with `MESSAGE_BUILTIN_TOOLS`, starts the process, and subscribes for inline response

### Scenario: Admin sends /message

- **Given** an ADMIN user sends `/message agent:CorvidAgent message:fix the bug`
- **When** `handleMessageCommand` is called
- **Then** the session is created with the SAME restricted tools as any other user — admin does not get full access via `/message`

### Scenario: Message with buddy

- **Given** a user sends `/message agent:CorvidAgent message:review this buddy:SonnetAgent`
- **When** the lead agent responds and buddy session starts
- **Then** each buddy round is posted to the Discord channel as a colored embed (lead color vs buddy color)

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
| Buddy agent same as lead | Responds with "An agent cannot be its own buddy." |
| No projects configured | Responds with "No projects configured." |
| No channel ID on interaction | Responds with "Could not determine channel." |
| DB persist failure for mention session | Logs warning, does not fail the command |
| Buddy session start failure | Logs warning, does not fail the message response |

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
| `server/discord/embeds` | `respondToInteraction`, `sendTypingIndicator`, `sendEmbed` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/commands.ts` | Command dispatch routing for `/message` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-20 | corvid-agent | Initial spec |
| 2026-03-24 | corvid-agent | v2: Remove admin full-access bypass — all /message sessions use restricted tools. Add visible buddy conversations via onRoundComplete callback. |
