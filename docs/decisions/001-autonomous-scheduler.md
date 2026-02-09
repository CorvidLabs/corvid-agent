# ADR-001: Autonomous Agent Scheduler & Automation System

**Date:** 2026-02-08
**Status:** Approved
**Council Session:** 3 rounds, 5 participants (Architect, Backend Engineer, Frontend Engineer, Security Lead, DevOps Engineer)

---

## Executive Summary

The council approved building a **SQLite-backed, prompt-driven autonomous scheduler** that transforms CorvidAgent from a reactive system into a proactive development team. Three rounds of debate resolved every major architectural friction point.

---

## Architecture Overview

```
+--------------------------------------------------------------+
|                     SCHEDULER SERVICE                         |
|                    (60s polling loop)                          |
|                                                               |
|  +------------+   +---------------+   +--------------------+  |
|  | Cron Engine|-->| Due Schedule  |-->| Prompt Builder     |  |
|  | (croner)   |   | Scanner       |   | (per action_type)  |  |
|  +------------+   +---------------+   +--------+-----------+  |
|                                                |              |
|  +---------------------------------------------+------------+ |
|  |              Action Dispatch                 |            | |
|  |  +--------+ +--------+ +----------+ +-------v---------+  | |
|  |  | Star   | | Fork   | | Review   | | Work on Repo    |  | |
|  |  | Repos  | | Repos  | | PRs      | |(WorkTaskService) |  | |
|  |  +--------+ +--------+ +----------+ +-----------------+  | |
|  |  |Suggest | |Council | | Custom   |                      | |
|  |  |Improve | | Review | |(owner    |                      | |
|  |  |ments   | |        | |  only)   |                      | |
|  |  +--------+ +--------+ +----------+                      | |
|  +-----------------------------------------------------------+ |
|                                                               |
|  +-----------------------------------------------------------+ |
|  |              Permission Gate                              | |
|  |  Agent runs analysis --> Proposes action --> Gate check    | |
|  |                                                |          | |
|  |                              +-----------------+--------+ | |
|  |                              | auto            | owner  | | |
|  |                              | -> execute      | -> hold| | |
|  |                              |   immediately   | -> wait| | |
|  |                              +-----------------+--------+ | |
|  +-----------------------------------------------------------+ |
|                                                               |
|  Safety Rails:                                                |
|  - MAX_CONCURRENT = 2 (env configurable)                      |
|  - Auto-pause after 5 consecutive failures + owner notify     |
|  - Min 5-minute cron interval enforced at validation          |
|  - Per-run + daily budget caps                                |
|  - schedulerMode tool restriction on spawned sessions         |
|  - 30s graceful drain on SIGTERM                              |
|  - Stale run recovery on startup (interrupted != failed)      |
+--------------------------------------------------------------+
```

---

## Key Architectural Decisions

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| **Table count** | 2 tables (`schedules` + `schedule_runs`) | Simpler schema, `watched_repos` deferred to Phase 3+. |
| **Cron parser** | `croner` (3KB, zero deps) | Rolling your own cron parser is a bug factory. |
| **Tick interval** | 60 seconds | Min cron is 5 min. 60s tick = worst case 60s late. |
| **Concurrency limit** | 2 default, `SCHEDULER_MAX_CONCURRENT` env var | Can always raise. Can't un-spend API credits. |
| **Approval timeout** | 8 hours default, per-schedule configurable | 4h too aggressive for timezones; 24h blocks pipelines. |
| **Missed-run catch-up** | No catch-up. Compute `next_run_at` from now on restart. | Thundering herd prevention. |
| **Execution model** | Prompt-driven, not code-driven | New action types = new prompt templates, not new executor code. |
| **External job queue** | No. SQLite + `setInterval` is sufficient. | Dozens of plans, not millions. |
| **`custom` action type** | Owner-only creation | Freeform prompt = injection surface. |
| **Agent self-scheduling** | Allowed, but `requires_approval` forced to `true` for writes | Prevents privilege self-escalation. |
| **Budget enforcement** | Post-hoc circuit breaker + session timeout per action type | Can't introspect subprocess cost mid-run. |
| **Graceful shutdown** | 30s drain, then mark remaining runs as `interrupted` | `interrupted != failed` -- doesn't trigger auto-pause. |
| **Schema: `council_id`** | Added as nullable column alongside `agent_id` | Original question asks about "agents or the council." |
| **Schema: `config_snapshot`** | Added on `schedule_runs` | Editing a schedule mid-flight shouldn't corrupt in-progress runs. |
| **Tool restriction** | `schedulerMode` blocks `corvid_send_message`, `corvid_grant_credits`, `corvid_credit_config` | Principle of least privilege. |

---

## Final Schema (Migration 24)

