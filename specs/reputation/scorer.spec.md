---
module: reputation-scorer
version: 1
status: draft
files:
  - server/reputation/scorer.ts
  - server/reputation/types.ts
db_tables:
  - agent_reputation
  - reputation_events
  - agents
  - work_tasks
  - sessions
  - marketplace_listings
  - marketplace_reviews
depends_on:
  - specs/db/schema.spec.md
---

# Reputation Scorer

## Purpose

Computes weighted composite reputation scores for agents from five data-driven components: task completion rate, peer ratings, credit spending patterns, security compliance, and activity level. Scores are persisted to `agent_reputation` and drive the trust-level system used across the platform (marketplace badges, federation trust, attestation).

Supports auto-computation with a 5-minute staleness threshold so that GET requests return fresh scores without manual refresh.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `ReputationScorer` | Stateful scorer service backed by a SQLite database |

#### ReputationScorer Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `computeScore` | `(agentId: string)` | `ReputationScore` | Compute and persist full score for one agent |
| `getCachedScore` | `(agentId: string)` | `ReputationScore \| null` | Return persisted score without recomputing |
| `computeAllIfStale` | `()` | `ReputationScore[]` | Recompute scores older than 5 minutes; return all sorted descending |
| `computeAll` | `()` | `ReputationScore[]` | Force-recompute every agent; return all sorted descending |
| `getAllScores` | `()` | `ReputationScore[]` | Return all cached scores sorted descending (no recomputation) |
| `recordEvent` | `(input: RecordEventInput)` | `void` | Insert a reputation event |
| `getEvents` | `(agentId: string, limit?: number)` | `ReputationEventRecord[]` | Return recent events for agent (default limit 50) |
| `setAttestationHash` | `(agentId: string, hash: string)` | `void` | Update attestation hash on persisted score |

### Exported Types (from `types.ts`)

| Type | Description |
|------|-------------|
| `TrustLevel` | `'untrusted' \| 'low' \| 'medium' \| 'high' \| 'verified'` |
| `ReputationScore` | Full score with components, trust level, attestation hash, timestamp |
| `ReputationComponents` | Five numeric component scores (0-100) |
| `ReputationEvent` | Camel-case event record |
| `ReputationEventType` | Union of 10 event type strings |
| `ScoreWeights` | Weight multipliers for the five components |
| `DEFAULT_WEIGHTS` | Default weights: task 0.30, peer 0.25, credit 0.15, security 0.20, activity 0.10 |
| `ReputationRecord` | Snake-case DB row shape for `agent_reputation` |
| `ReputationEventRecord` | Snake-case DB row shape for `reputation_events` |
| `RecordEventInput` | Input for `recordEvent()` |

## Invariants

1. All component scores are integers in the range [0, 100].
2. Overall score is the weighted sum of components, clamped to [0, 100] and rounded to nearest integer.
3. Trust level thresholds are fixed: verified >= 90, high >= 70, medium >= 50, low >= 25, untrusted < 25.
4. `computeScore()` always persists via INSERT OR REPLACE and returns the fresh score.
5. `computeAllIfStale()` only recomputes agents whose `computed_at` is older than 5 minutes or missing.
6. `computeAll()` and `computeAllIfStale()` return results sorted by `overallScore` descending.
7. Default component score is 50 when insufficient data exists (< 3 tasks, or no reviews/credit events).
8. Security compliance starts at 100 and deducts 20 per violation in the last 90 days, floored at 0.
9. Activity level is `min(100, sessions_in_30_days * 10)`.
10. Weight values in `DEFAULT_WEIGHTS` sum to 1.0.

## Behavioral Examples

### Scenario: Auto-compute stale scores

- **Given** agent A has a score computed 6 minutes ago, agent B has a score computed 2 minutes ago
- **When** `computeAllIfStale()` is called
- **Then** agent A's score is recomputed, agent B's cached score is returned, both are included in the sorted result

### Scenario: New agent with no data

- **Given** agent C exists in the `agents` table but has no tasks, reviews, or events
- **When** `computeScore('C')` is called
- **Then** taskCompletion=50, peerRating=50, creditPattern=50, securityCompliance=100, activityLevel=0; overall = 0.30*50 + 0.25*50 + 0.15*50 + 0.20*100 + 0.10*0 = 55

### Scenario: Security violations reduce score

- **Given** agent D has 3 security_violation events in the last 90 days
- **When** securityCompliance is computed
- **Then** score = max(0, 100 - 3*20) = 40

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Agent has no `agent_reputation` row | `getCachedScore()` returns null |
| Agent not in `agents` table | Not included in `computeAllIfStale()` / `computeAll()` results |
| `computed_at` is not a valid date | Treated as stale (recomputed) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | Database queries |
| `server/lib/logger.ts` | `createLogger()` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/reputation.ts` | All scorer methods |
| `server/scheduler/service.ts` | `computeScore()` for scheduled attestation |
| `server/mcp/tool-handlers.ts` | `computeScore()`, `getCachedScore()` for MCP tools |
| `server/reputation/attestation.ts` | Receives scores for on-chain publishing |

## Database Tables

### agent_reputation

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| agent_id | TEXT | PRIMARY KEY | References agents.id |
| overall_score | REAL | NOT NULL | Composite score 0-100 |
| trust_level | TEXT | NOT NULL | Derived trust level string |
| task_completion | REAL | NOT NULL | Task completion component |
| peer_rating | REAL | NOT NULL | Peer rating component |
| credit_pattern | REAL | NOT NULL | Credit pattern component |
| security_compliance | REAL | NOT NULL | Security compliance component |
| activity_level | REAL | NOT NULL | Activity level component |
| attestation_hash | TEXT | | On-chain attestation hash |
| computed_at | TEXT | NOT NULL | ISO 8601 timestamp |

### reputation_events

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| agent_id | TEXT | NOT NULL | References agents.id |
| event_type | TEXT | NOT NULL | One of ReputationEventType values |
| score_impact | REAL | NOT NULL | Positive or negative impact |
| metadata | TEXT | NOT NULL DEFAULT '{}' | JSON metadata |
| created_at | TEXT | NOT NULL DEFAULT current_timestamp | ISO 8601 timestamp |

## Configuration

No environment variables. Weights are configured via `DEFAULT_WEIGHTS` constant or constructor parameter.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-21 | corvid-agent | Initial spec (includes computeAllIfStale and computeAll from Phase 8) |
