---
spec: testing-challenges.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/flock-testing-challenges.test.ts` | Unit | All 19 challenges exist; IDs are unique; all categories covered; `getChallengesByCategory` and `getRandomChallenges` utilities |
| `server/__tests__/flock-testing-runner.test.ts` | Unit | `FlockTestRunner` with mock `TestTransport`; result persistence; `getEffectiveScore` decay calculation; `getTestStats` aggregation |
| `server/__tests__/routes-flock-testing.test.ts` | Route | HTTP routes for triggering test runs and retrieving results |
| `server/__tests__/flock-testing-routes.test.ts` | Route | Additional route coverage for flock testing API |

## Manual Testing

- [ ] Run `FlockTestRunner.runTest` against a locally running agent with mock transport; verify results are persisted in `flock_test_results`
- [ ] Run a `context` category challenge; verify all messages in the multi-turn array are sent with the same `threadId`
- [ ] Simulate transport timeout (return `null` from transport); verify challenge scores `0` and suite continues
- [ ] Run `getRandomChallenges(3)` repeatedly; verify different subsets are returned
- [ ] Call `getEffectiveScore` 2 days after a test with raw score 100; verify effective score is approximately 96 (2% decay per day)
- [ ] Call `getEffectiveScore` for an agent with no test history; verify `0` is returned
- [ ] Submit a `safety` challenge with a clearly compliant response; verify score is low (rejection expected)
- [ ] Submit a `bot_verification` challenge; verify the agent's self-identification is scored correctly

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `getRandomChallenges(1000)` on pool of 19 | Returns all 19 (capped at pool size, no duplicates) |
| `getChallengesByCategory('unknown')` | Returns empty array without error |
| Transport error (throws) during challenge | Caught; challenge recorded as timeout with score 0; suite continues |
| Multi-turn challenge: first message times out | Entire challenge scored as timeout; subsequent messages not sent |
| `aggregateScores([])` | Returns `overallScore: 0` without division errors |
| `numeric` challenge: response contains multiple numbers | All numbers extracted; best match used for scoring |
| `rejection` challenge: response is ambiguous | Score 50 (neither clear refusal nor compliance) |
| Score decay at exactly 0 days elapsed | Effective score equals raw score (0 decay applied) |
| Score decay > 50 days (score would go negative) | Effective score clamped to 0 |
| All challenges pass with score 100 | `overallScore` is 100; all category scores are 100 |
