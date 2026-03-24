---
module: flock-testing-runner
version: 2
status: active
files:
  - server/flock-directory/testing/runner.ts
db_tables:
  - flock_test_results
  - flock_test_challenge_results
depends_on:
  - server/flock-directory/testing/challenges.ts
  - server/flock-directory/testing/evaluator.ts
  - server/lib/logger.ts
---

# Flock Test Runner

## Purpose

Orchestrates automated test execution against registered Flock Directory agents. Uses a pluggable `TestTransport` interface for message delivery (AlgoChat, HTTP, or mock). Persists results to SQLite for historical tracking and score decay.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `TestTransport` | Interface: `sendAndWait(address, message, timeoutMs, threadId?) → string \| null` |
| `TestRunConfig` | Config: mode (full/random), randomCount, categories filter, decayPerDay |

### Exported Classes

| Class | Description |
|-------|-------------|
| `FlockTestRunner` | Test orchestrator with DB persistence |

#### FlockTestRunner Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `runTest` | `(agentId, agentAddress, config?)` | `Promise<TestSuiteResult>` | Execute challenges and persist results |
| `getLatestResult` | `(agentId)` | `TestSuiteResult \| null` | Most recent test result |
| `getResults` | `(agentId, limit?)` | `TestSuiteResult[]` | Historical results, newest first |
| `getEffectiveScore` | `(agentId, decayPerDay?)` | `number` | Score with time-based decay applied |
| `getTestStats` | `()` | `{ totalTests, testedAgents, avgScore }` | Aggregate stats across all agents |

## Key Behaviors

- Challenges execute sequentially to support multi-turn conversations
- Multi-turn challenges (2+ messages) share a threadId so the agent can recall earlier turns
- Multi-turn challenges send all messages; timeout on any message fails the entire challenge
- Results persisted to `flock_test_results` (suite-level) and `flock_test_challenge_results` (per-challenge)
- Score decay: effective_score = raw_score * max(0, 1 - decayPerDay * daysSinceTest)
- Default decay rate: 2% per day
- Transport errors caught gracefully — challenge scored as timeout
- Random mode shuffles and slices challenge pool

## Invariants

- `runTest` always persists results to DB before returning
- `getEffectiveScore` returns 0 for untested agents
- Results are always ordered by `completed_at DESC`
- Score decay never produces negative values (clamped at 0)

## Behavioral Examples

- `runTest('agent-1', 'ADDR', { mode: 'full' })` runs all 15 challenges and persists results
- `runTest('agent-1', 'ADDR', { mode: 'random', randomCount: 3 })` runs 3 random challenges
- `getEffectiveScore('agent-1', 0.02)` applies 2%/day decay to the most recent raw score

## Error Cases

- Transport error during challenge → challenge scored as timeout (score 0)
- Agent not found in DB for result queries → returns null or empty array
- No test results for agent → `getEffectiveScore` returns 0

## Dependencies

- `challenges.ts` — Challenge definitions and selection utilities
- `evaluator.ts` — Response scoring and aggregation
- `server/lib/logger.ts` — Structured logging

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-03-15 | Initial version — TestTransport interface, DB persistence, score decay |
| 2 | 2026-03-24 | Added threadId parameter to TestTransport for multi-turn context continuity |
