# Mixed-Provider Buddy/Council Smoke & Failure-Injection Test Plan

> **Reference:** [#1496](https://github.com/CorvidLabs/corvid-agent/issues/1496) — Provider parity plan
> **Scope:** Buddy mode and Council mode with mixed Ollama + Cursor providers
> **Goal:** Define repeatable test scenarios, pass/fail gates, and regression cadence

---

## Test Matrix

### Provider Configurations Under Test

| Config ID | Lead Agent | Buddy/Council Agent | Notes |
|---|---|---|---|
| `ollama-only` | Ollama (qwen3:14b) | Ollama (llama3.1:8b) | Full local stack |
| `cursor-only` | Cursor (auto) | Cursor (composer-2-fast) | Full cursor stack |
| `ollama+anthropic` | Ollama (qwen3:14b) | Anthropic (claude-haiku) | Heterogeneous — Ollama leads |
| `cursor+anthropic` | Cursor (auto) | Anthropic (claude-haiku) | Heterogeneous — Cursor leads |
| `ollama+cursor` | Ollama (qwen3:14b) | Cursor (auto) | Fully non-Claude |
| `cursor+ollama` | Cursor (auto) | Ollama (qwen3:14b) | Fully non-Claude, reversed |
| `degraded-ollama` | Ollama (offline) | Anthropic (claude-haiku) | Failure injection |
| `degraded-cursor` | Cursor (binary missing) | Anthropic (claude-sonnet) | Failure injection |
| `all-fail` | Ollama (offline) | Cursor (binary missing) | Full blackout |

---

## Part 1: Buddy Mode Smoke Tests

### 1.1 Happy Path — Single Provider

**File:** `server/__tests__/buddy-mixed-provider.test.ts` (existing, extend)

```
[ollama-only] buddy: Ollama lead completes work turn
[ollama-only] buddy: Ollama buddy completes review turn
[ollama-only] buddy: approval detection on Ollama output
[ollama-only] buddy: rejection detection on Ollama output with caveats
[cursor-only] buddy: Cursor lead completes work turn
[cursor-only] buddy: Cursor buddy completes review turn
[cursor-only] buddy: approval detection on Cursor output
```

**Pass criteria:**
- `result.usedProvider` matches expected provider
- `result.content.length > 0`
- `isApproval()` returns correct value for all approval/rejection scenarios
- No cross-provider calls (provider isolation assertions)

### 1.2 Happy Path — Mixed Providers

```
[ollama+anthropic] buddy: Ollama lead → Anthropic buddy review handoff
[cursor+anthropic] buddy: Cursor lead → Anthropic buddy review handoff
[ollama+cursor] buddy: Ollama lead → Cursor buddy review handoff
[cursor+ollama] buddy: Cursor lead → Ollama buddy review handoff
```

**Pass criteria:**
- Each agent uses its assigned provider (no cross-contamination)
- Approval detection works on output from any provider
- Synthesis does not collapse when providers differ

### 1.3 Failure Injection — Provider Goes Offline

```
[degraded-ollama] buddy: FallbackManager routes to next when Ollama ECONNREFUSED
[degraded-ollama] buddy: approval detection works on fallback provider output
[degraded-cursor] buddy: SDK fallback when cursor binary missing
[degraded-cursor] buddy: cursor-only models cleared on binary-missing fallback
[all-fail] buddy: ExternalServiceError thrown when all providers fail
```

**Pass criteria:**
- Fallback completes within the same request (no re-throw to user)
- `result.usedProvider` is the fallback provider, not the failed one
- `ExternalServiceError` message includes all individual failure reasons
- Health tracking: Ollama marked unhealthy after 3 ECONNREFUSED failures

---

## Part 2: Council Mode Smoke Tests

### 2.1 Happy Path — Single Provider

**File:** `server/__tests__/council-mixed-provider.test.ts` (extend or create)

```
[ollama-only] council: all participants complete discussion rounds
[cursor-only] council: all participants complete discussion rounds
[ollama-only] council: synthesis step receives all participant outputs
[cursor-only] council: synthesis step receives all participant outputs
```

**Pass criteria:**
- All N participants produce non-empty responses
- Council progresses through `responding → discussing → reviewing → synthesizing` phases
- No participant blocks the council due to provider timeout

### 2.2 Mixed-Provider Council

```
[ollama+cursor+anthropic] council: 3-provider council completes all phases
[ollama+anthropic] council: heterogeneous council — Ollama + Anthropic participants
[cursor+anthropic] council: heterogeneous council — Cursor + Anthropic participants
```

**Pass criteria:**
- All phases complete
- Each participant's output attributed to correct provider in session events
- Synthesis coherent regardless of provider mix

### 2.3 Failure Injection — Participant Goes Offline

```
[degraded-ollama] council: council completes when one Ollama participant fails
[degraded-cursor] council: council completes when one Cursor participant fails
[degraded-ollama] council: failed participant excluded from synthesis
[all-fail] council: council fails gracefully when all non-Claude participants fail
```

**Pass criteria:**
- Council does NOT hang when one participant fails (timeout ≤ 60s)
- Failed participant's slot handled gracefully (skipped or error surfaced)
- At least 1 participant response → synthesis proceeds
- 0 participants → council errors with clear message (not silent hang)

---

## Part 3: Error Classification Tests

### 3.1 Ollama Error Scenarios

```
[ollama] provider: ECONNREFUSED → transient=true, marked unhealthy after 3 failures
[ollama] provider: HTTP 429 (rate limit) → transient=true
[ollama] provider: HTTP 503 (overloaded) → transient=true
[ollama] provider: HTTP 404 (model not found) → transient=false, no retry
[ollama] provider: HTTP 400 (bad request) → transient=false, no retry
[ollama] provider: stream idle >2min → session timeout event emitted
[ollama] provider: cooldown expires → provider available again
[ollama] provider: exponential backoff doubles each failure beyond 3
```

### 3.2 Cursor Error Scenarios

```
[cursor] provider: binary missing → cursor_binary_missing reason, fallback=true
[cursor] provider: exit code 1 → error surfaced via onExit callback
[cursor] provider: exit code non-zero with stderr → stderr captured in error message
[cursor] provider: no output within 30s → timeout fired
[cursor] provider: stream terminates mid-response → error surfaced (not silent)
[cursor] provider: model not in cursor-agent list → error on startup, not mid-session
```

---

## Part 4: Acceptance Thresholds

### Per-Provider Smoke Suite (Run Weekly)

| Test Group | Pass Threshold | Block-Merge Threshold |
|---|---|---|
| Single-provider happy path | 100% | < 100% |
| Mixed-provider happy path | ≥ 95% | < 90% |
| Failure injection — correct fallback | 100% | < 100% |
| Failure injection — error propagation | 100% | < 100% |
| Approval detection accuracy | 100% | Any miss |
| Council phase completion | ≥ 90% | < 80% |

### Response Quality (Spot Checks, Not Automated)

| Check | Threshold | Frequency |
|---|---|---|
| Ollama output coherence (manual review) | Acceptable for task type | Monthly |
| Cursor output coherence (manual review) | Acceptable for task type | Monthly |
| Cross-provider synthesis quality | No provider-specific artifacts | Per mixed-provider PR |

---

## Part 5: Regression Cadence

### Triggers

| Trigger | Tests to Run |
|---|---|
| PR touching `server/providers/` | `provider-routing`, `provider-fallback`, `provider-registry`, `model-router` |
| PR touching `server/process/cursor-process.ts` | `routes-cursor`, `buddy-mixed-provider` (cursor scenarios) |
| PR touching `server/providers/ollama/` | `ollama-*.test.ts`, `buddy-mixed-provider` (ollama scenarios) |
| PR touching `server/buddy/` | Full `buddy-mixed-provider.test.ts` |
| PR touching `server/council/` | Full `council-mixed-provider.test.ts` |
| Weekly scheduled CI run | Full mixed-provider suite (all configs) |
| Monthly | Full suite + manual quality spot checks |
| Post-incident | Failure injection suite for affected provider |

### Blocking Gates

A PR is **blocked from merge** if:
1. Any provider smoke test fails (100% required for happy path)
2. Any failure injection test produces wrong fallback behavior
3. Approval detection regression (any false positive or false negative)
4. New provider code added without corresponding parity checklist update

### Non-Blocking (Warn Only)

- Mixed-provider council completion rate drops below 95% (warn, track trend)
- Ollama/Cursor response latency increases >50% from baseline (warn, investigate)

---

## Implementation Notes

### Test Helpers to Use

All tests should use `server/__tests__/helpers/provider-matrix.ts`:
- `createProviderAgent(type, model, behavior)` — mock provider factory
- `createMockRegistry(agents)` — mock registry
- `mockProviderResponse(content, model)` — success behavior
- `mockProviderFailure(error)` — failure behavior
- `assertProviderUsed(agent)` — verify provider was called
- `assertProviderNotUsed(agent)` — verify provider isolation

### Naming Convention

```
[<config-id>] <mode>: <scenario description>
```

Examples:
- `[ollama-only] buddy: approval detection on Ollama output`
- `[degraded-cursor] council: council completes when one Cursor participant fails`
- `[all-fail] buddy: ExternalServiceError thrown when all providers fail`

### File Locations

| Suite | File |
|---|---|
| Buddy smoke + failure injection | `server/__tests__/buddy-mixed-provider.test.ts` |
| Council smoke + failure injection | `server/__tests__/council-mixed-provider.test.ts` |
| Provider routing unit tests | `server/__tests__/provider-routing.test.ts` |
| Ollama-specific tests | `server/__tests__/ollama-*.test.ts` |
| Cursor route tests | `server/__tests__/routes-cursor.test.ts` |
| Error classification | `server/__tests__/provider-fallback.test.ts` |
