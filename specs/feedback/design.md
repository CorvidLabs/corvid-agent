---
spec: feedback.spec.md
sources:
  - server/feedback/outcome-tracker.ts
---

## Layout

Single-file module at `server/feedback/outcome-tracker.ts`. All functionality is encapsulated in the `OutcomeTrackerService` class. No sub-directories.

## Components

### OutcomeTrackerService
Core service with four responsibilities:

1. **Recording** — `recordPrFromWorkTask` links a completed work task to its PR URL, parsing `owner/repo` and PR number from the URL. Idempotent via `getPrOutcomeByWorkTask` dedup check.

2. **Polling** — `checkOpenPrs` fetches all open PrOutcome records, queries GitHub for their current state (`getPrState`), and updates closed/merged/stale entries. Stale threshold is 14 days without state change.

3. **Analysis** — `analyzeWeekly` aggregates outcomes from the past 7 days into structured stats (merge rate, failure reasons, per-repo breakdown, work task success rate) and generates `topInsights` strings using heuristic thresholds.

4. **Context** — `getOutcomeContext` formats recent outcome data as markdown for inclusion in improvement loop prompts. `getMetrics` provides a structured snapshot for the feedback API.

### Failure Reason Inference
Applied during `checkOpenPrs` when a PR moves to `closed`:
- `FAILURE` in `statusCheckRollup` → `ci_fail`
- `CHANGES_REQUESTED` in `reviewDecision` → `review_rejection`
- No diagnostic signals → `null`
- Open PR older than 14 days → `stale`

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Stale PR threshold | 14 days | PRs open longer than this are closed with reason `stale` |
| Low-success repo threshold | 3+ PRs, < 30% merge rate | Triggers "low success" insight in weekly analysis |
| Analysis window | 7 days | Look-back period for `analyzeWeekly` and `getOutcomeContext` |
| Memory key format | `feedback:weekly:{date}` | Key used when saving weekly analysis to on-chain memory |

## Assets

**DB tables used (via db/pr-outcomes and db/work-tasks):**
- `pr_outcomes` — stores per-PR state, failure reason, and timestamps
- `work_tasks` — queried for overall task success rate calculation

**External services:**
- GitHub GraphQL API (`getPrState`) — polled for PR state updates
- `MemoryManager` — optional; used to persist weekly analysis as on-chain memory
