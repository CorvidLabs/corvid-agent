---
module: intern-guard
version: 1
status: active
files:
  - server/work/intern-guard.ts
depends_on:
  - specs/providers/provider-system.spec.md
---

# Intern Model PR Guard

## Purpose

Prevents intern-tier models (local Ollama and other low-capability models) from performing git push or PR creation. These models lack the reliability required for autonomous code publication. Introduced after issue #1536 where an intern model pushed broken code directly, bypassing the review gate.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isInternTierModel` | `(model: string)` | `boolean` | Returns true if the model is classified as intern-tier based on explicit designation, provider metadata, or name heuristics |
| `checkInternPrGuard` | `(model: string, context?: string)` | `InternGuardResult` | Checks whether git push or PR creation should be blocked for the given model; logs a warning when blocked |

### Exported Types

| Type | Description |
|------|-------------|
| `InternGuardResult` | Result of a guard check: `blocked` (boolean) and optional `reason` (string) |

## Invariants

1. A model explicitly named `'intern'` is always classified as intern-tier.
2. Ollama models where `isCloud !== true` in the cost table are intern-tier.
3. Unknown models matching Ollama naming patterns (e.g. `ollama/`, `:latest`, colon-separated without known cloud provider names) are intern-tier.
4. An empty or falsy model string returns `false` from `isInternTierModel`.
5. `checkInternPrGuard` never throws — it returns a result object.

## Behavioral Examples

### Scenario: Ollama local model blocked

- **Given** a model `qwen3:14b` registered as Ollama local in the cost table
- **When** `checkInternPrGuard('qwen3:14b')` is called
- **Then** it returns `{ blocked: true, reason: '...' }` and logs a warning

### Scenario: Claude model allowed

- **Given** a model `claude-sonnet-4-6` in the cost table with provider `anthropic`
- **When** `checkInternPrGuard('claude-sonnet-4-6')` is called
- **Then** it returns `{ blocked: false }`

### Scenario: Unknown model with Ollama pattern

- **Given** a model `ollama/mistral` not in the cost table
- **When** `isInternTierModel('ollama/mistral')` is called
- **Then** it returns `true`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Empty model string | `isInternTierModel` returns `false`; `checkInternPrGuard` returns `{ blocked: false }` |
| Model not in cost table and no pattern match | Treated as non-intern (allowed) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `providers/cost-table` | `getModelPricing` for model metadata lookup |
| `lib/logger` | `createLogger` for structured warning logs |

### Consumed By

| Module | What is used |
|--------|-------------|
| `work/service` | `checkInternPrGuard` called before git push and PR creation |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | corvid-agent | Initial spec for issue #1542 |
