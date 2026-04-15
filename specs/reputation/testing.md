---
spec: scorer.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/reputation-scorer.test.ts` | Unit | `computeScore` component math, trust level thresholds, weighted sum, `computeAllIfStale` staleness check, `recordEvent`, `getHistory`, `setAttestationHash` |
| `server/__tests__/reputation-db.test.ts` | Unit | `getReputationRecord`, `listReputationRecords`, `getReputationEvents`, `deleteReputationRecord` |
| `server/__tests__/reputation-decay.test.ts` | Unit | Score decay behavior over time |
| `server/__tests__/reputation-guard.test.ts` | Unit | Trust-level-based access guards |
| `server/__tests__/reputation-verifier.test.ts` | Unit | Attestation hash verification |
| `server/__tests__/routes-reputation.test.ts` | Integration | REST endpoints: compute, get score, get history, list all, record event |
| `server/__tests__/check-reputation-tool.test.ts` | Unit | MCP tool handler for reputation check |

## Manual Testing

- [ ] Create an agent with no tasks, reviews, or events, run `computeScore()`, and verify the default component breakdown (taskCompletion=50, peerRating=50, creditPattern=50, securityCompliance=100, activityLevel=0; overall=55)
- [ ] Add 3 security violation events within 90 days and confirm `securityCompliance = 40`
- [ ] Add 10 sessions in the last 30 days and confirm `activityLevel = 100`
- [ ] Compute a score, wait 5+ minutes (or mock the timestamp), call `computeAllIfStale()`, and confirm the score is recomputed
- [ ] Compute a score, wait <5 minutes, call `computeAllIfStale()`, and confirm the cached score is returned unchanged

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Agent exists in `agents` table but has no `agent_reputation` row | `getCachedScore()` returns null |
| Agent not in `agents` table | Not included in `computeAll()` or `computeAllIfStale()` results |
| `computed_at` is an invalid date string | Treated as stale; score is recomputed |
| `DEFAULT_WEIGHTS` modified so they sum to >1.0 | Overall score still clamped to [0, 100] |
| Security violation count = 5 (would give -100) | Floored at 0 (not negative) |
| Activity: 0 sessions in 30 days | `activityLevel = 0` |
| Activity: 15 sessions in 30 days | `activityLevel = 100` (capped at 100) |
| Less than 3 completed tasks | `taskCompletion` defaults to 50 |
| `recordEvent` called with unknown event type | Inserted as-is (no validation in scorer; type is a string union) |
