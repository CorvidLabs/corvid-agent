---
spec: github-allowlist.spec.md
sources:
  - server/db/github-allowlist.ts
  - server/db/allowlist.ts
  - server/db/health-snapshots.ts
  - server/db/marketplace.ts
  - server/db/model-exams.ts
  - server/db/flock.ts
---

## Layout

Platform-level data-access files. These manage system-wide configuration tables (not agent-scoped or session-scoped). Each file is standalone and accessed by service/route layers directly.

```
server/db/
  github-allowlist.ts  — GitHub username allowlist for mention triggering
  allowlist.ts         — General conversation allowlist/blocklist/rate-limits
  health-snapshots.ts  — Server health snapshot recording
  marketplace.ts       — Marketplace listing and review DB access
  model-exams.ts       — Model exam run and result tracking
  flock.ts             — Flock directory agent registration and test results
```

## Components

### `github-allowlist.ts` — GitHub Username Allowlist

Controls which GitHub users can trigger agents via mentions. Supports open-mode fallback (`GITHUB_ALLOWLIST_OPEN_MODE=true`) for development deployments.

Key behavior:
- All usernames normalized to lowercase before storage and lookup
- Empty list + open mode = allow all; empty list + closed mode = deny all
- Upsert on insert (`ON CONFLICT` updates label)

### `allowlist.ts` — Conversation Allowlist / Blocklist / Rate Limits

Per-agent conversation access control:
- `agent_conversation_allowlist` — explicit allow list
- `agent_conversation_blocklist` — explicit deny list
- `agent_conversation_rate_limits` — per-user rate limit tracking

### `health-snapshots.ts` — Health Recording

Records point-in-time health snapshots from `HealthCollector`. Supports rolling window queries for trend analysis. Tables: `health_snapshots` (agent-level) and `server_health_snapshots` (system-level).

### `marketplace.ts` — Marketplace DB Access

Low-level read/delete for `marketplace_listings` and `marketplace_reviews`. The higher-level `MarketplaceService` handles business logic; this module provides direct DB queries.

### `model-exams.ts` — Model Exam Tracking

Stores model exam run metadata and per-question results for the agent examination system. Tables: `model_exam_runs`, `model_exam_results`.

### `flock.ts` — Flock Directory

Agent registration records for the Flock Directory smart contract. Tables: `flock_agents`, `flock_directory_config`, `flock_test_results`, `flock_test_challenge_results`.

## Tokens

| Env Var | Default | Description |
|---------|---------|-------------|
| `GITHUB_ALLOWLIST_OPEN_MODE` | `"false"` | When `"true"` and allowlist is empty, all GitHub users are allowed |

## Assets

| Resource | Description |
|----------|-------------|
| `github_allowlist` table | GitHub username allowlist with optional labels |
| `agent_conversation_allowlist` / `blocklist` / `rate_limits` | Conversation access control tables |
| `health_snapshots` + `server_health_snapshots` | Health trend data |
| `marketplace_listings` + `marketplace_reviews` | Marketplace data |
| `model_exam_runs` + `model_exam_results` | Examination data |
| `flock_agents` + `flock_directory_config` + `flock_test_results` | Flock directory data |
