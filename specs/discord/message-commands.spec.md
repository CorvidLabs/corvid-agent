---
module: discord-message-commands
version: 7
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
5. **Trusted STANDARD channels may use full tools** — full access is granted when channel is in `message_full_tool_channel_ids`, the user is STANDARD+, and the channel's permission floor in `channel_permissions` is STANDARD+.
6. **ADMIN callers use full tool access** — no built-in or MCP allow-list restriction is applied.
7. **Session naming encodes tool tier** — restricted sessions use `Discord message:<channelId>`; trusted STANDARD full-access sessions use `Discord staff message:<channelId>`; admin full-access sessions use `Discord admin message:<channelId>`.
8. **Reply continuation enforces minimum responder tier** — full-access `/message` replies require STANDARD+, while restricted sessions allow BASIC+.
9. **No worktree is created** — `/message` remains an inline channel conversation flow.
10. **The mention session is persisted** both in-memory (`ctx.mentionSessions`) and in the database for server restart recovery.
11. **Buddy sessions get visible callback** — when a buddy is specified, the `onRoundComplete` callback posts each round's output as a colored embed in the channel. Lead output uses blue (0x3498db), buddy review uses purple (0x9b59b6), buddy approval uses green (0x2ecc71). Content longer than 3900 characters is truncated with "...*truncated*".
12. **Buddy mode bypasses inline response** — when `buddy` is specified, no inline restricted session is created; the buddy service drives the full round-robin conversation, posting each turn as a visible embed. This prevents a double-response.
13. **Buddy rounds are clamped** — the `rounds` option is clamped to [1, 10] before passing to the buddy service.

## Behavioral Examples

### Scenario: Successful message command

- **Given** a user with BASIC permission sends `/message` with agent CorvidAgent and text `Hello`
- **When** `handleMessageCommand` is called
- **Then** acknowledges the interaction, creates a restricted session with `MESSAGE_BUILTIN_TOOLS`, starts the process, and subscribes for inline response
- **And** the mention session is persisted both in-memory (`ctx.mentionSessions`) and to the database via `saveMentionSession` for server restart recovery
- **And** `minResponderPermLevel` is set to `PermissionLevel.BASIC` to allow other BASIC+ users to reply in follow-up mentions

### Scenario: Admin sends /message

- **Given** an ADMIN user sends `/message` with agent CorvidAgent and text `fix the bug`
- **When** `handleMessageCommand` is called
- **Then** the session is created with full tool access (no `/message` allow-list restrictions), and session name prefix `Discord admin message:`
- **And** the mention session is persisted with `minResponderPermLevel: PermissionLevel.STANDARD` to enforce higher tier replies
- **And** the inline response is subscribed with full context (agent color, icon, avatar URL)

### Scenario: User picks an explicit project on /message

- **Given** projects `A` and `B` exist, the chosen agent defaults to `A`, and the user sends `/message` with `project:B`
- **When** `handleMessageCommand` is called
- **Then** the session uses project `B` (same resolution rules as `/session`)

### Scenario: STANDARD user in trusted channel sends /message

- **Given** a STANDARD user sends `/message` in a channel listed in `message_full_tool_channel_ids`, and `channel_permissions[channelId] >= STANDARD`
- **When** `handleMessageCommand` is called
- **Then** the session is created with full tool access and session name prefix `Discord staff message:`
- **And** `minResponderPermLevel` is set to `PermissionLevel.STANDARD` reflecting the elevated trust level

### Scenario: Message with buddy — Round-by-round visible conversation

- **Given** a user sends `/message` with agent CorvidAgent, text `review this`, buddy SonnetAgent, and `rounds: 2`
- **When** `handleMessageCommand` is called
- **Then** no inline restricted session is created; instead `ctx.buddyService.startSession()` is invoked with:
  - `leadAgentId`: CorvidAgent's ID
  - `buddyAgentId`: SonnetAgent's ID
  - `prompt`: original message with author context via `withAuthorContext()`
  - `source: 'discord'`
  - `maxRounds: 2` (clamped to [1, 10])
  - `onRoundComplete`: buddy Discord callback function
- **And** the buddy service runs asynchronously, calling the callback for each round:
  - **Round 1 (Lead)**: Lead agent processes the original prompt
    - Callback posts blue embed (0x3498db) with title "💬 CorvidAgent" and status "Initial Response · Round 1/2"
    - Mention session is created with `minResponderPermLevel: PermissionLevel.STANDARD` and persisted to DB
  - **Round 1 (Buddy)**: Buddy agent reviews lead's output
    - Callback posts purple embed (0x9b59b6) with title "🔍 SonnetAgent" and status "Review & Feedback · Round 1/2"
    - Mention session persisted with `minResponderPermLevel: PermissionLevel.STANDARD`
  - **Round 2 (Lead)**: If buddy did not approve, lead incorporates feedback
    - Callback posts blue embed with "Revised Response (Round 2)" and "Round 2/2"
    - Mention session persisted
  - Each embed truncates content at 3900 characters with "...*truncated*" suffix
  - If buddy approves early (detects "LGTM" in output), loop breaks and green approve embed (0x2ecc71) is posted with status "Approved"
