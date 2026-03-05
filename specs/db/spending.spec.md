---
module: spending
version: 1
status: draft
files:
  - server/db/spending.ts
db_tables:
  - daily_spending
  - agent_spending_caps
  - agent_daily_spending
depends_on: []
---

# Spending

## Purpose
Tracks global and per-agent daily spending (ALGO and API costs), enforces configurable spending limits via RateLimitError, and provides CRUD for per-agent spending caps with fallback to environment-configured defaults.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `recordAlgoSpend` | `db: Database, microAlgos: number` | `void` | Records ALGO spending to the global daily_spending table. Uses a transaction to atomically ensure the row exists and update it. |
| `recordApiCost` | `db: Database, usd: number` | `void` | Records API cost in USD to the global daily_spending table. Uses a transaction for atomicity. |
| `getDailyTotals` | `db: Database` | `DailyTotals` | Returns today's global spending totals (date, algoMicro, apiCostUsd). Ensures the row exists before reading. |
| `checkAlgoLimit` | `db: Database, additionalMicro: number` | `void` | Checks if adding `additionalMicro` to today's total would exceed the global daily ALGO limit. Throws `RateLimitError` if exceeded. Runs inside a transaction for consistency. |
| `getSpendingLimits` | (none) | `{ algoMicro: number }` | Returns the global daily ALGO limit in microalgos (from env or default 10,000,000). |
| `recordAgentAlgoSpend` | `db: Database, agentId: string, microAlgos: number` | `void` | Records ALGO spending for both the global daily_spending table and the per-agent agent_daily_spending table atomically in a single transaction. |
| `checkAgentAlgoLimit` | `db: Database, agentId: string, additionalMicro: number` | `void` | Checks both global and per-agent ALGO limits. Throws `RateLimitError` if either would be exceeded. Per-agent limit comes from agent_spending_caps or falls back to DEFAULT_AGENT_DAILY_CAP_MICRO. An agent cap of 0 means unlimited. |
| `getAgentSpendingCap` | `db: Database, agentId: string` | `AgentSpendingCap \| null` | Retrieves the spending cap configuration for a specific agent. Returns null if no custom cap is set. |
| `setAgentSpendingCap` | `db: Database, agentId: string, dailyLimitMicroalgos: number, dailyLimitUsdc?: number` | `AgentSpendingCap` | Sets or updates the spending cap for an agent using INSERT ... ON CONFLICT DO UPDATE. Default dailyLimitUsdc is 0. Logs the change. |
| `removeAgentSpendingCap` | `db: Database, agentId: string` | `boolean` | Removes a per-agent spending cap. Agent falls back to global default. Returns true if a row was deleted. |
| `listAgentSpendingCaps` | `db: Database` | `AgentSpendingCap[]` | Lists all configured agent spending caps, ordered by agent_id. |
| `getAgentDailySpending` | `db: Database, agentId: string` | `AgentDailySpending` | Returns today's per-agent spending totals (agentId, date, algoMicro, usdcMicro). Ensures the row exists before reading. |
| `getDefaultAgentDailyCap` | (none) | `{ microalgos: number }` | Returns the default per-agent daily cap in microalgos (from env or default 5,000,000). |

### Exported Types
| Type | Description |
|------|-------------|
| `AgentSpendingCap` | Per-agent spending cap record: `agentId`, `dailyLimitMicroalgos`, `dailyLimitUsdc`, `createdAt`, `updatedAt` |
| `AgentDailySpending` | Per-agent daily spending totals: `agentId`, `date`, `algoMicro`, `usdcMicro` |

## Internal Types (not exported)

| Type | Description |
|------|-------------|
| `DailyTotals` | Global daily spending: `date`, `algoMicro`, `apiCostUsd` |

## Constants (from environment)

| Constant | Default | Env Variable | Description |
|----------|---------|-------------|-------------|
| `DAILY_ALGO_LIMIT_MICRO` | 10,000,000 (10 ALGO) | `DAILY_ALGO_LIMIT_MICRO` | Global daily ALGO spending limit in microalgos |
| `DEFAULT_AGENT_DAILY_CAP_MICRO` | 5,000,000 (5 ALGO) | `DEFAULT_AGENT_DAILY_CAP_MICRO` | Default per-agent daily cap when no custom cap is configured |

## Invariants
1. All spending mutations use `db.transaction()` for atomicity, preventing TOCTOU races between limit checks and updates.
2. `ensureRow` and `ensureAgentRow` use `INSERT OR IGNORE` to safely initialize rows without overwriting existing data.
3. The `today()` helper derives the date key as `YYYY-MM-DD` from `new Date().toISOString().slice(0, 10)`.
4. `recordAgentAlgoSpend` always updates both `daily_spending` (global) and `agent_daily_spending` (per-agent) atomically in one transaction.
5. `checkAgentAlgoLimit` checks the global limit first, then the per-agent limit. Both checks are inside a single transaction.
6. A per-agent cap of 0 microalgos means unlimited (no per-agent limit check).
7. When no custom cap exists for an agent, `DEFAULT_AGENT_DAILY_CAP_MICRO` is used.
8. `setAgentSpendingCap` uses upsert (INSERT ... ON CONFLICT DO UPDATE) making it idempotent.
9. Spending amounts are tracked in microalgos (INTEGER) for ALGO and as REAL for USD API costs, avoiding floating-point precision issues for on-chain values.
10. `getDailyTotals` always calls `ensureRow` first, guaranteeing a non-null return.

