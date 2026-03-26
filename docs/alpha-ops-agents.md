# Alpha Ops Agents: Design & Implementation Plan

## Overview

This document describes the infrastructure needed to register five specialized Alpha Ops agents — **Rook**, **Jackdaw**, **Pica**, **Condor**, and **Kite** — as independent, schedule-capable entities within corvid-agent.

**Goal:** Split the ~34 scheduled tasks currently all running as CorvidAgent across five domain-specialized agents, enabling per-agent audit trails, budget tracking, independent wallets, and Flock Directory presence.

---

## Research Findings

### 1. Current State: All Schedules Run as CorvidAgent

Every `agent_schedule` row has an `agent_id` FK pointing to CorvidAgent's ID. The scheduler (`server/scheduler/service.ts`) looks up `schedule.agentId` to determine execution context, wallet, and notification sender. With 34 schedules all pointing to one agent:

- There is no differentiation in logs or metrics between schedule types
- All wallet spend is attributed to one agent
- The global `MAX_CONCURRENT_EXECUTIONS = 2` limit is shared across all 34 schedules
- A bug in one action type can degrade all unrelated schedule domains

### 2. Schema Already Supports Multi-Agent Scheduling

`agent_schedules.agent_id` is already a FK to the `agents` table. `schedule_executions.agent_id` tracks which agent ran each execution. **No schema migration is required** — the data model already supports per-agent schedule ownership.

### 3. Agent Registration Flow

Creating a schedule-capable agent requires three steps:

1. **DB record** — `createAgent(db, input)` (server/db/agents.ts)
2. **Wallet** — `walletService.ensureWallet(agentId)` creates and funds an Algorand wallet (localnet/testnet auto-creates; production requires pre-funded mnemonic)
3. **Flock Directory** — `flockService.selfRegister(...)` publishes the agent to the on-chain directory for discovery

This is the same flow used by conversational agent presets (`server/conversational/seed.ts`).

### 4. Schedule Routing to Specific Agents

Schedule action handlers (e.g., `execWorkTask` in `server/scheduler/handlers/work-task.ts`) all read `schedule.agentId` to determine which agent performs the work. Reassigning `agent_id` on a schedule row is sufficient to re-route all future executions to a new agent.

There is no separate dispatch mechanism needed — the scheduler already dispatches based on `schedule.agentId`.

### 5. Authentication & Credential Requirements per Agent

| Requirement | How Satisfied |
|---|---|
| DB record | `createAgent()` — done on seed |
| Algorand wallet | `ensureWallet()` — auto-funded on localnet/testnet; production needs `WALLET_ENCRYPTION_KEY` env var |
| AlgoChat encryption key | Published on-chain by `ensureWallet()` |
| Flock Directory registration | `selfRegister()` — called on seed after wallet is ready |
| API key / auth token | Not per-agent — shared server-level credentials apply |
| Credit balance | Deducted from `tenant_id`-scoped credits — no per-agent billing setup needed |

Production networks require `WALLET_ENCRYPTION_KEY` to encrypt each agent's mnemonic. No additional per-agent secrets are needed.

### 6. Scheduler Concurrency Constraint

`MAX_CONCURRENT_EXECUTIONS = 2` is a global cap in `SchedulerService`. With 5 agents each owning schedules, contention is likely. Two options (Phase 3):

- **Option A**: Raise the cap (e.g., to 10) — simple, works today
- **Option B**: Make the cap per-agent (requires changes to `SchedulerService`) — more principled, prevents one agent from monopolizing slots

---

## Agent Domains

| Agent | Owned Action Types | Model | Rationale |
|---|---|---|---|
| **Rook** | `star_repo`, `fork_repo`, `review_prs`, `github_suggest` | Haiku | Lightweight GitHub engagement; high frequency, low complexity |
| **Jackdaw** | `memory_maintenance`, `outcome_analysis`, `daily_review` | Haiku | Memory & learning; reads and writes internal state, no external APIs |
| **Pica** | `send_message`, `discord_post`, `status_checkin` | Haiku | Communication; short-lived, message-only, no code changes |
| **Condor** | `work_task`, `codebase_review`, `dependency_audit`, `improvement_loop` | Sonnet | Heavy engineering; complex reasoning, long-running, high-value output |
| **Kite** | `reputation_attestation`, `marketplace_billing`, `flock_testing`, `council_launch`, `custom` | Haiku | Platform integrity; governance and system-level tasks |

