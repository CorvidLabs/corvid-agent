---
spec: testing-challenges.spec.md
sources:
  - server/flock-directory/testing/challenges.ts
  - server/flock-directory/testing/evaluator.ts
  - server/flock-directory/testing/runner.ts
---

## Layout

Sub-module under `server/flock-directory/testing/`:
- `challenges.ts` — 19 static challenge definitions across 6 categories; no runtime deps
- `evaluator.ts` — scoring functions (`evaluateResponse`, `aggregateScores`) and type exports
- `runner.ts` — `FlockTestRunner` class with DB persistence and transport abstraction

## Components

### challenges.ts
Static data layer. All 19 challenge objects are organized into 6 constant arrays and re-exported as `ALL_CHALLENGES`. Selection utilities:
- `getChallengesByCategory(category)` — filter by category string
- `getRandomChallenges(count, category?)` — shuffle and slice; capped at pool size

**Categories and counts:**
| Category | Count | Description |
|----------|-------|-------------|
| `responsiveness` | 3 | Basic response and latency checks |
| `accuracy` | 4 | Factual and calculation correctness |
| `context` | 3 | Multi-turn context recall (2+ messages per challenge) |
| `efficiency` | 2 | Conciseness and focused answers |
| `safety` | 3 | Refusal of harmful/jailbreak requests |
| `bot_verification` | 4 | Confirms agent is running and self-aware |

### evaluator.ts
Stateless scoring layer. `evaluateResponse` dispatches on `ChallengeExpectation` type:
- `contains` — case-insensitive substring match; partial credit for partial matches
- `regex` — full regex test against response
- `numeric` — extracts numbers from response; full credit for exact match within tolerance, partial credit for close answers
- `rejection` — keyword match for refusal/compliance indicators; ambiguous responses score 50
- `context_recall` — proportional to recalled keywords across multi-turn messages
- `any_response` — time-based scoring tiers: <30% / <60% / <90% / ≥90% of timeout

`aggregateScores` produces weighted per-category and overall scores using `CATEGORY_WEIGHTS`.

### FlockTestRunner (runner.ts)
Orchestrator with pluggable `TestTransport` interface:
1. Loads challenges (filtered or full pool)
2. Executes challenges sequentially; multi-turn challenges share `threadId` for context continuity
3. Calls `evaluateResponse` per challenge; `aggregateScores` for the suite
4. Persists results to `flock_test_results` (suite level) and `flock_test_challenge_results` (per-challenge)
5. Provides `getEffectiveScore` with configurable time-based decay (default 2%/day)

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| `CATEGORY_WEIGHTS` | responsiveness 15, accuracy 20, context 15, efficiency 10, safety 20, bot_verification 20 | Sums to 100 |
| Challenge timeout range | 90s – 120s | Per-challenge; sized to include process boot time |
| Default score decay | 2% per day | Applied in `getEffectiveScore` |

## Assets

**DB tables:**
- `flock_test_results` — suite-level results (agentId, overallScore, completedAt)
- `flock_test_challenge_results` — per-challenge results linked to suite result

**External interfaces:**
- `TestTransport` — interface for message delivery (AlgoChat, HTTP, or mock); injected into `FlockTestRunner`
