---
spec: response-quality.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/agent-session-limits.test.ts` | Unit | `AgentSessionLimiter`: tier-based limits for each rate-limited tool; `checkAndIncrement` pass/fail; `canVoteInCouncil` by tier; non-rate-limited tool pass-through |
| `server/__tests__/wait-sessions.test.ts` | Unit | `waitForSessions` subscribe-first pattern; heartbeat catching missed exits; safety timeout; empty session list; overall timeout |
| `server/__tests__/session-heartbeat.test.ts` | Unit | Heartbeat timing constant values |
| `server/__tests__/council-wait-sessions.test.ts` | Integration | Council-level `waitForSessions` behavior across multiple sessions |
| `server/__tests__/session-cheerleading-detector.test.ts` | Unit | `scoreResponseQuality` signal detection; `ResponseQualityTracker` consecutive tracking; `RepetitiveToolCallDetector` fingerprinting |

## Manual Testing

- [ ] Create `AgentSessionLimiter` for a `limited` tier model; call `checkAndIncrement('corvid_github_create_pr')` at the limit; verify error string returned
- [ ] Call `checkAndIncrement('corvid_read_file')` on any tier; verify `null` is returned (non-rate-limited)
- [ ] Call `waitForSessions` with two sessions; emit exit events for both; verify `completed: [s1, s2]` and `timedOut: []`
- [ ] Call `waitForSessions` with a session that exits between subscribe and `isRunning` check (simulate race); verify heartbeat catches it before timeout
- [ ] Trigger the safety timeout by having all sessions dead but no exit events; verify resolution with all sessions in `completed`
- [ ] Score a pure cheerleading response; verify score < 0.35
- [ ] Score an empty text response with tool calls; verify score is 1.0
- [ ] Score a response with code blocks and file paths; verify score > 0.8
- [ ] Feed the same response to `RepetitionTracker` 3 times; verify `'break'` is returned on the third call
- [ ] Call `countVacuousToolCalls` with a `corvid_save_memory` call where content is 5 chars; verify it is counted as vacuous

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `checkAndIncrement` called at exactly the limit | Returns error string with tier name and count; does not increment |
| `checkAndIncrement` for an unknown tool name | Returns `null` (non-rate-limited pass-through) |
| `waitForSessions` called with empty list | Resolves immediately with `{ completed: [], timedOut: [] }` |
| `waitForSessions` overall timeout fires | Remaining sessions appear in `timedOut`; subscriptions cleaned up |
| `waitForSessions` all sessions complete before heartbeat fires | Resolves without waiting for heartbeat timer |
| `scoreResponseQuality` with null text | Treated as empty string; returns 0.0 without tool calls |
| `scoreResponseQuality` with empty text and tool calls | Returns 1.0 |
| `ResponseQualityTracker` after 1 low-quality response | No nudge yet (threshold is 2 consecutive) |
| `ResponseQualityTracker` after 2 consecutive low-quality | Nudge triggered |
| Above-threshold response resets consecutive count | Counter resets; next single low-quality does not trigger nudge |
| `RepetitiveToolCallDetector` with different args | Not flagged as loop (different fingerprints) |
| `RepetitiveToolCallDetector` with sorted JSON args matching | Flagged after `threshold` consecutive identical calls |
| `nudgesExhausted` set | No further nudges injected regardless of quality scores |