```sql
-- Scheduled automation definitions (templates)
CREATE TABLE schedules (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    description          TEXT DEFAULT '',
    action_type          TEXT NOT NULL,        -- star_repos|fork_repos|review_prs|
                                               -- work_on_repo|suggest_improvements|
                                               -- council_review|custom
    cron_expression      TEXT NOT NULL,        -- Standard 5-field cron OR aliases (@daily, @every_6h)
    agent_id             TEXT DEFAULT NULL,    -- Which agent executes (NULL if council-owned)
    council_id           TEXT DEFAULT NULL,    -- Which council owns this (NULL if agent-owned)
    project_id           TEXT DEFAULT NULL,    -- Project context for execution
    action_config        TEXT DEFAULT '{}',    -- JSON: action-specific parameters
    source               TEXT DEFAULT 'owner', -- 'owner' | 'agent' (who created it)
    requires_approval    INTEGER DEFAULT 1,    -- 1 = queue write actions for owner sign-off
    max_runs             INTEGER DEFAULT NULL, -- NULL = unlimited
    max_budget_usd       REAL DEFAULT 1.0,     -- Per-run budget cap (post-hoc circuit breaker)
    daily_budget_usd     REAL DEFAULT 5.0,     -- Daily aggregate cap
    approval_timeout_h   INTEGER DEFAULT 8,    -- Hours before auto-deny
    -- Cached daily counters (recomputed on startup from schedule_runs)
    daily_runs           INTEGER DEFAULT 0,
    daily_cost_usd       REAL DEFAULT 0,
    daily_reset_date     TEXT DEFAULT NULL,     -- If != today, reset counters
    -- State
    status               TEXT DEFAULT 'active', -- active|paused|error
    consecutive_failures INTEGER DEFAULT 0,     -- Auto-pause at 5
    last_run_at          TEXT DEFAULT NULL,
    next_run_at          TEXT DEFAULT NULL,      -- Pre-computed for fast scanning
    total_runs           INTEGER DEFAULT 0,
    created_at           TEXT DEFAULT (datetime('now')),
    updated_at           TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_schedules_next_run ON schedules(next_run_at) WHERE status = 'active';
CREATE INDEX idx_schedules_agent ON schedules(agent_id);
CREATE INDEX idx_schedules_council ON schedules(council_id);

-- Execution history (one row per schedule firing)
CREATE TABLE schedule_runs (
    id                   TEXT PRIMARY KEY,
    schedule_id          TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    config_snapshot      TEXT NOT NULL,         -- Copy of action_config at run creation time
    status               TEXT DEFAULT 'pending', -- pending|running|awaiting_approval|
                                                 -- completed|failed|interrupted|skipped|denied
    session_id           TEXT DEFAULT NULL,      -- Linked agent session
    work_task_id         TEXT DEFAULT NULL,      -- Linked work task (if action = work_on_repo)
    cost_usd             REAL DEFAULT 0,
    output               TEXT DEFAULT NULL,      -- JSON: actions taken, results summary
    error                TEXT DEFAULT NULL,
    -- Approval state (embedded, not separate table)
    pending_approvals    TEXT DEFAULT NULL,      -- JSON: [{id, actionType, targetRepo, description,
                                                 --         status, diffHash, expiresAt}]
    approval_decided_by  TEXT DEFAULT NULL,      -- Owner wallet address or 'web'
    approval_decided_at  TEXT DEFAULT NULL,
    -- Timestamps
    started_at           TEXT DEFAULT (datetime('now')),
    completed_at         TEXT DEFAULT NULL
);

CREATE INDEX idx_schedule_runs_schedule ON schedule_runs(schedule_id);
CREATE INDEX idx_schedule_runs_status ON schedule_runs(status);
```

---

## Seven Action Types

| Action Type | Description | Default Approval | Session Timeout |
|-------------|-------------|-------------------|-----------------|
| `star_repos` | Discover + star repos by topic/criteria | `auto` | 10 min |
| `fork_repos` | Fork repos for analysis/contribution | `auto` | 10 min |
| `review_prs` | Review open PRs, post review comments | `auto` (read-only) | 30 min |
| `work_on_repo` | Create improvement PRs on core repos | Configurable | 60 min |
| `suggest_improvements` | Analyze forked repos, propose upstream contributions | `owner_approve` | 30 min |
| `council_review` | Launch council deliberation on a topic | `auto` (advisory) | 60 min |
| `custom` | Freeform prompt -- **owner-only creation** | Configurable | 30 min |

---

## Security Model

### Tool Restrictions for Scheduler Sessions

| Tool | Available? | Rationale |
|------|-----------|-----------|
| `gh` CLI (via Bash) | Yes | Core functionality |
| `corvid_save_memory` | Yes | On-chain audit trail |
| `corvid_create_work_task` | Yes | For `work_on_repo` action |
| `corvid_recall_memory` | Yes | Context retrieval |
| `corvid_send_message` | No | No messaging arbitrary agents from automated runs |
| `corvid_grant_credits` | **No (Hardcoded)** | Financial exploit vector |
| `corvid_credit_config` | **No (Hardcoded)** | No automated credit system modification |

### Agent Self-Scheduling Constraints

