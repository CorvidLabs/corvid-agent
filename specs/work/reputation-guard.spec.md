---
module: reputation-guard
version: 2
status: active
files:
  - server/work/reputation-guard.ts
depends_on:
  - specs/reputation/scorer.spec.md
---

# Reputation Guard

## Purpose

Trust-level gating for work task creation. Prevents agents that don't meet a required trust threshold from being assigned work tasks. Part of the v1.0 mainnet roadmap for on-chain accountability and multi-agent coordination (issues #1458.5, #1459).

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `MIN_TRUST_FOR_WORK_TASK` | `TrustLevel` | Default minimum trust level when no per-task override is given (currently `'low'`) |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `checkReputationForWorkTask` | `(scorer: ReputationScorer \| null \| undefined, agentId: string, context?: string, minTrustLevel?: TrustLevel)` | `ReputationGuardResult` | Checks whether an agent's reputation meets the required threshold; gracefully allows if scorer unavailable |
| `meetsMinTrustLevel` | `(actual: TrustLevel, required: TrustLevel)` | `boolean` | Returns true if `actual` is at least as trusted as `required` |

### Exported Types

| Type | Description |
|------|-------------|
| `ReputationGuardResult` | Result of a guard check: `blocked` (boolean), optional `reason` (string), optional `trustLevel` (TrustLevel) |

## Trust Level Ordering

From least to most trusted:

```
blacklisted → untrusted → low → medium → high → verified
```

`blacklisted` is a special revocation state treated as below `untrusted`.

## Invariants

1. Agents with trust level below `minTrustLevel` are blocked.
2. The default `minTrustLevel` is `MIN_TRUST_FOR_WORK_TASK` (`'low'`), which blocks only `'blacklisted'` and `'untrusted'` agents.
3. Callers may raise the bar per-task by passing a higher `minTrustLevel` (`'medium'`, `'high'`, `'verified'`).
4. If no scorer is provided (null/undefined), the check is skipped and the task is allowed.
5. If scoring throws an error, the task is allowed (non-fatal failure).
6. `checkReputationForWorkTask` never throws — it returns a result object.
7. `meetsMinTrustLevel` uses a fixed ordered list — any trust level not in the list is treated as position -1 (never meets any threshold).

## Behavioral Examples

### Scenario: Blacklisted agent blocked (default threshold)

- **Given** an agent with trust level `'blacklisted'`
- **When** `checkReputationForWorkTask(scorer, agentId)` is called with no `minTrustLevel`
- **Then** it returns `{ blocked: true, reason: '...', trustLevel: 'blacklisted' }` and logs a warning

### Scenario: Low-trust agent allowed (default threshold)

- **Given** an agent with trust level `'low'`
- **When** `checkReputationForWorkTask(scorer, agentId)` is called with no `minTrustLevel`
- **Then** it returns `{ blocked: false, trustLevel: 'low' }`

### Scenario: Medium threshold — low-trust agent blocked

- **Given** an agent with trust level `'low'`
- **When** `checkReputationForWorkTask(scorer, agentId, ctx, 'medium')` is called
- **Then** it returns `{ blocked: true, reason: '...', trustLevel: 'low' }`

### Scenario: Medium threshold — medium-trust agent allowed

- **Given** an agent with trust level `'medium'`
- **When** `checkReputationForWorkTask(scorer, agentId, ctx, 'medium')` is called
- **Then** it returns `{ blocked: false, trustLevel: 'medium' }`

### Scenario: No scorer available

- **Given** scorer is `null`
- **When** `checkReputationForWorkTask(null, agentId)` is called
- **Then** it returns `{ blocked: false }`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Scorer is null/undefined | Task allowed, no trust level returned |
| `computeScore` throws | Task allowed, warning logged |
| `minTrustLevel` not provided | Defaults to `MIN_TRUST_FOR_WORK_TASK` |

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
| `work/service` | `checkReputationForWorkTask` called before work task creation, with optional per-task threshold from `CreateWorkTaskInput.minTrustLevel` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-05 | corvid-agent | Initial spec for issues #1458.5, #1459 |
| 2026-04-21 | corvid-agent | v2: add per-task `minTrustLevel` override and `meetsMinTrustLevel` helper (issue #1459) |
