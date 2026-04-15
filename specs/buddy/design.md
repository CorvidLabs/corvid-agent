---
spec: service.spec.md
sources:
  - server/buddy/service.ts
---

## Layout

The buddy module is organized as:

```
server/buddy/
  service.ts    — BuddyService: session creation, conversation loop orchestration
shared/types/
  buddy.ts      — BuddySession, CreateBuddySessionInput, BuddyRoundEvent, BUDDY_DEFAULT_TOOLS
server/db/
  buddy.ts      — DB operations: createBuddySession, updateBuddySessionStatus, addBuddyMessage, getBuddySession
```

## Components

### BuddyService (service.ts)
Orchestrates the paired review loop. Key design decisions:
- **Async loop**: `startSession` creates the DB record and immediately returns. The `_runLoop` method runs asynchronously in the background.
- **Event emission**: `onSessionUpdate` listeners are notified after each state change (started, each round completed, final status).
- **Tool restriction**: Buddy sessions pass `toolAllowList: BUDDY_DEFAULT_TOOLS` (`['Read', 'Glob', 'Grep']`) to `startProcess`, preventing the buddy from making modifications. MCP servers are skipped for restricted-tool sessions.
- **Timeout guard**: Each agent turn wraps `startProcess` + response collection in a `Promise.race` with a 5-minute timeout that calls `stopProcess` if exceeded.

### Conversation Loop Logic
```
For each round (1..maxRounds):
  1. Run lead agent with accumulated conversation context
  2. Emit BuddyRoundEvent for lead turn (approved: false)
  3. Run buddy agent with lead's output
  4. Emit BuddyRoundEvent for buddy turn (approved: isApproval)
  5. If buddy approves → break loop early
  6. Otherwise, pass buddy feedback back to lead for next round
```

### Approval Detection
The buddy's response is tested for early approval when:
- Response length < 300 characters
- Contains approval keywords: `lgtm`, `looks good`, `approved`, `ship it`, `good to go`
- Does NOT contain negative qualifiers: `not approved`, `but`, `however`, `issues`

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| `BUDDY_DEFAULT_TOOLS` | `['Read', 'Glob', 'Grep']` | Read-only tool allowlist for buddy sessions |
| `maxRounds` range | `[1, 10]` | Clamped input; defaults to 3 |
| Turn timeout | 5 minutes | Per-agent-turn safety timeout |
| Approval response max length | 300 chars | Responses longer than this are never treated as approvals |

## Assets

### Database Tables
- `buddy_sessions` — session records with lead/buddy agent IDs, status, maxRounds
- `buddy_messages` — per-round message log with role and content

### Consumed By
- `server/routes/buddy.ts` — HTTP endpoints for creating and querying buddy sessions
- `server/discord/command-handlers/message-commands.ts` — passes `onRoundComplete` for Discord-visible buddy conversations