| Rule | Enforcement |
|------|-------------|
| Agents cannot create `custom` schedules | MCP tool handler rejects |
| Agent-created schedules force `requires_approval = true` for writes | MCP tool handler overrides |
| Agents cannot set `requires_approval = false` on their schedules | Only owner can relax via REST API/UI |
| Agents can only create schedules for themselves | MCP handler enforces `agent_id = calling_agent_id` |
| Max 10 schedules per agent | Validated at creation |
| Min 5-minute cron interval | Validated at creation |

### Rate Limits

| Limit | Value | Scope |
|-------|-------|-------|
| Schedules per agent | 10 | Per agent |
| Concurrent executions | 2 (default) | Global |
| Runs per day | 50 | Per agent |
| GitHub operations per hour | 20 | Per agent |
| Session timeout | Per action type (10-60 min) | Per run |

---

## REST API

```
GET    /api/schedules                    -- List all (filter by ?status, ?agentId)
POST   /api/schedules                    -- Create new schedule
GET    /api/schedules/:id                -- Get schedule details + recent runs
PUT    /api/schedules/:id                -- Update config, approval settings
DELETE /api/schedules/:id                -- Delete (must be paused first)
POST   /api/schedules/:id/pause          -- Pause schedule
POST   /api/schedules/:id/resume         -- Resume paused schedule
POST   /api/schedules/:id/trigger        -- Manually trigger now (for testing)
GET    /api/schedules/:id/runs           -- List run history
GET    /api/schedule-runs/:runId         -- Get run details
POST   /api/schedule-runs/:runId/approve -- Approve/deny: { action: "approve" | "deny" }

POST   /api/scheduler/pause              -- Emergency: pause ALL schedules
POST   /api/scheduler/resume             -- Resume all paused schedules
```

---

## MCP Tool

```typescript
corvid_manage_schedule({
  action: "create",
  name: "Weekly PR Review",
  actionType: "review_prs",
  cronExpression: "0 9 * * 1",
  actionConfig: { repos: ["corvidlabs/corvid-agent"], reviewDepth: "thorough" },
  requiresApproval: false
})
```

---

## Environment Configuration

```bash
SCHEDULER_ENABLED=true
SCHEDULER_POLL_INTERVAL_MS=60000
SCHEDULER_MAX_CONCURRENT=2
SCHEDULER_MAX_SCHEDULES_PER_AGENT=10
SCHEDULER_MIN_INTERVAL_MINUTES=5
SCHEDULER_FAILURE_THRESHOLD=5
SCHEDULER_DEFAULT_APPROVAL_TIMEOUT_H=8
SCHEDULER_DRAIN_TIMEOUT_MS=30000
SCHEDULER_MAX_SESSION_TIMEOUT_MS=3600000
```

---

## Implementation Phases

| Phase | Deliverables | Timeline |
|-------|-------------|----------|
| **1** | Migration 24 (schema), SchedulerService, croner, custom+star_repos prompts, REST CRUD, Zod validation, schedulerMode tool restriction, MCP tool, config_snapshot, WebSocket events, wiring | **Week 1** |
| **1.5** | Read-only Angular UI: schedule list + run history | **End of Week 1** |
| **2** | review_prs + work_on_repo actions, full approval workflow, AlgoChat integration, approval queue UI, diff-hash approval binding | **Week 2** |
| **3** | fork_repos + suggest_improvements actions, watched_repos table, duplicate detection | **Week 3** |
| **4** | council_review action, schedule builder wizard UI, cron picker, per-action tool allowlists | **Week 4** |
| **5** | Budget dashboard, GitHub rate limiter, webhook triggers, on-chain audit | **Future** |

---

## What We Explicitly Will NOT Do

| Temptation | Why Not |
|-----------|---------|
| External cron / Redis / Bull | Splits state. SQLite + setInterval sufficient at our scale. |
| Catch-up on missed runs | Thundering herd on restart. |
| Complex job DAGs/dependencies | We're building a scheduler, not Temporal. |
| Auto-merge PRs | Ever. PRs always require human merge. |
| Auto-submit PRs to external repos without approval | Default approval = true for external repos. Non-negotiable. |
| Hand-rolled cron parser | croner (3KB, zero deps) handles all edge cases. |
| Encrypted action_config at rest | If someone has filesystem access, column encryption isn't the boundary. |

---

## Council Attribution

| Contribution | Source |
|-------------|--------|
| Plans/Jobs template-instance pattern, prompt-driven execution, config_snapshot, council_id, dual-status analysis | **Architect** |
| croner recommendation, discriminated union types, stale run detection, injectable clock, daily counter reset | **Backend Engineer** |
| Approval queue UX priority, signal-based state, cron picker design, Phase 1.5 UI push, WebSocket event shape | **Frontend Engineer** |
| Rate limits, schedulerMode restriction, prompt injection mitigation, agent constraints, custom owner-only, grant_credits hardcoded exclusion | **Security Lead** |
| No catch-up policy, 2-concurrent default, graceful shutdown, startup recovery, health endpoint, auto-pause + notification, env config | **DevOps Engineer** |
