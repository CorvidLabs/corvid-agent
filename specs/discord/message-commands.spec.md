---
module: discord-message-commands
version: 6
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
2. **`agent` and `text` options are required** (legacy `message` option still accepted during rollout); responds with error if the body is missing. Optional **`project`** (autocomplete) overrides the agent default project when set. If `project` is omitted, resolution is the agent’s default project, else the first project in the DB. Optional **`buddy`** (string) specifies a second agent to review the lead’s response. Optional **`rounds`** (integer) caps the buddy review loop, clamped to [1, 10], defaulting to the buddy service default (3) if omitted.
3. **Agent name matching is case-insensitive** and strips model suffixes like ` (claude-opus-4-6)`.
4. **BASIC/STANDARD callers use restricted tools** — receive `MESSAGE_BUILTIN_TOOLS` + `MESSAGE_MCP_TOOLS`.
5. **Trusted STANDARD channels may use full tools** — full access is granted when channel is in `message_full_tool_channel_ids`, the user is STANDARD+, and the channel’s permission floor in `channel_permissions` is STANDARD+.
6. **ADMIN callers use full tool access** — no built-in or MCP allow-list restriction is applied.
7. **Session naming encodes tool tier** — restricted sessions use `Discord message:<channelId>`; trusted STANDARD full-access sessions use `Discord staff message:<channelId>`; admin full-access sessions use `Discord admin message:<channelId>`.
8. **Reply continuation enforces minimum responder tier** — full-access `/message` replies require STANDARD+, while restricted sessions allow BASIC+. Buddy mode replies always require STANDARD+.
9. **No worktree is created** — `/message` remains an inline channel conversation flow.
10. **The mention session is persisted** both in-memory (`ctx.mentionSessions`) and in the database for server restart recovery.
11. **Buddy sessions get visible callback** — when a buddy is specified, the `onRoundComplete` callback posts each round’s output as a colored embed in the channel. Lead output uses blue (0x3498db), buddy review uses purple (0x9b59b6), buddy approval uses green (0x2ecc71). Content longer than 3900 characters is truncated with "...*truncated*".
12. **Buddy mode bypasses inline response** — when `buddy` is specified, no inline restricted session is created; the buddy service drives the full round-robin conversation, posting each turn as a visible embed. This prevents a double-response.
13. **Buddy rounds are clamped** — the `rounds` option is clamped to [1, 10] before passing to the buddy service.

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
- **When** `handleMessageCommand` is called
- **Then** no inline session is created; the buddy service drives the full conversation
- **And** each round is posted to the channel as a colored embed (blue for lead, purple for buddy review, green for approval)
- **And** no inline response from the `/message` command itself is sent

### Scenario: Insufficient permissions

- **Given** a user with permission level below BASIC
- **When** `handleMessageCommand` is called
- **Then** responds with "You do not have permission to use this command."

### Scenario: Agent not found

- **Given** the specified agent name does not match any configured agent
- **When** `handleMessageCommand` is called
- **Then** responds with the agent name and lists available agents

## Buddy Mode Integration

### Overview

Buddy mode enables two-agent review workflows in Discord. When a `/message` command specifies a `buddy` option, the lead agent generates an initial response, which is then reviewed and optionally revised by the buddy agent. All outputs are posted as visible Discord embeds (not inline command replies).

### ctx.buddyService Integration

When `ctx.buddyService` is available and a buddy is specified:

1. **Session Creation**: `ctx.buddyService.startSession()` is called with:
   - `leadAgentId`: ID of the primary agent
   - `buddyAgentId`: ID of the reviewing agent
   - `prompt`: User message with author context (user ID, username, channel ID)
   - `source`: Set to `'discord'` for Discord-originated sessions
   - `maxRounds`: User-specified rounds, clamped to [1, 10]. If omitted, buddy service default (typically 3) is used
   - `onRoundComplete`: Callback fired for each round completion (lead initial response, buddy review, lead revision, etc.)

