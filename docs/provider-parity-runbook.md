# Provider Parity Runbook: Pre-Release Validation

> **Purpose:** Step-by-step guide for running the Ollama + Cursor provider quality check before any corvid-agent release.
> **When to run:** Before every release cut, after any PR touching `server/providers/` or `server/process/cursor-process.ts`.
> **Reference issue:** [#1500](https://github.com/CorvidLabs/corvid-agent/issues/1500)
> **Scorecard:** [provider-quality-scorecard.md](provider-quality-scorecard.md)
> **Parity checklist:** [provider-parity-checklist.md](provider-parity-checklist.md)

---

## Prerequisites

- Bun ≥ 1.3.0 installed
- Ollama running locally with at least one model pulled (`ollama list` shows results)
- `OLLAMA_LOCAL_EXPERIMENTAL=true` set in `.env`
- Cursor binary available (or explicitly absent for missing-binary test scenarios)

---

## Step 1 — Run the Full Test Suite

Run all tests and confirm zero failures:

```bash
bun test
```

**Expected output:** `X tests passed, 0 failed`

If any test fails, stop. Do not proceed to manual steps until all tests are green.

---

## Step 2 — Run Provider-Specific Test Files

Run each provider-related test file individually to get per-file pass rates:

```bash
# Provider infrastructure
bun test server/__tests__/providers.test.ts
bun test server/__tests__/provider-registry.test.ts
bun test server/__tests__/model-router.test.ts
bun test server/__tests__/provider-fallback.test.ts
bun test server/__tests__/provider-routing.test.ts

# Ollama-specific
bun test server/__tests__/ollama-complexity-warning.test.ts
bun test server/__tests__/ollama-stall-escalator.test.ts
bun test server/__tests__/routes-ollama.test.ts

# Cursor-specific
bun test server/__tests__/cursor-exit-codes.test.ts
bun test server/__tests__/providers-cursor.test.ts
bun test server/__tests__/routes-cursor.test.ts

# Multi-agent collaboration
bun test server/__tests__/buddy-mixed-provider.test.ts
bun test server/__tests__/council-mixed-provider.test.ts
```

Record pass/fail counts in Section 1 of the [scorecard](provider-quality-scorecard.md).

---

## Step 3 — Verify Ollama Standalone Quality

Run these scenarios manually against a live Ollama instance:

### 3a. Single-turn completion

Start a session with `provider=ollama`, send a simple coding task ("list files in current directory"), confirm:
- Non-empty, coherent response
- `provider_selected` event shows `ollama`
- No cross-provider fallback triggered

### 3b. Tool call execution

Start a session with `provider=ollama`, invoke a single MCP tool (e.g., `corvid_list_work_tasks`), confirm:
- Tool call extracted correctly from model output
- Tool result returned to model
- Model produces coherent final response

### 3c. Stream stall escalation

With Ollama intentionally slowed (or `OLLAMA_IDLE_TIMEOUT=5000` set), start a session and let it stall. Confirm:
- Timeout event fires within the configured window
- Session terminates with a clear error, not a silent hang

### 3d. Fallback chain recovery

With Ollama temporarily stopped (`ollama stop` or by stopping the service):
- Start a session routed to Ollama
- Confirm `FallbackManager` marks it unhealthy after 3 ECONNREFUSED errors
- Confirm the session falls back to the next provider in the chain
- Confirm Ollama marks healthy again after cooldown expires

Record results in Section 2 (Ollama) of the scorecard.

---

## Step 4 — Verify Cursor Standalone Quality

### 4a. Single-turn completion

Start a session with `provider=cursor`, send a simple coding task. Confirm:
- Non-empty response
- `resolveProviderRouting()` selected cursor
- No fallback triggered

### 4b. Binary-missing fallback

Temporarily rename or remove the cursor binary (e.g., `mv /path/to/cursor /path/to/cursor.bak`):
- Start a session that would route to Cursor
- Confirm `cursor_binary_missing` reason is logged
- Confirm session falls back to SDK (Anthropic) seamlessly
- Confirm cursor-only models are cleared from the session
- Restore the binary

### 4c. Exit code error surfacing

Send a deliberately invalid request to a Cursor session (causing a non-zero exit):
- Confirm the exit code is captured in the error message
- Confirm the error is surfaced to the session event bus (not silently swallowed)

Record results in Section 2 (Cursor) of the scorecard.

---

## Step 5 — Verify Buddy/Council Collaboration

### 5a. Buddy mode

Run `bun test server/__tests__/buddy-mixed-provider.test.ts` in verbose mode:

```bash
bun test server/__tests__/buddy-mixed-provider.test.ts --reporter verbose 2>&1 | tail -40
```

Verify:
- All scenario groups pass (ollama-only, cursor-only, mixed, failure injection)
- Approval detection has zero false positives/negatives

### 5b. Council mode

Run `bun test server/__tests__/council-mixed-provider.test.ts` in verbose mode:

```bash
bun test server/__tests__/council-mixed-provider.test.ts --reporter verbose 2>&1 | tail -40
```

Verify:
- All council phases complete for all provider configurations
- Council does not hang when one participant fails
- Failure-injection scenarios surface errors within the timeout window

Record results in Section 3 of the scorecard.

---

## Step 6 — Response Quality Spot Check (Monthly Only)

> Skip this step unless it has been ≥ 30 days since the last quality spot check.

For each provider (Ollama, Cursor):
1. Run 5 diverse tasks spanning tool calls, code generation, and analysis
2. Review output for coherence, format compliance, and absence of provider-specific artifacts
3. Compare completion latency (p50) against last recorded baseline in the scorecard

Record results in Section 4 of the scorecard.

---

## Step 7 — Update Gap Tracker

1. Open [provider-parity-checklist.md](provider-parity-checklist.md)
2. Count open action items per provider (unchecked `[ ]` entries)
3. Record the count in Section 5 of the scorecard
4. If the gap count increased since last release, file a regression report before proceeding

---

## Step 8 — Complete and Sign the Scorecard

1. Fill in all blank cells in the [scorecard](provider-quality-scorecard.md)
2. Mark overall decision: **GO** or **NO-GO**
3. File a [regression report](provider-regression-template.md) for each blocking failure
4. If GO: proceed with release
5. If NO-GO: tag the blocking issue owner and wait for resolution

---

## Escalation

| Situation | Action |
|-----------|--------|
| Ollama test failures | File regression report → assign to Condor |
| Cursor test failures | File regression report → assign to Jackdaw |
| Council test failures | File regression report → assign to Rook |
| All providers failing | Escalate to CorvidAgent (lead) |
| Release blocked > 24h | Notify Leif |

---

## Related Docs

- [Provider Parity Checklist](provider-parity-checklist.md) — detailed gap tracking
- [Mixed-Provider Test Plan](mixed-provider-test-plan.md) — full scenario matrix
- [Provider Regression Template](provider-regression-template.md) — file regressions
- [Provider Quality Scorecard](provider-quality-scorecard.md) — go/no-go gate
