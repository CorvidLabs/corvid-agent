---
module: flock-testing-challenges
version: 2
status: active
files:
  - server/flock-directory/testing/challenges.ts
depends_on: []
---

# Flock Testing Challenges

## Purpose

Defines test challenge definitions for automated agent evaluation in the Flock Directory. Each challenge belongs to a category (responsiveness, accuracy, context, efficiency, safety, bot_verification) and specifies messages, expected outcomes, timeouts, and weights.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getChallengesByCategory` | `(category: ChallengeCategory)` | `Challenge[]` | Filter challenges by category |
| `getRandomChallenges` | `(count: number, category?: ChallengeCategory)` | `Challenge[]` | Get a random subset, optionally filtered |

### Exported Types

| Type | Description |
|------|-------------|
| `ChallengeCategory` | Union: 'responsiveness' \| 'accuracy' \| 'context' \| 'efficiency' \| 'safety' \| 'bot_verification' |
| `Challenge` | Challenge definition with id, category, messages, expected outcome, timeout, weight |
| `ChallengeExpectation` | Discriminated union for expected outcomes (contains, regex, numeric, rejection, context_recall, any_response) |

### Exported Constants

| Constant | Description |
|----------|-------------|
| `RESPONSIVENESS_CHALLENGES` | Built-in responsiveness challenges (3) |
| `ACCURACY_CHALLENGES` | Built-in accuracy challenges (4) |
| `CONTEXT_CHALLENGES` | Built-in context handling challenges (3) |
| `EFFICIENCY_CHALLENGES` | Built-in efficiency challenges (2) |
| `SAFETY_CHALLENGES` | Built-in safety challenges (3) |
| `BOT_VERIFICATION_CHALLENGES` | Built-in bot verification challenges (4) |
| `ALL_CHALLENGES` | All 19 built-in challenges combined |
| `CHALLENGE_CATEGORIES` | Array of all 6 category names |

## Key Behaviors

- Each challenge has a unique `id` prefixed by category abbreviation (e.g., `bot-` for bot_verification)
- Multi-turn challenges (context category) use message arrays with 2+ entries
- Safety challenges always expect `rejection` type responses
- Challenge weights allow certain challenges to count more in scoring
- Timeouts are per-challenge, ranging from 10s to 30s

## Invariants

- All challenge IDs are unique across the entire challenge set
- Every challenge has at least one message
- Every challenge has a positive timeout and weight
- `ALL_CHALLENGES` equals the union of all category arrays

## Behavioral Examples

- `getChallengesByCategory('safety')` returns only challenges with `category === 'safety'`
- `getRandomChallenges(3)` returns 3 challenges from the full pool
- `getRandomChallenges(1000)` returns all challenges (capped at pool size)

## Error Cases

- `getChallengesByCategory` with an unknown category returns an empty array

## Dependencies

_No runtime dependencies._

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-03-15 | Initial version — 15 challenges across 5 categories |
| 2 | 2026-03-17 | Added bot_verification category (4 challenges, 19 total across 6 categories) |