- **And** the `/message` acknowledgment is brief — it does NOT send duplicate inline response once buddy mode activates

### Scenario: Buddy session fails to start

- **Given** a user sends `/message` with buddy specified, but `ctx.buddyService` is undefined or throws an error
- **When** the buddy callback is invoked
- **Then** a warning is logged with error message, but the `/message` command response has already been sent
- **And** the error does not crash the message handler

### Scenario: Insufficient permissions

- **Given** a user with permission level below BASIC
- **When** `handleMessageCommand` is called
- **Then** responds with "You do not have permission to use this command."

### Scenario: Agent not found

- **Given** the specified agent name does not match any configured agent
- **When** `handleMessageCommand` is called
- **Then** responds with the agent name and lists available agents

## Buddy Mode Integration Details

### Purpose

Buddy mode enables collaborative multi-agent review within Discord `/message` conversations. A lead agent produces output and a buddy reviews it, with each round posted as a visible embed in the channel. This provides real-time transparency for complex tasks and validates output before final delivery.

### ctx.buddyService Integration

The `ctx.buddyService` (instance of `BuddyService` from `server/buddy/service.ts`) is injected into `InteractionContext` during Discord initialization. When a `/message` command includes a `buddy` parameter:

1. **Session Creation** — `buddyService.startSession()` is called with:
   - Lead agent ID, buddy agent ID, project context
   - Original prompt enriched with Discord author context
   - `onRoundComplete` callback for embed posting
   - Optional `maxRounds` (clamped to [1, 10])

2. **Async Round Loop** — The service runs a conversation loop asynchronously (does NOT block the `/message` command response):
   - Round 1: Lead processes original prompt
   - Each subsequent even-numbered round: Lead revises based on buddy feedback
   - Each odd-numbered round ≥ 1: Buddy reviews and optionally approves
   - Loops up to `maxRounds` or until buddy approval detected

3. **Callback Invocation** — Each round invokes `onRoundCallback(event: BuddyRoundEvent)`:
   - Event contains: `buddySessionId`, `agentName`, `role` ('lead' or 'buddy'), `round`, `maxRounds`, `content`, `approved`
   - Callback is where Discord embeds are posted (see next section)

4. **Session Completion** — Final status is persisted to `buddy_sessions` table with status 'completed' or 'failed'

### Discord Embed Posting (onRoundComplete Callback)

The buddy Discord callback (`createBuddyDiscordCallback`) posts each round as a colored embed:

| Role | Round | Approval | Color | Icon | Status Label |
|------|-------|----------|-------|------|--------------|
| Lead | 1 | — | Blue (0x3498db) | 💬 | "Initial Response" |
| Lead | 2+ | — | Blue (0x3498db) | 💬 | "Revised Response (Round N)" |
| Buddy | any | No | Purple (0x9b59b6) | 🔍 | "Review & Feedback" |
| Buddy | any | Yes | Green (0x2ecc71) | ✅ | "Approved" |

Each embed:
- Posts to `channelId` via `sendEmbed()` (REST API)
- Includes `description: content` (truncated to 3900 chars + "...*truncated*" if longer)
- Includes footer with agent name, round, and status
- Creates a mention session in `ctx.mentionSessions` (in-memory cache)
- Persists mention session to DB via `saveMentionSession()`

### minResponderPermLevel — Per-Session Reply Tier Enforcement

Each mention session has a `minResponderPermLevel` that controls who can reply in follow-up mentions. It is determined by the tool access level of the original `/message` session:

| Tool Access Level | Restricted (MESSAGE_BUILTIN_TOOLS + MESSAGE_MCP_TOOLS) | Full | Full |
|-------------------|------|------|------|
| Caller Type | BASIC/STANDARD in public channel | STANDARD in trusted channel | ADMIN |
| Session Prefix | `Discord message:<channelId>` | `Discord staff message:<channelId>` | `Discord admin message:<channelId>` |
| **minResponderPermLevel** | **PermissionLevel.BASIC** | **PermissionLevel.STANDARD** | **PermissionLevel.STANDARD** |

For **buddy mode specifically**, ALL mention sessions (lead, buddy, approval) get `minResponderPermLevel: PermissionLevel.STANDARD` regardless of the original caller's tier. This ensures only trusted responders can participate in collaborative buddy conversations.

