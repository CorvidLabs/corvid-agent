---
spec: session-metrics.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/agent-messages.test.ts` | Unit | Inter-agent message queue operations |
| `server/__tests__/algochat-messages.test.ts` | Unit | On-chain message inbox queries |
| `server/__tests__/discord-mention-sessions.test.ts` | Unit | Mention session creation, project association, TTL |
| `server/__tests__/discord-bridge-threads.test.ts` | Integration | Thread/session mapping bidirectional lookups |
| `server/__tests__/escalation.test.ts` | Unit | Escalation queue routing, dispatch tracking |
| `server/__tests__/buddy-review-prompt.test.ts` | Unit | Buddy session creation and prompt building |
| `server/__tests__/telegram-config.test.ts` | Unit | Telegram config DB operations |

## Manual Testing

- [ ] Create a session via API: verify UUID generated, status starts as `idle`
- [ ] Start a session (running): verify `updated_at` timestamp updates, `pid` set
- [ ] Stop a session: verify `status=stopped`, `pid=null`
- [ ] Add messages to a session: verify ordered by `timestamp ASC` in `getSessionMessages`
- [ ] Delete a session: verify messages cascade-deleted, AlgoChat conversation unlinked
- [ ] Create an AlgoChat conversation twice with same `participant_addr`: verify upsert updates session/agent
- [ ] Trigger a session summary update: verify `conversation_summary` stored and retrievable
- [ ] Create a Discord thread session map: verify bidirectional lookup works
- [ ] Check `restart_pending` cleanup: restart server with a pending session; verify it becomes `failed`

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `getSession` for non-existent ID | Returns `null` |
| `updateSessionCost` called multiple times | Cost and turns are cumulative (additive) |
| `updateSessionAlgoSpent` called multiple times | Additive increment, not replacement |
| `createConversation` with duplicate `participant_addr` | Upserts: updates `agent_id` and `session_id` without creating duplicate |
| `deleteSession` removes session with active messages | Messages cascade-deleted in SQLite |
| `getPreviousThreadSessionSummary` for thread with no prior sessions | Returns `null` |
| `updateSession` for non-existent ID | Returns `null` |
| Session with `restart_pending=1` at server startup | Marked as `status=failed` during startup cleanup |
| `listSessionsByCouncilLaunch` for launch with no sessions | Returns empty array |
| Discord mention session with `conversation_only=true` | Stored correctly; filtering by this flag works |
