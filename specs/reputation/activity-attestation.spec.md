---
module: activity-attestation
version: 1
status: draft
files:
  - server/reputation/activity-attestation.ts
db_tables:
  - activity_summaries
  - sessions
  - work_tasks
  - reputation_events
depends_on:
  - specs/reputation/scorer.spec.md
tracks: [1458]
---

# Activity Summary Attestation

## Purpose

Aggregates daily or weekly activity metrics (sessions, work tasks, credits, reputation events) from the local database and produces a SHA-256 hashed summary that can optionally be published on-chain as a tamper-evident attestation. Summaries are stored in the `activity_summaries` table for retrieval via the reputation API.

## Public API

### Exported Interfaces

| Interface | Description |
|-----------|-------------|
| `ActivitySummaryPayload` | Typed shape for a period's aggregated metrics |
| `ActivitySummaryRecord` | Database row representation of a stored summary |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ActivitySummaryAttestation` | Builds, hashes, stores, and optionally publishes activity summaries |

#### ActivitySummaryAttestation Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `buildPayload` | `(period: 'daily' \| 'weekly') => ActivitySummaryPayload` | Queries the database for session, work-task, credit, and reputation metrics within the given period window |
| `hashPayload` | `(payload: ActivitySummaryPayload) => Promise<string>` | Returns a hex-encoded SHA-256 hash of the canonical JSON payload |
| `createSummary` | `(period, sendTransaction?) => Promise<{ hash, txid }>` | Builds the payload, stores it in `activity_summaries`, and optionally publishes the hash on-chain via the provided transaction callback |
| `listSummaries` | `(period?, limit?) => ActivitySummaryRecord[]` | Returns stored summaries, optionally filtered by period, ordered by most recent first |

## Database

### activity_summaries

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `period` | TEXT | `'daily'` or `'weekly'` |
| `period_start` | TEXT | ISO-8601 start of the reporting window |
| `period_end` | TEXT | ISO-8601 end of the reporting window |
| `payload` | TEXT | Canonical JSON of the summary |
| `hash` | TEXT | SHA-256 hex digest of the payload |
| `txid` | TEXT | Algorand transaction ID (null if not published) |
| `published_at` | TEXT | Timestamp of on-chain publication (null if not published) |
| `created_at` | TEXT | Row creation timestamp |

## Data Flow

1. `buildPayload` queries `sessions`, `work_tasks`, and `reputation_events` tables for the period window.
2. `hashPayload` produces a deterministic SHA-256 digest of the JSON payload.
3. `createSummary` stores the record via `INSERT OR REPLACE` keyed on period/dates, then optionally calls `sendTransaction` with a formatted note string (`corvid-activity:{period}:{date}:{hash_prefix}`).
4. On-chain publication failure is logged but does not fail the overall operation (best-effort).