The `minResponderPermLevel` is:
- Set when the inline response subscription is created (line 279) or buddy callback creates mention sessions (line 357)
- Persisted to the database (column `minResponderPermLevel` in `discord_mention_sessions` table)
- Checked when processing follow-up mentions (in `message-handler.ts`) to enforce reply tier

### Session Persistence — In-Memory + Database Recovery

Each mention session is persisted in two layers for fault tolerance:

1. **In-Memory Cache** (`ctx.mentionSessions` — a Map<botMessageId, SessionInfo>)
   - Populated immediately when session is created
   - Fast lookup for handling quick follow-up mentions in the same session
   - Survives within a single server process uptime

2. **Database Persistence** (via `saveMentionSession()` → `discord_mention_sessions` table)
   - Called in a try-catch block (does NOT fail the command if it fails)
   - Stores: `botMessageId`, `sessionId`, `agentName`, `agentModel`, `projectName`, `channelId`, `conversationOnly`, `minResponderPermLevel`, and optional agent display properties
   - Allows recovery when:
     - Server restarts and in-memory cache is cleared
     - New process loads mention session from DB when a follow-up mention arrives
     - Preserves tool access tier and responder permissions across restarts

Database persistence failures are logged as warnings (not errors) because:
- The session still works if the user mentions within the same process
- Subsequent restarts may succeed in persisting (eventual consistency)
- Failing the entire `/message` command due to DB persistence is poor UX

The recovery flow on follow-up mention after server restart:
1. User mentions in response to a message from a prior process
2. Message handler checks `ctx.mentionSessions` (miss — process is new)
3. Falls back to querying `getMentionSession(botMessageId)` from DB
4. Restores session context: agent, project, permissions, tier
5. Creates a new session linked to the original session ID
6. Proceeds with inline response as if session never lapsed

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
| `server/discord/commands` | `InteractionContext` type with `db`, `config`, `processManager`, `buddyService`, `mentionSessions`, `subscribeForInlineResponse`, `delivery` fields |
| `server/discord/types` | `PermissionLevel` enum (BASIC, STANDARD, ADMIN) |
| `server/db/agents` | `listAgents()` for agent name resolution |
| `server/db/sessions` | `createSession()` for inline `/message` sessions (non-buddy mode) |
| `server/db/projects` | `listProjects()` for project resolution and default project fallback |
| `server/db/discord-mention-sessions` | `saveMentionSession()` for dual-layer session persistence and server restart recovery |
| `server/discord/message-handler` | `withAuthorContext()` to enrich prompt with user, username, and channel context |
| `server/discord/embeds` | `respondToInteraction()`, `sendTypingIndicator()`, `sendEmbed()` for user feedback and buddy round posting |
| `server/buddy/service` | `BuddyService.startSession()` to launch collaborative buddy round-robin when buddy parameter is set |
| `shared/types/buddy` | `BuddyRoundEvent` type for callback event structure |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/commands.ts` | Command dispatch routing for `/message` slash command |
| `server/discord/bridge.ts` | Injects `buddyService` into `InteractionContext` during bootstrap |
| `server/discord/message-handler.ts` | Recovers persisted mention sessions on follow-up mentions (DB fallback if in-memory cache miss) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-20 | corvid-agent | Initial spec |
| 2026-03-24 | corvid-agent | v2: Remove admin full-access bypass — all /message sessions use restricted tools. Add visible buddy conversations via onRoundComplete callback. |
| 2026-03-25 | corvid-agent | v3: Reintroduce admin full-access `/message` sessions with explicit `Discord admin message:` naming and centralized permission-based policy resolver. |
| 2026-03-25 | corvid-agent | v4: Optional `/message` `project` parameter (autocomplete); align project resolution with `/session`. |
| 2026-03-25 | corvid-agent | v5: Slash option `message` renamed to `text` (handler still accepts legacy `message`); document default project resolution. |
| 2026-04-14 | corvid-agent | v6: Document `buddy`/`rounds` options, rounds clamping, buddy-mode inline-response bypass, embed colors, fix error message text (#2023) |
| 2026-04-17 | magpie | v7: Expand buddy mode behavioral examples with detailed round-by-round flow. Add comprehensive "Buddy Mode Integration Details" section documenting ctx.buddyService, embed posting, onRoundComplete callback, and round loop lifecycle. Document minResponderPermLevel per-tier enforcement table and buddy-mode STANDARD tier enforcement. Expand session persistence section with dual-layer architecture (in-memory + database), saveMentionSession usage, and server restart recovery flow. Update Dependencies to include BuddyService, buddy types, and mention-session recovery pattern. Closes #2023. |
