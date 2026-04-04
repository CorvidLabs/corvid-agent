---
module: discord-message-commands
version: 5
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

Handles the Discord `/message` slash command with permission-tiered tool access. BASIC/STANDARD callers get a lightweight restricted tool set (read-only code tools and memory recall), while ADMIN callers get full tool access. This keeps public usage safe while letting trusted operators run fully capable ad-hoc conversations.

## Public API

### Exported Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MESSAGE_BUILTIN_TOOLS` | `['Read', 'Glob', 'Grep']` | Read-only built-in tools for all `/message` sessions |
| `MESSAGE_MCP_TOOLS` | `['corvid_recall_memory', 'corvid_read_on_chain_memories']` | MCP tools for restricted `/message` sessions |
| `RESTRICTED_MESSAGE_SESSION_PREFIX` | `'Discord message:'` | Session name prefix used for restricted `/message` sessions |
| `STAFF_MESSAGE_SESSION_PREFIX` | `'Discord staff message:'` | Session name prefix used for full-access trusted-channel `/message` sessions by STANDARD users |
| `ADMIN_MESSAGE_SESSION_PREFIX` | `'Discord admin message:'` | Session name prefix used for full-access admin `/message` sessions |

### Exported Types

| Type | Description |
|------|-------------|
| `MessageToolPolicy` | Shape returned by `resolveMessageToolPolicy`: `sessionName`, `toolAllowList?`, `mcpToolAllowList?`, `accessLabel` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getBuddyStatusLabel` | `(role: string, round: number, approved: boolean)` | `string` | Compute a human-readable status label for a buddy round event (e.g. "Initial Response", "Review & Feedback", "Approved") |
| `getBuddyRoleIcon` | `(role: string, approved: boolean)` | `string` | Compute the role icon emoji for a buddy round event (💬 for lead, ✅ for approved buddy, 🔍 for reviewing buddy) |
| `resolveMessageToolPolicy` | `(config: DiscordBridgeConfig, permLevel: number, channelId: string)` | `MessageToolPolicy` | Resolves session naming and tool allow-lists based on caller tier + trusted channel policy |
| `handleMessageCommand` | `(ctx: InteractionContext, interaction: ChatInputCommandInteraction, permLevel: number, userId: string)` | `Promise<void>` | Handles the `/message` slash command with permission-tiered tool access |

## Invariants

1. **Requires `PermissionLevel.BASIC` or higher** — rejects with permission error otherwise.
2. **`agent` and `text` options are required** (legacy `message` option still accepted during rollout); responds with error if the body is missing. Optional **`project`** (autocomplete) overrides the agent default project when set. If `project` is omitted, resolution is the agent’s default project, else the first project in the DB — not a special “sandbox” unless that is how the project is named or configured.
3. **Agent name matching is case-insensitive** and strips model suffixes like ` (claude-opus-4-6)`.
4. **BASIC/STANDARD callers use restricted tools** — receive `MESSAGE_BUILTIN_TOOLS` + `MESSAGE_MCP_TOOLS`.
5. **Trusted STANDARD channels may use full tools** — full access is granted when channel is in `message_full_tool_channel_ids`, the user is STANDARD+, and the channel's permission floor in `channel_permissions` is STANDARD+.
6. **ADMIN callers use full tool access** — no built-in or MCP allow-list restriction is applied.
7. **Session naming encodes tool tier** — restricted sessions use `Discord message:<channelId>`; trusted STANDARD full-access sessions use `Discord staff message:<channelId>`; admin full-access sessions use `Discord admin message:<channelId>`.
8. **Reply continuation enforces minimum responder tier** — full-access `/message` replies require STANDARD+, while restricted sessions allow BASIC+.
9. **No worktree is created** — `/message` remains an inline channel conversation flow.
10. **The mention session is persisted** both in-memory (`ctx.mentionSessions`) and in the database for server restart recovery.
11. **Buddy sessions get visible callback** — when a buddy is specified, the `onRoundComplete` callback posts each round's output as a colored embed in the channel.

## Behavioral Examples

### Scenario: Successful message command

- **Given** a user with BASIC permission sends `/message` with agent CorvidAgent and text `Hello`
- **When** `handleMessageCommand` is called
- **Then** acknowledges the interaction, creates a restricted session with `MESSAGE_BUILTIN_TOOLS`, starts the process, and subscribes for inline response

### Scenario: Admin sends /message

- **Given** an ADMIN user sends `/message` with agent CorvidAgent and text `fix the bug`
- **When** `handleMessageCommand` is called
- **Then** the session is created with full tool access (no `/message` allow-list restrictions), and session name prefix `Discord admin message:`

### Scenario: User picks an explicit project on /message

- **Given** projects `A` and `B` exist, the chosen agent defaults to `A`, and the user sends `/message` with `project:B`
- **When** `handleMessageCommand` is called
- **Then** the session uses project `B` (same resolution rules as `/session`)

### Scenario: STANDARD user in trusted channel sends /message

- **Given** a STANDARD user sends `/message` in a channel listed in `message_full_tool_channel_ids`, and `channel_permissions[channelId] >= STANDARD`
- **When** `handleMessageCommand` is called
- **Then** the session is created with full tool access and session name prefix `Discord staff message:`

### Scenario: Message with buddy

- **Given** a user sends `/message` with agent CorvidAgent, text `review this`, and buddy SonnetAgent
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
| Missing agent or message body (`text` / legacy `message`) | Responds with "Please provide both an agent and a message." |
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
| `server/discord/types` | `PermissionLevel` |
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
| 2026-03-25 | corvid-agent | v3: Reintroduce admin full-access `/message` sessions with explicit `Discord admin message:` naming and centralized permission-based policy resolver. |
| 2026-03-25 | corvid-agent | v4: Optional `/message` `project` parameter (autocomplete); align project resolution with `/session`. |
| 2026-03-25 | corvid-agent | v5: Slash option `message` renamed to `text` (handler still accepts legacy `message`); document default project resolution. |
