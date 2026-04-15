---
spec: session-metrics.spec.md
sources:
  - server/db/sessions.ts
  - server/db/session-metrics.ts
  - server/db/agent-messages.ts
  - server/db/algochat-messages.ts
  - server/db/notifications.ts
  - server/db/discord-config.ts
  - server/db/buddy.ts
  - server/db/escalation.ts
  - server/db/daily-review.ts
  - server/db/conversation-access.ts
  - server/db/discord-mention-sessions.ts
  - server/db/discord-thread-sessions.ts
---

## Layout

Session-related data-access layer. `sessions.ts` is the core module; the others provide supporting tables for specific session features. No business logic — pure SQL with row-to-domain mapping.

```
server/db/
  sessions.ts               — Session CRUD, messages, AlgoChat conversations
  session-metrics.ts        — Token usage, latency, and performance metrics
  agent-messages.ts         — Inter-agent message queue
  algochat-messages.ts      — On-chain AlgoChat message inbox
  notifications.ts          — Owner notification channels and delivery tracking
  discord-config.ts         — Discord bridge runtime configuration
  buddy.ts                  — Buddy pairing and review session tracking
  escalation.ts             — Escalation queue for owner question routing
  daily-review.ts           — Daily review schedule and results
  conversation-access.ts    — Per-conversation allowlist/blocklist/rate-limit checks
  discord-mention-sessions.ts — Discord @mention auto-session tracking
  discord-thread-sessions.ts  — Discord thread ↔ session mappings
```

## Components

### `sessions.ts` — Core Session Data Access

Every agent interaction flows through a session. Key operations:
- `createSession` — UUID-generated, linked to agent + optional project
- `updateSession` / `updateSessionStatus` / `updateSessionPid` — status lifecycle
- `updateSessionCost` — cumulative cost tracking (additive turns)
- `updateSessionAlgoSpent` — additive ALGO spend tracking
- `updateSessionSummary` — conversation summary for context carry-over
- `getSessionMessages` — ordered message history
- AlgoChat conversation management with upsert-on-conflict for `participant_addr`

Session statuses: `idle`, `running`, `stopped`, `error`, `paused`

### `session-metrics.ts` — Performance Metrics

Tracks per-session token usage (input/output/cache tokens), latency, and TTFT (time-to-first-token). Stored in `session_metrics` table; used by health and observability systems.

### `discord-thread-sessions.ts` — Thread/Session Mapping

Maps Discord thread IDs to session IDs bidirectionally. Supports conversation summary carry-over via `last_summary` column (migration 118).

### `discord-mention-sessions.ts` — Mention Auto-Sessions

Tracks sessions created from Discord @mentions. Supports project association, conversation-only mode, and last-activity TTL.

### `buddy.ts` — Buddy Review System

Buddy pairing records (pairs of agents for peer review) and buddy session tracking. Messages between buddy agents stored in `buddy_messages`.

### `escalation.ts` — Owner Escalation Queue

Routes agent questions to human owners. Tracks question dispatch state, delivery attempts, and resolution.

## Tokens

| Constant | Description |
|----------|-------------|
| Session statuses | `idle`, `running`, `stopped`, `error`, `paused` |
| `restart_pending` flag | Marks sessions that should be cleaned up on startup (migration 105) |
| `conversation_summary` | Stored per-session for cross-session context (migration 110) |

## Assets

| Resource | Description |
|----------|-------------|
| `sessions` + `session_messages` | Core session tables |
| `session_metrics` | Performance metrics per session |
| `algochat_conversations` | AlgoChat conversation tracking (unique `participant_addr`) |
| `agent_messages` | Inter-agent message queue |
| `algochat_messages` | On-chain message inbox |
| `notification_channels` + `owner_notifications` + `notification_deliveries` | Notification data |
| `discord_config` + `discord_muted_users` | Discord runtime config |
| `buddy_pairings` + `buddy_sessions` + `buddy_messages` | Buddy review data |
| `escalation_queue` + `owner_questions` + `owner_question_dispatches` | Escalation data |
| `discord_mention_sessions` + `discord_thread_sessions` | Discord integration data |
