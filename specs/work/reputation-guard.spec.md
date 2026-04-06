---
module: reputation-guard
version: 1
status: active
files:
  - server/work/reputation-guard.ts
depends_on:
  - specs/reputation/scorer.spec.md
---

# Reputation Guard

## Purpose

Trust-level gating for work task creation. Prevents blacklisted or untrusted agents from creating work tasks. Part of the v1.0 mainnet roadmap for on-chain accountability and multi-agent coordination (issues #1458.5, #1459).

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `MIN_TRUST_FOR_WORK_TASK` | `TrustLevel` | Minimum trust level required to create a work task (currently `'low'`) |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `checkReputationForWorkTask` | `(scorer: ReputationScorer \| null \| undefined, agentId: string, context?: string)` | `ReputationGuardResult` | Checks whether an agent's reputation permits work task creation; gracefully allows if scorer unavailable |

### Exported Types

| Type | Description |
|------|-------------|
| `ReputationGuardResult` | Result of a guard check: `blocked` (boolean), optional `reason` (string), optional `trustLevel` (TrustLevel) |

## Invariants

1. Agents with trust level `'blacklisted'` or `'untrusted'` are always blocked.
2. Agents with trust level `'low'` or above are always allowed.
3. If no scorer is provided (null/undefined), the check is skipped and the task is allowed.
4. If scoring throws an error, the task is allowed (non-fatal failure).
5. `checkReputationForWorkTask` never throws — it returns a result object.

## Behavioral Examples

### Scenario: Blacklisted agent blocked

- **Given** an agent with trust level `'blacklisted'`
- **When** `checkReputationForWorkTask(scorer, agentId)` is called
- **Then** it returns `{ blocked: true, reason: '...', trustLevel: 'blacklisted' }` and logs a warning

### Scenario: Low-trust agent allowed

- **Given** an agent with trust level `'low'`
- **When** `checkReputationForWorkTask(scorer, agentId)` is called
- **Then** it returns `{ blocked: false, trustLevel: 'low' }`

### Scenario: No scorer available

- **Given** scorer is `null`
- **When** `checkReputationForWorkTask(null, agentId)` is called
- **Then** it returns `{ blocked: false }`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Scorer is null/undefined | Task allowed, no trust level returned |
| `computeScore` throws | Task allowed, warning logged |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `reputation/scorer` | `ReputationScorer` for computing agent trust scores |
| `reputation/types` | `TrustLevel` type |
| `lib/logger` | `createLogger` for structured log messages |

### Consumed By

| Module | What is used |
|--------|-------------|
| `work/service` | `checkReputationForWorkTask` called before work task creation |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-05 | corvid-agent | Initial spec for issues #1458.5, #1459 |