2. **Round Callback Behavior**: The `onRoundComplete` callback receives a `BuddyRoundEvent` containing:
   - `role`: Either `'lead'` or `'buddy'`
   - `round`: Round number (1-indexed)
   - `maxRounds`: Total rounds configured
   - `content`: The agent's output text
   - `approved`: Boolean flag indicating if buddy approved the lead's response
   - `agentName`: Name of the responding agent
   - `buddySessionId`: ID of the buddy session (stored for reply routing)

3. **Embed Posting**: For each round event, `createBuddyDiscordCallback` posts a Discord embed:
   - **Color**: Blue (0x3498db) for lead output; Purple (0x9b59b6) for buddy review; Green (0x2ecc71) for approved responses
   - **Status Label**: "Initial Response" (lead round 1), "Review & Feedback" (buddy review), "Approved" (buddy approved), or "Revised Response (Round N)" (lead round >1)
   - **Role Icon**: 💬 for lead, 🔍 for reviewing buddy, ✅ for approved
   - **Truncation**: Content exceeding 3900 characters is truncated with suffix "...*truncated*"
   - **Footer**: Includes agent name, status, and round count (e.g., "Round 2/3")

4. **Double-Response Prevention**: When buddy mode is active, the inline command response is skipped entirely. The command acknowledges with "**{agent.name}** is thinking... with buddy **{buddy.name}**", then delegates to buddy service. This prevents duplicate responses (one from command, one from buddy rounds).

### Error Handling

- **Buddy session start failure**: Logs warning but does not fail the command. User sees the acknowledgment message but no rounds post.
- **Buddy agent validation**: Buddy agent name is resolved exactly like lead agent (case-insensitive, strips model suffix). If not found, command responds with available agents. If buddy agent is the same as lead agent, command rejects with explicit error.

## minResponderPermLevel Implementation

### Purpose

Enforces per-session minimum tier requirement for users replying to posted messages via mention (@bot). Prevents lower-tier users from initiating replies to conversations they lack permission to start.

### Policy Resolution

The `minResponderPermLevel` is set when a `/message` session's output is posted:

1. **Non-Buddy Mode**:
   - If session has **full-access** (`toolPolicy.accessLabel === 'full'`): `minResponderPermLevel = PermissionLevel.STANDARD`
   - If session has **restricted** access: `minResponderPermLevel = PermissionLevel.BASIC`

2. **Buddy Mode**:
   - All buddy embeds set: `minResponderPermLevel = PermissionLevel.STANDARD`
   - Rationale: Buddy conversations require higher trust due to multi-agent orchestration complexity

### Mention Reply Enforcement

When a user replies to a posted message via `@bot` mention:

1. The stored `minResponderPermLevel` is checked against the replying user's permission level
2. If user's level < `minResponderPermLevel`, the mention is rejected with permission error
3. If user's level >= `minResponderPermLevel`, a new `/message` session is created as a reply continuation

### Database Storage

The permission level is persisted as part of the `MentionSessionInfo`:
```typescript
{
  sessionId: string,
  agentName: string,
  agentModel: string,
  projectName: string,
  displayColor?: string | null,
  channelId: string,
  conversationOnly: boolean,
  minResponderPermLevel: number  // Stored for recovery
}
```

## Session Persistence via saveMentionSession

### Purpose

Persists mention session metadata both in-memory and to the SQLite database, enabling recovery of conversation context after server restart.

### When saveMentionSession Is Called

After a `/message` command's initial response (inline non-buddy mode) or each buddy round embed is posted to Discord:

1. **Non-Buddy Inline Response**: Called once after `subscribeForInlineResponse` receives the bot message ID
2. **Buddy Round Embeds**: Called for each round's embed post (lead initial response, buddy review, lead revision, etc.)

### What Gets Persisted

For each bot message ID, the following metadata is stored:

| Field | Source | Purpose |
|-------|--------|---------|
| `sessionId` | Created session or buddy session | Identifies the session for reply routing |
| `agentName` | Lead or buddy agent name | Displayed in reply embed headers |
| `agentModel` | Agent's configured model | Shown in reply footer |
| `projectName` | Resolved project name | Maintains project context for replies |
| `displayColor` | Agent's display color setting | Embed color consistency across replies |
| `displayIcon` | Agent's display icon emoji | Embed footer icon consistency |
| `avatarUrl` | Agent's avatar URL | User profile picture in embeds |
| `channelId` | Discord channel ID | Identifies where reply happens |
| `conversationOnly` | Always `true` for `/message` | Restricts reply scope to channel only |
| `minResponderPermLevel` | Computed per tool policy | Controls who can reply (invariant 8) |

