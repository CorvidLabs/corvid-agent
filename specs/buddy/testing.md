---
spec: service.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/buddy-service-approval.test.ts` | Unit | Approval detection logic: LGTM variants, negative qualifiers, length threshold |
| `server/__tests__/buddy-round-callback.test.ts` | Unit | `onRoundComplete` callback invocation, `approved` flag in `BuddyRoundEvent` |
| `server/__tests__/buddy-db.test.ts` | Unit | DB operations: `createBuddySession`, `updateBuddySessionStatus`, `addBuddyMessage`, `getBuddySession` |
| `server/__tests__/buddy-review-prompt.test.ts` | Unit | Review prompt construction for buddy agent (feedback formatting) |
| `server/__tests__/buddy-mixed-provider.test.ts` | Integration | Buddy sessions with mixed provider configurations (e.g., lead=Anthropic, buddy=Ollama) |
| `server/__tests__/buddy-discord-labels.test.ts` | Unit | Discord-visible buddy conversation label formatting |
| `server/__tests__/routes-buddy.test.ts` | Integration | HTTP endpoints for buddy session creation and status |

## Manual Testing

- [ ] Create a buddy session with two different agents via `POST /api/buddy-sessions`; verify the session completes and both agents' outputs appear in the response
- [ ] Create a session where the buddy responds with "LGTM" on round 1; verify the loop terminates after one round (not the full maxRounds)
- [ ] Create a session where the buddy provides feedback (not an approval) and verify the lead receives the feedback in round 2
- [ ] Attempt to create a buddy session with the same agent as both lead and buddy; verify a 400 error is returned
- [ ] Create a buddy session with `maxRounds = 15`; verify it is clamped to 10
- [ ] Verify that buddy sessions only have access to Read/Glob/Grep tools (check session tool permissions in the DB)

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Lead and buddy are the same agent | Throws `Error: Lead and buddy agent cannot be the same` |
| Lead agent ID not in database | Throws `Error: Lead agent not found: <id>` |
| Buddy agent ID not in database | Throws `Error: Buddy agent not found: <id>` |
| `maxRounds = 0` | Clamped to 1; session runs at least one round |
| `maxRounds = 100` | Clamped to 10 |
| Buddy response is exactly 300 chars with "LGTM" | Not treated as approval (limit is `< 300`) |
| Buddy response is 299 chars with "LGTM" | Treated as early approval |
| Buddy says "looks good but there are issues" | Negative qualifier `issues` prevents approval |
| Lead agent produces no output (empty response) | Loop breaks; session completes with whatever lead produced |
| Conversation loop throws unexpected error | Session status set to `failed`; `onSessionUpdate` listeners notified |
| Agent turn times out (5 min elapsed) | `stopProcess` called; partial output used; loop continues to next round or ends |
| `onRoundComplete` callback throws | Error is logged; loop continues (callback errors are isolated) |
