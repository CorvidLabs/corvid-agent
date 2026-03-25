---
module: buddy-visible-discord
version: 1
status: draft
files:
  - server/buddy/service.ts
db_tables: []
depends_on:
  - specs/buddy/service.spec.md
  - specs/discord/bridge.spec.md
---

# Visible Buddy Conversations in Discord

## Purpose

Makes buddy agent conversations visible to Discord users in real-time. When a buddy session runs (from `/message`, `/session`, or work tasks), each round's output is posted to the originating Discord channel as a colored embed. Users see the lead agent's work and the buddy's review as it happens — like a group chat, not a black box.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `BuddyServiceDeps` | Interface: `{ db: Database; processManager: ProcessManager }` |
| `BuddyRoundCallback` | `(round: BuddyRoundEvent) => Promise<void>` — called after each agent turn |
| `BuddyRoundEvent` | `{ buddySessionId: string; agentId: string; agentName: string; role: 'lead' \| 'buddy'; round: number; maxRounds: number; content: string; approved: boolean }` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `BuddyService` | Manages buddy session lifecycle and the lead-buddy conversation loop |

### Changes to Existing Types

`CreateBuddySessionInput` gains an optional `onRoundComplete: BuddyRoundCallback` field. When provided, it is invoked after each agent turn with the round's output. This field is defined in `shared/types/buddy.ts` and documented in the buddy service spec.

## Invariants

1. **Callback is optional**: If `onRoundComplete` is not provided, the session runs silently as before (backwards compatible).
2. **Callback errors are non-fatal**: If the callback throws, the error is logged but the buddy loop continues — Discord delivery failures must not break the review.
3. **Every agent turn triggers the callback**: Both lead outputs and buddy reviews are posted, so users see the full back-and-forth.
4. **Approved flag**: The `approved` field is `true` only on the final buddy message when the buddy approves (LGTM). All other messages have `approved: false`.
5. **Content truncation**: The content passed to the callback is the full agent output (not truncated). The caller (Discord) is responsible for splitting/truncating for embed limits.
6. **Lead color vs buddy color**: The Discord caller assigns different embed colors per role — e.g., lead uses agent's `displayColor`, buddy uses a distinct color (purple/magenta `0x9b59b6`).

## Behavioral Examples

### Scenario: Buddy session with Discord visibility

- **Given** a `/message` command with `buddy` option specified
- **When** the buddy session runs
- **Then** each round's output is posted as a Discord embed in the originating channel with role-appropriate colors

### Scenario: Buddy approves in round 1

- **Given** a buddy session with `onRoundComplete` callback
- **When** the lead produces output and the buddy responds "LGTM"
- **Then** two embeds are posted: one for the lead (blue), one for the buddy with `approved: true` (green)

### Scenario: Callback fails

- **Given** a buddy session with an `onRoundComplete` that throws
- **When** a round completes
- **Then** the error is logged, the buddy loop continues, and the session completes normally

### Scenario: No callback provided

- **Given** a buddy session started without `onRoundComplete`
- **When** rounds complete
- **Then** no external notifications are sent (existing behavior preserved)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Callback throws | Error logged, loop continues |
| Callback takes too long | No timeout on callback — it's async fire-and-forget within the round |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/buddy/service` | BuddyService (extended with callback support) |
| `server/discord/embeds` | `sendEmbed`, `DiscordEmbed` for posting round outputs |
| `server/db/agents` | `getAgent` for agent name and displayColor |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/command-handlers/message-commands.ts` | Passes `onRoundComplete` callback when starting buddy sessions |
| `server/discord/command-handlers/session-commands.ts` | Same — for session-end buddy reviews |
| `server/work/service.ts` | Same — for work task completion buddy reviews |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | corvid-agent | Initial spec |
