# Provider Quality Scorecard

> **Purpose:** Single-page go/no-go gate for Ollama and Cursor providers before each release.
> Run this checklist as part of the [pre-release runbook](provider-parity-runbook.md).
> Reference issue: [#1500](https://github.com/CorvidLabs/corvid-agent/issues/1500)

---

## How to Use

1. Run the provider test suite (see [runbook](provider-parity-runbook.md) for commands).
2. Fill in the **Actual** column for each metric.
3. Score each row: ✅ Pass / ⚠️ Warn / ❌ Block.
4. If any row is **Block**, the release is held until fixed.
5. File a [regression report](provider-regression-template.md) for every Block or Warn.

---

## Section 1 — Automated Test Suite (Blocking)

These tests run as part of `bun test`. Every row must pass before release.

| Test File | Metric | Threshold | Actual | Status |
|-----------|--------|-----------|--------|--------|
| `providers.test.ts` | All unit tests pass | 100% | — | — |
| `provider-registry.test.ts` | Registry register/get/filter | 100% | — | — |
| `model-router.test.ts` | Routing correctness | 100% | — | — |
| `provider-fallback.test.ts` | Fallback chain execution | 100% | — | — |
| `provider-routing.test.ts` | Provider routing logic | 100% | — | — |
| `ollama-complexity-warning.test.ts` | Complexity warning fires | 100% | — | — |
| `ollama-stall-escalator.test.ts` | Stream stall escalation | 100% | — | — |
| `cursor-exit-codes.test.ts` | Exit code classification | 100% | — | — |
| `providers-cursor.test.ts` | Cursor health tracking | 100% | — | — |
| `routes-ollama.test.ts` | Ollama route handlers | 100% | — | — |
| `routes-cursor.test.ts` | Cursor route handlers | 100% | — | — |

---

## Section 2 — Standalone Quality (Blocking)

Run manually or via the scheduled smoke suite.

### Ollama Standalone

| Scenario | Pass Threshold | Block Threshold | Actual | Status |
|----------|---------------|-----------------|--------|--------|
| Single-turn completion success | ≥ 95% | < 90% | — | — |
| Tool call format correctness | ≥ 90% | < 80% | — | — |
| Fallback chain recovery | ≥ 95% | < 90% | — | — |
| Stream stall timeout fires | 100% (deterministic) | Any miss | — | — |
| ECONNREFUSED → unhealthy after 3 | 100% (deterministic) | Any miss | — | — |
| Cooldown → provider recovers | 100% (deterministic) | Any miss | — | — |

### Cursor Standalone

| Scenario | Pass Threshold | Block Threshold | Actual | Status |
|----------|---------------|-----------------|--------|--------|
| Single-turn completion success | ≥ 95% | < 90% | — | — |
| Tool call format correctness | ≥ 90% | < 80% | — | — |
| Binary-missing fallback to SDK | 100% (deterministic) | Any miss | — | — |
| Exit code → error surfaced (not silent) | 100% (deterministic) | Any miss | — | — |

---

## Section 3 — Buddy/Council Collaboration (Blocking)

| Test File | Scenario | Pass Threshold | Actual | Status |
|-----------|----------|---------------|--------|--------|
| `buddy-mixed-provider.test.ts` | All buddy scenarios | 100% | — | — |
| `council-mixed-provider.test.ts` | All council scenarios | 100% | — | — |
| Approval detection (any provider) | No false pos/neg | 100% | — | — |
| Failure injection — provider goes offline | Fallback ≤ 1 lost turn | 100% | — | — |
| Council completes with 1 participant offline | Council does not hang | 100% | — | — |

---

## Section 4 — Response Quality (Warn Only, Monthly)

Spot-checked manually. Warn-only: does not block release, but regression must be reported.

| Check | Threshold | Last Checked | Status |
|-------|-----------|--------------|--------|
| Ollama output coherence (manual review) | Acceptable for task type | — | — |
| Cursor output coherence (manual review) | Acceptable for task type | — | — |
| Cross-provider synthesis quality | No provider-specific artifacts | — | — |
| Ollama p50 latency vs last release | < +50% | — | — |
| Cursor p50 latency vs last release | < +50% | — | — |

---

## Section 5 — Parity Gap Tracker

Running count of known gaps from the [parity checklist](provider-parity-checklist.md). Gaps should not increase between releases.

| Provider | Open Gaps (last release) | Open Gaps (this release) | Delta | Status |
|----------|--------------------------|--------------------------|-------|--------|
| Ollama | 3 | — | — | — |
| Cursor | 8 | — | — | — |

> ⚠️ If delta > 0 (gaps increased), a regression report is required.

---

## Scorecard Summary

| Section | Blocking? | Result |
|---------|-----------|--------|
| 1 — Automated tests | Yes | — |
| 2 — Standalone quality | Yes | — |
| 3 — Buddy/Council collaboration | Yes | — |
| 4 — Response quality | No (warn) | — |
| 5 — Gap tracker | No (warn) | — |

**Overall decision:**

- [ ] ✅ **GO** — All blocking sections pass
- [ ] ❌ **NO-GO** — One or more blocking sections failed (file regression reports for each)

**Completed by:** ___  
**Date:** ___  
**Release version:** ___
