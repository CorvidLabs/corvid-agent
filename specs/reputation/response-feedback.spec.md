---
module: response-feedback
version: 1
status: draft
files:
  - server/routes/reputation.ts
  - server/reputation/scorer.ts
  - server/db/migrations/090_response_feedback.ts
  - server/lib/validation.ts
db_tables:
  - response_feedback
  - reputation_events
depends_on:
  - specs/reputation/scorer.spec.md
  - specs/db/schema.spec.md
---

# Response Feedback

## Purpose

Allows users to submit thumbs-up / thumbs-down feedback on agent responses. Feedback is stored in the `response_feedback` table and integrated into the reputation scoring system via `feedback_received` events, influencing the peer rating component of an agent's reputation score.

## Table Schema

```sql
CREATE TABLE IF NOT EXISTS response_feedback (
    id              TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    session_id      TEXT DEFAULT NULL,
    source          TEXT NOT NULL DEFAULT 'api',   -- 'api', 'discord', 'algochat'
    sentiment       TEXT NOT NULL,                  -- 'positive' or 'negative'
    category        TEXT DEFAULT NULL,              -- 'helpful', 'accurate', 'truthful', 'harmful', 'inaccurate', 'untruthful'
    comment         TEXT DEFAULT NULL,
    submitted_by    TEXT DEFAULT NULL,              -- wallet address or user identifier
    created_at      TEXT DEFAULT (datetime('now'))
)
```

Indexes: `agent_id`, `created_at`.

## Public API

### Exported Schemas

- `SubmitFeedbackSchema` — Zod schema for validating feedback submission requests.

### Route Handlers (internal to `handleReputationRoutes`)

- `POST /api/reputation/feedback` — Submit feedback
- `GET /api/reputation/feedback/:agentId` — Get feedback with aggregates

### Scorer Functions (module-private)

- `computeFeedbackScore(db, agentId)` — Returns feedback-based score (0-100) or null if insufficient data.

## API Endpoints

### POST /api/reputation/feedback

Submit feedback for an agent response.

**Request body:**
- `agentId` (string, required)
- `sessionId` (string, optional)
- `source` (enum: `api`, `discord`, `algochat`; default `api`)
- `sentiment` (enum: `positive`, `negative`; required)
- `category` (enum: `helpful`, `accurate`, `truthful`, `harmful`, `inaccurate`, `untruthful`; optional)
- `comment` (string, max 500 chars, optional)
- `submittedBy` (string, optional)

**Response:** `{ ok: true, id: "<uuid>" }` (201)

### GET /api/reputation/feedback/:agentId

Get feedback for an agent with aggregates.

**Query params:**
- `limit` (number, default 50)

**Response:**
```json
{
  "feedback": [...],
  "aggregate": { "positive": 5, "negative": 1, "total": 6 }
}
```

## Reputation Integration

Each feedback submission records a `feedback_received` reputation event:
- Positive sentiment: +2 score impact
- Negative sentiment: -2 score impact

The peer rating component blends marketplace reviews with response feedback:
- Both present: 60% marketplace + 40% feedback
- Only marketplace: marketplace score
- Only feedback: feedback score (positive_ratio * 100)
- Neither: default 50

Feedback score requires a minimum of 3 feedbacks within 90 days to be included.

## Anti-Spam Measures

- **Rate limiting:** A single `submittedBy` identifier can submit at most 10 feedbacks per agent per 24-hour period. Exceeding the limit returns HTTP 429.
- **Comment length:** Limited to 500 characters.
- **Minimum threshold:** Fewer than 3 feedbacks are insufficient for scoring and do not affect the peer rating component.

## Invariants

1. Sentiment must be exactly `'positive'` or `'negative'`.
2. A single `submittedBy` identifier cannot exceed 10 feedbacks per agent per 24-hour window.
3. Feedback score is only factored into peer rating when there are at least 3 feedbacks in the last 90 days.
4. Blending ratio is fixed at 60% marketplace / 40% feedback when both data sources are available.
5. Each feedback submission creates exactly one `feedback_received` reputation event.

## Behavioral Examples

- Submitting positive feedback with `agentId: "a1"` inserts a row into `response_feedback` and records a `feedback_received` event with `score_impact: +2`.
- Submitting negative feedback records a `feedback_received` event with `score_impact: -2`.
- An agent with 4 positive and 1 negative feedback (no marketplace reviews) gets a peer rating of 80.
- An agent with marketplace rating 3/5 (score 50) and 3/3 positive feedback (score 100) gets blended peer rating of 70.
- An 11th feedback from the same `submittedBy` for the same agent within 24 hours is rejected with HTTP 429.

## Error Cases

- Missing `agentId`: returns 400 with validation error.
- Invalid `sentiment` value (e.g. `"neutral"`): returns 400 with validation error.
- Invalid `category`: returns 400 with validation error.
- Comment exceeding 500 characters: returns 400 with validation error.
- Rate limit exceeded (>= 10 per submitter per agent per day): returns 429.
- Reputation service unavailable: returns 503.

## Dependencies

- `server/reputation/scorer.ts` — `ReputationScorer` for recording events and computing scores.
- `server/lib/validation.ts` — `SubmitFeedbackSchema`, `parseBodyOrThrow`, `ValidationError`.
- `server/lib/response.ts` — `json`, `badRequest`, `handleRouteError`.
- `server/db/schema.ts` — inline migration 90 for `response_feedback` table.

## Change Log

| Version | Date       | Description                           |
|---------|------------|---------------------------------------|
| 1       | 2026-03-14 | Initial implementation (issue #1094)  |