---

## Implementation Plan

### Phase 1 — MVP: Agent Registration (this PR)

**What's implemented here:**

- `server/alpha-ops/presets.ts` — Defines all five agents with their `ownedActionTypes`, capabilities, and system prompts
- `server/alpha-ops/seed.ts` — Idempotent seeding function (mirrors `conversational/seed.ts`); creates DB record, wallet, and Flock Directory entry
- `server/alpha-ops/index.ts` — Module re-exports
- `server/algochat/init.ts` — Calls `seedAlphaOpsAgents()` on startup (fire-and-forget, non-blocking)

**Result:** On next server start, all five Alpha Ops agents are created with unique IDs, wallets, and Flock Directory listings.

### Phase 2 — Schedule Reassignment

**Goal:** Migrate existing schedules from CorvidAgent to their canonical Alpha Ops owner.

**Approach:** A one-time migration script (or a DB migration) that:

1. Calls `getAlphaOpsAgentMap(db)` to get the `presetKey → agentId` map (from `server/alpha-ops/seed.ts`)
2. For each schedule row, reads `action.type` from the `actions` JSON
3. Looks up the owning `presetKey` from `ACTION_TYPE_TO_AGENT` (exported from `presets.ts`)
4. Updates `agent_schedules.agent_id` to the Alpha Ops agent's ID

```sql
-- Example (pseudocode — actual migration reads action type from JSON):
UPDATE agent_schedules
SET agent_id = '<rook-agent-id>'
WHERE json_extract(actions, '$[0].type') IN ('star_repo', 'fork_repo', 'review_prs', 'github_suggest');
```

**Risk mitigation:** Run against a DB backup first. Mixed-type schedules (multiple action types from different domains) should default to CorvidAgent or be split into separate schedules.

**Estimated effort:** 1–2 days (script + review + dry-run on staging)

### Phase 3 — Scheduler Concurrency (Per-Agent Limits)

**Goal:** Prevent one high-volume agent (e.g., Condor with heavy `work_task` schedules) from blocking others.

**Approach:**

- Add `maxConcurrentPerAgent?: number` to `SchedulerService` constructor options
- Track `runningExecutions` as a `Map<agentId, Set<executionId>>` instead of a flat `Set`
- Check per-agent limit before dispatching each schedule

**Estimated effort:** 1 day

### Phase 4 — Full Rollout

- Migrate all new schedule creation to use the correct Alpha Ops agent ID (API/UI changes)
- Add per-agent dashboard metrics (schedules owned, executions, failure rate)
- Tune `ownedActionTypes` and models based on observed performance
- Consider Sonnet → Haiku downgrade for Condor's simpler tasks after proving quality

---

## File Map

```
server/alpha-ops/
  presets.ts     — Agent definitions + ownedActionTypes + ACTION_TYPE_TO_AGENT map
  seed.ts        — Idempotent seeding (create agent, wallet, Flock Directory)
  index.ts       — Module re-exports

server/algochat/
  init.ts        — Calls seedAlphaOpsAgents() on startup (modified)
```

---

## FAQ

**Q: Why not use environment variables to configure each agent's ID?**
A: Agent IDs are UUIDs generated at first-seed time and stable thereafter (via `presetKey` match). Env vars would require manual coordination across environments; the presetKey pattern is self-healing.

**Q: Do Alpha Ops agents need their own Discord threads or AlgoChat conversations?**
A: Not immediately. Their `algochatEnabled = true` flag means they can receive and send AlgoChat messages if needed, but they don't require interactive conversational mode. `algochatAuto = false` means they won't respond automatically to inbound messages.

**Q: What happens if an Alpha Ops agent is deleted?**
A: Schedules FK-cascade on `DELETE` (`ON DELETE CASCADE` in the schema). Deleting an agent would delete its schedules. To safely remove an agent, first reassign its schedules to another agent or CorvidAgent.

**Q: Can CorvidAgent still run schedules after this change?**
A: Yes — Phase 1 only adds new agents; no existing schedules are modified. Schedule reassignment is a separate Phase 2 migration. CorvidAgent continues running all 34 schedules until Phase 2 is applied.
