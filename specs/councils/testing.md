---
spec: councils.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/council-discussion.test.ts` | Unit | `buildDiscussionPrompt`, `formatDiscussionMessages`, event bus pub/sub, auto-advance watcher race-condition fix |
| `server/__tests__/council-synthesis.test.ts` | Unit | `aggregateSessionResponses` (reviewer preference), `finishWithAggregatedSynthesis`, dependency-injected callback firing |
| `server/__tests__/council-wait-sessions.test.ts` | Unit | `waitForSessions` timeout handling, partial results on timeout, heartbeat polling for silent exits |
| `server/__tests__/governance-tier.test.ts` | Unit | `classifyPath`, `classifyPaths`, `assessImpact`, `evaluateWeightedVote`, `checkAutomationAllowed` |
| `server/__tests__/governance-ci-check.test.ts` | Integration | CI enforcement of Layer 0/1 automation blocking |
| `server/__tests__/routes-councils.test.ts` | Integration | HTTP API: launch, abort, triggerReview, triggerSynthesis, startCouncilChat error paths |

## Manual Testing

- [ ] Launch a council with 3 agents and 2 discussion rounds; verify stage progression: `responding → discussing → reviewing → synthesizing → complete`
- [ ] Launch a council with `discussionRounds: 0`; verify discussion stage is skipped
- [ ] Abort a council while sessions are running; verify sessions are killed and stage becomes `complete`
- [ ] Start council chat after synthesis; verify chairman session is created with correct system prompt
- [ ] Resume council chat (second call); verify `resumeProcess` is called, not a new session
- [ ] Launch a council with `onChainMode: 'attestation'`; verify `synthesis_txid` is populated after completion
- [ ] Launch a governance council targeting `package.json` (Layer 1); verify vote requires human approval

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `triggerReview` called when stage is `synthesizing` | Returns `{ ok: false, error: 'Cannot start review from stage synthesizing', status: 400 }` |
| `triggerSynthesis` called when stage is `reviewing` but no chairman assigned | Returns `{ ok: false, error: 'Council has no chairman agent assigned', status: 400 }` |
| `abortCouncil` on already-complete launch | Returns `{ ok: false, error: 'Launch already complete', status: 400 }` |
| `startCouncilChat` when synthesis is null | Returns `{ ok: false, error: 'No synthesis available to chat about', status: 400 }` |
| One of 3 member sessions fails to start | Error logged; remaining 2 sessions continue; launch proceeds with partial responses |
| All discussion rounds time out (3h hard cap) | Remaining rounds skipped; `triggerReview` called as recovery |
| One agent times out during discussion round | `waitForSessions` returns partial; timed-out session force-stopped; round proceeds with available responses |
| Governance: high-reputation agent approves, two low-reputation agents reject | Weighted ratio computed; Layer 2 threshold may still pass (90/(90+30+50) = 52.9%) |
| Governance: Layer 0 file path (e.g., `server/councils/governance.ts`) | `checkAutomationAllowed` returns `allowed: false`; automation blocked regardless of vote |
| `onChainMode: 'full'` with localnet down | `sendOnChainBestEffort` fires silently; no throw; council proceeds |
| Council event listener unsubscribed during broadcast | Unsubscribe function removes callback from array; subsequent broadcasts skip it |
| Two calls to `wireEventBroadcasting` | Second call adds duplicate listeners; should only be called once (invariant 2) |