## Behavioral Examples
### Scenario: Record and check ALGO spending within limit
- **Given** today's global spending is 2,000,000 microalgos and the limit is 10,000,000
- **When** `checkAlgoLimit(db, 1000000)` is called
- **Then** no error is thrown (projected 3,000,000 < 10,000,000)

### Scenario: Exceed global ALGO limit
- **Given** today's global spending is 9,500,000 microalgos and the limit is 10,000,000
- **When** `checkAlgoLimit(db, 1000000)` is called
- **Then** `RateLimitError` is thrown with message "Daily ALGO spending limit reached: 9.500000/10.000000 ALGO"

### Scenario: Per-agent limit enforcement
- **Given** agent "agent-1" has a custom cap of 2,000,000 microalgos and has spent 1,800,000 today
- **When** `checkAgentAlgoLimit(db, "agent-1", 500000)` is called
- **Then** `RateLimitError` is thrown with the agent-specific limit message

### Scenario: Agent with unlimited cap
- **Given** agent "agent-2" has a custom cap with dailyLimitMicroalgos = 0
- **When** `checkAgentAlgoLimit(db, "agent-2", 50000000)` is called
- **Then** only the global limit is checked; the per-agent check is skipped

### Scenario: Set and retrieve agent spending cap
- **Given** no spending cap exists for agent "agent-1"
- **When** `setAgentSpendingCap(db, "agent-1", 3000000, 0)` is called
- **Then** a new row is inserted into agent_spending_caps and the AgentSpendingCap is returned

### Scenario: Atomic global + per-agent recording
- **Given** agent "agent-1" sends a 100,000 microalgo transaction
- **When** `recordAgentAlgoSpend(db, "agent-1", 100000)` is called
- **Then** both daily_spending.algo_micro and agent_daily_spending.algo_micro for agent-1 are incremented by 100,000 in a single transaction

## Error Cases
| Condition | Behavior |
|-----------|----------|
| Global ALGO limit would be exceeded | `checkAlgoLimit` and `checkAgentAlgoLimit` throw `RateLimitError` |
| Per-agent ALGO limit would be exceeded | `checkAgentAlgoLimit` throws `RateLimitError` |
| Agent has no custom cap | Falls back to `DEFAULT_AGENT_DAILY_CAP_MICRO` (5 ALGO) |
| Agent cap is 0 | Per-agent check is skipped (unlimited) |
| No spending cap found for agent | `getAgentSpendingCap` returns `null` |
| Remove cap for agent without one | `removeAgentSpendingCap` returns `false` |
| Database connection error | Throws native bun:sqlite error |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `server/lib/logger` | `createLogger('SpendingTracker')` for info/warn logging |
| `server/lib/errors` | `RateLimitError` thrown when spending limits are exceeded |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/routes/spending.ts` (likely) | API endpoints for viewing spending, managing caps |
| `server/algochat/` (likely) | `checkAlgoLimit` / `checkAgentAlgoLimit` before on-chain transactions |
| `server/process/` (likely) | `recordApiCost` after API calls; `recordAgentAlgoSpend` after agent transactions |
| Schedule execution (likely) | Cost tracking via `recordAgentAlgoSpend` |

## Database Tables
### daily_spending
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `date` | TEXT | PRIMARY KEY | Date key in YYYY-MM-DD format |
| `algo_micro` | INTEGER | DEFAULT 0 | Total ALGO spent today in microalgos |
| `api_cost_usd` | REAL | DEFAULT 0.0 | Total API costs today in USD |

### agent_spending_caps
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `agent_id` | TEXT | PRIMARY KEY, FK agents(id) ON DELETE CASCADE | The agent this cap applies to |
| `daily_limit_microalgos` | INTEGER | NOT NULL, DEFAULT 5000000 | Daily ALGO spending limit in microalgos |
| `daily_limit_usdc` | INTEGER | NOT NULL, DEFAULT 0 | Daily USDC spending limit (reserved for future use) |
| `created_at` | TEXT | DEFAULT (datetime('now')) | Row creation timestamp |
| `updated_at` | TEXT | DEFAULT (datetime('now')) | Last update timestamp |

### agent_daily_spending
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `agent_id` | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | The agent this record tracks |
| `date` | TEXT | NOT NULL | Date key in YYYY-MM-DD format |
| `algo_micro` | INTEGER | NOT NULL, DEFAULT 0 | ALGO spent today in microalgos |
| `usdc_micro` | INTEGER | NOT NULL, DEFAULT 0 | USDC spent today in micro-units |

**Primary Key:** `(agent_id, date)`
**Indexes:** `idx_agent_daily_spending_date(date)`

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