### Database Recovery Flow

On server startup, the Discord bridge calls `getMentionSessions()` to restore all persisted mention sessions:

1. Queries `sqlite:discord_mention_sessions` table for all rows
2. Populates `ctx.mentionSessions` (in-memory Map) with bot message ID → session info
3. When a mention reply arrives, the Map is checked first (fast path); if missing, the DB is checked as fallback

### Error Handling

- **Persistence failure**: If `saveMentionSession` throws, a warning is logged but the command succeeds. The session is available in-memory; only server restart recovery is lost.
- **Concurrent writes**: Database uses SQLite's serialized mode, so concurrent saves are queued. No data loss.
- **Orphaned records**: If a bot message is deleted before `saveMentionSession` completes, the record is still persisted but unreachable. Periodic cleanup (not implemented in this spec) could GC old records.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Permission level below BASIC | Responds with permission denied message |
| Missing agent or message body (`text` / legacy `message`) | Responds with "Please provide both an agent and a message." |
| No agents configured | Responds with "No agents configured." |
| Agent name not found | Responds with available agent names |
| Buddy agent same as lead | Responds with "An agent cannot be its own buddy. Choose a different buddy agent." |
| No projects configured | Responds with "No projects configured." |
| No channel ID on interaction | Responds with "Could not determine channel." |
| DB persist failure for mention session | Logs warning, does not fail the command |
| Buddy session start failure | Logs warning, does not fail the message response |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/discord/commands` | `InteractionContext` type (includes `buddyService`, `mentionSessions`, `delivery`, `config`, `processManager`) |
| `server/discord/types` | `PermissionLevel` enum |
| `server/db/agents` | `listAgents()` to resolve lead and buddy agents |
| `server/db/sessions` | `createSession()` for non-buddy inline sessions |
| `server/db/projects` | `listProjects()` to resolve project by name or agent default |
| `server/db/discord-mention-sessions` | `saveMentionSession()` to persist mention session metadata for recovery |
| `server/db/discord-channel-project` | `setChannelProjectId()` to record channel-project affinity |
| `server/discord/message-handler` | `withAuthorContext()` to augment prompt with user/channel metadata |
| `server/discord/embeds` | `respondToInteraction()`, `sendTypingIndicator()`, `sendEmbed()`, `buildFooterText()` for Discord UI |
| Buddy Service (`ctx.buddyService`) | `startSession()` with callback when buddy mode is active |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/commands.ts` | Command dispatch routing for `/message` slash command |
| `server/discord/message-handler.ts` | Uses `minResponderPermLevel` from persisted mention sessions to enforce reply access |
| `server/discord/thread-session-manager.ts` | Restores mention sessions from database on startup via `getMentionSessions()` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-20 | corvid-agent | Initial spec |
| 2026-03-24 | corvid-agent | v2: Remove admin full-access bypass — all /message sessions use restricted tools. Add visible buddy conversations via onRoundComplete callback. |
| 2026-03-25 | corvid-agent | v3: Reintroduce admin full-access `/message` sessions with explicit `Discord admin message:` naming and centralized permission-based policy resolver. |
| 2026-03-25 | corvid-agent | v4: Optional `/message` `project` parameter (autocomplete); align project resolution with `/session`. |
| 2026-03-25 | corvid-agent | v5: Slash option `message` renamed to `text` (handler still accepts legacy `message`); document default project resolution. |
| 2026-04-17 | corvid-agent | v6: Add detailed "Buddy Mode Integration" section documenting ctx.buddyService.startSession(), onRoundComplete callback, embed colors, and role icons. Add "minResponderPermLevel Implementation" section documenting per-session access control for mention replies and invariant enforcement. Add "Session Persistence via saveMentionSession" section covering DB recovery flow, metadata schema, and error handling (#2023). |
