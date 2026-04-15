---
spec: scorer.spec.md
sources:
  - server/reputation/scorer.ts
  - server/reputation/types.ts
  - server/db/reputation.ts
---

## Module Structure

Three files:
- `types.ts` — all types: `TrustLevel`, `ReputationScore`, `ReputationComponents`, `ScoreWeights`, `DEFAULT_WEIGHTS`, `ReputationEvent`, `ReputationEventType`, `ComponentExplanation`, `ScoreExplanation`, `ReputationHistoryPoint`, `ReputationRecord`, `ReputationEventRecord`, `RecordEventInput`
- `scorer.ts` — `ReputationScorer` class; score computation, caching, staleness check, event recording, history
- `db/reputation.ts` — raw DB helper functions: `getReputationRecord`, `listReputationRecords`, `getReputationEvents`, `deleteReputationRecord`

## Key Classes and Functions

**`ReputationScorer`** — Stateful service backed by SQLite. Each `computeScore()` call runs five independent SQL queries to gather component data, computes each score, applies weights, clamps to [0, 100], derives trust level, and upserts into `agent_reputation`. Also appends a row to `reputation_history`.

**Component computation details:**

| Component | Data Source | Default (insufficient data) |
|-----------|-------------|------------------------------|
| Task completion | `work_tasks` completed/total ratio | 50 (< 3 tasks) |
| Peer rating | `marketplace_reviews` average | 50 (no reviews) |
| Credit pattern | `credit_ledger` spend patterns | 50 (no credit events) |
| Security compliance | `reputation_events` with type `security_violation` in last 90 days | 100 - (violations × 20), floor 0 |
| Activity level | `sessions` count in last 30 days | `min(100, count × 10)` |

**Trust level thresholds:** blacklisted (explicit) → verified (≥90) → high (≥70) → medium (≥50) → low (≥25) → untrusted (<25).

**`computeAllIfStale()`** — Queries `agent_reputation` for all agents with `computed_at` older than 5 minutes or NULL, then calls `computeScore()` for each. Returns all scores sorted descending.

## Configuration Values

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_WEIGHTS` | task: 0.30, peer: 0.25, credit: 0.15, security: 0.20, activity: 0.10 | Must sum to 1.0; can be overridden in constructor |
| Staleness threshold | 5 minutes | Hardcoded in `computeAllIfStale()` |
| Security violation window | 90 days | Lookback for security compliance calculation |
| Activity window | 30 days | Session count window for activity level |

## Related Resources

**DB tables:** `agent_reputation` (primary key: `agent_id`), `reputation_events` (UUID PK), `reputation_history` (autoincrement PK).

**Consumed by:** `server/routes/reputation.ts`, `server/scheduler/service.ts` (scheduled attestation), `server/mcp/tool-handlers/reputation.ts`, `server/reputation/attestation.ts` (on-chain publishing).
