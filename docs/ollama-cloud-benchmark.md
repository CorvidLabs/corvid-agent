# Ollama Cloud Model AlgoChat Reliability Benchmark

**Date:** 2026-03-30
**Analysis type:** Configuration-based pre-run assessment + live results template
**Live benchmark script:** `scripts/benchmark-ollama-cloud.ts`
**Models evaluated:** 6 (5 Ollama cloud, 1 OpenRouter)
**Scenarios:** 4 AlgoChat workflows

---

## Executive Summary

| Model | Role | Tier | Tool Mode | Thinking | Context | Readiness |
|-------|------|------|-----------|----------|---------|-----------|
| Qwen 3.5 397B | Starling (current) | 1 | Text-based | Yes | 64K | **Ready** |
| Kimi K2.5 | Merlin (current) | 2 | Text-based | Yes | 128K | **Ready** |
| DeepSeek V3.2 671B | Alternative | 1 | Text-based | Yes | 64K | **Ready** (Condor upgrade) |
| Nemotron 3 Super | Condor (current) | 2 | Text-based | No | 128K | Conditional |
| Llama 3.3 70B | Alternative | 3 | Native API | No | 128K | Not recommended (cloud) |
| Command-R+ | Alternative | 2 | Native API | No | 4K out | Not recommended |

**Recommendation summary:**
- **Starling** → Keep Qwen 3.5. Tier 1 frontier model, proven tool calling via text extraction, thinking mode available for complex tasks.
- **Merlin** → Keep Kimi K2.5. 128K context supports AlgoChat thread depth, thinking mode enabled, solid tier 2.
- **Condor** → Upgrade from Nemotron Super to **DeepSeek V3.2**. Tier 1 vs Tier 2, thinking mode, same cloud infrastructure. Better suited for heavy-lift analysis work.

---

## Methodology

### Test Scenarios

Four AlgoChat-specific scenarios test the most common patterns junior agents encounter:

| ID | Scenario | Tools Required | Tests |
|----|----------|----------------|-------|
| S1 | AlgoChat message handling | `corvid_send_message` | Parse sender, compose reply, correct JSON args |
| S2 | Single tool call — memory recall | `corvid_recall_memory` | Key-based lookup, result reporting |
| S3 | Multi-tool sequence | `corvid_recall_memory` → `corvid_send_message` | Ordered execution, intermediate state use |
| S4 | Task management query | `corvid_list_work_tasks` | Status filter, concise reporting |

### Evaluation Criteria

1. **Tool call format correctness** — valid JSON args, correct tool name, required params present
2. **First-attempt success rate** — completed without timeout or error on first try
3. **Response quality** — first person, on-topic, concise (not bloated)
4. **Multi-step completion rate** — S3 specifically tests whether both tools fire in order

### Tool Parsing Architecture

All Ollama cloud models in this benchmark use **text-based tool parsing** — tools are described via a system prompt injection (not the native Ollama `tools` API). The parser in `server/providers/ollama/` handles five text patterns:

- Split name+JSON (`tool_name\n{"key":"val"}`) — used by Qwen 3.5
- JSON array format (`[{"name":"tool","arguments":{}}]`) — Mistral-style
- Python tag format (`<|python_tag|>func(key="val")`) — Llama 3.1+
- Plain JSON-style (`func({...})`)
- Python kwargs (`func(key="val", key2="val2")`)

Argument normalization runs post-extraction to correct common alias mismatches (e.g. `file_path` → `path`).

**Why text-based for these models:** Nemotron, Kimi, and Qwen 3.5 all caused degraded performance or unreliable tool_call translation through the Ollama proxy when using the native tools API. Text-based extraction proved more reliable in practice.

---

## Model Configuration Analysis

### Qwen 3.5 397B (`qwen3.5:cloud`)

**Role:** Starling (current assignment)

| Property | Value |
|----------|-------|
| Capability tier | 1 (frontier) |
| Tool parsing | Text-based (qwen3.5 family) |
| Thinking mode | Enabled (CLOUD_THINKING_MODELS) |
| Context window | 64K (CLOUD_CONTEXT_OVERRIDES) |
| Max output | 32K tokens |
| AlgoChat proven | Yes — Feb 2026 test run 14/15 pass |

**Assessment:** Qwen 3.5 is the most battle-tested of the cloud models in this codebase. The Feb 2026 `test-ollama-agents.ts` run (using a Qwen family model) passed 14/15 scenarios — the single failure was a multi-step tool chain that hit an extended-thinking loop. For AlgoChat scenarios S1/S2/S4 this is not a concern since the tool count is low.

The `/no_think` suffix can be appended to prompts when thinking mode introduces latency on simple tasks.

**Verdict:** Keep as Starling's model. No changes needed.

---

### Kimi K2.5 (`kimi-k2.5:cloud`)

**Role:** Merlin (current assignment)

| Property | Value |
|----------|-------|
| Capability tier | 2 |
| Tool parsing | Text-based (kimi family) |
| Thinking mode | Enabled (CLOUD_THINKING_MODELS) |
| Context window | 128K (CLOUD_CONTEXT_OVERRIDES) |
| Max output | 16K tokens |
| AlgoChat proven | Partially — newer to the platform |

**Assessment:** Kimi K2.5 has a 128K context window — double Qwen 3.5's 64K allocation. This matters for AlgoChat because message threads can accumulate significant context. Being in CLOUD_THINKING_MODELS means it can reason through multi-step tasks without hallucinating intermediates.

The primary risk is the text-based tool parsing path for the `kimi` family — it's newer code than the `qwen3` path. Single-tool calls (S1, S2, S4) should work reliably. S3 (multi-tool sequence) is where kimi's tool chaining needs validation.

**Verdict:** Keep as Merlin's model. Run S3 live to confirm chaining behavior. If S3 failures occur consistently, consider context window override to 96K to reduce KV-cache pressure.

---

### Nemotron 3 Super (`nemotron-3-super:cloud`)

**Role:** Condor (current assignment)

| Property | Value |
|----------|-------|
| Capability tier | 2 |
| Tool parsing | Text-based (nemotron family) |
| Thinking mode | **Disabled** (not in CLOUD_THINKING_MODELS) |
| Context window | 128K |
| Max output | 16K tokens |
| AlgoChat proven | Limited — junior agent track |

**Assessment:** Nemotron Super's main limitation for Condor's heavy-lift role is the absence of thinking mode. Condor handles complex codebase analysis and council synthesis tasks — these benefit significantly from chain-of-thought reasoning. Nemotron 3 Super is a capable model for standard responses but won't reason through architectural tradeoffs as reliably as DeepSeek V3.2 or Qwen 3.5.

For pure AlgoChat S1/S2/S4 (send message, recall memory, list tasks), Nemotron should work fine. S3 multi-tool sequencing is the risk area since the nemotron text parser path has less production history.

**Verdict:** Adequate for junior AlgoChat duties but **not ideal for Condor's analysis role**. Recommend replacing with DeepSeek V3.2 for Condor (see below).

---

### DeepSeek V3.2 671B (`deepseek-v3.2:cloud`)

**Role:** Alternative candidate (recommended for Condor)

| Property | Value |
|----------|-------|
| Capability tier | 1 (frontier) |
| Tool parsing | Text-based (deepseek3.2 family) |
| Thinking mode | Enabled (CLOUD_THINKING_MODELS) |
| Context window | 64K (CLOUD_CONTEXT_OVERRIDES) |
| Max output | 16K tokens |
| AlgoChat proven | Not yet tested live |

**Assessment:** DeepSeek V3.2 is a 671B parameter frontier model — the largest in this benchmark. Tier 1 capability with thinking mode makes it well-suited for Condor's heavy analysis role. The `deepseek3.2` text parser family handles the tool call extraction.

The 64K context limit (vs Nemotron's 128K) is the main tradeoff. For Condor-style analysis tasks that involve large file reads and long reasoning chains, this could be a constraint. However, thinking mode compensates by producing higher-quality intermediate reasoning within that window.

**Verdict:** Upgrade Condor from Nemotron Super to DeepSeek V3.2. The tier 1 + thinking mode combination better matches Condor's role in Alpha Ops Council synthesis.

**Config change needed:** Add `deepseek-v3.2:cloud` to Condor's agent model assignment in the database.

---

### Llama 3.3 70B (`llama3.3`)

**Role:** Alternative candidate

| Property | Value |
|----------|-------|
| Capability tier | 3 |
| Tool parsing | **Native Ollama tools API** |
| Thinking mode | No |
| Context window | 128K |
| Max output | 8K tokens |
| Provider | Local Ollama only |

**Assessment:** Llama 3.3 uses the native Ollama tools API (`llama` family is in `TOOL_CAPABLE_FAMILIES`) — this is the structured `tool_calls` path rather than text extraction. This should produce more reliable tool call format correctness for S1/S2/S4.

However: Llama 3.3 is a local-only model (70B, not a cloud variant). Running it would consume local VRAM and compete with other local agents in the concurrency limiter. It also carries the Ollama proxy tool_calls translation issues that plague other models when used as cloud proxies.

**Verdict:** Not recommended as a cloud alternative. Llama 3.3 is better positioned as a local general-purpose model if VRAM permits, not for the cloud-based junior agent roles.

---

### Command-R+ (`cohere/command-r-plus` via OpenRouter)

**Role:** Alternative candidate

| Property | Value |
|----------|-------|
| Capability tier | 2 |
| Tool parsing | Native OpenRouter tools API |
| Thinking mode | No |
| Context window | 128K |
| **Max output** | **4K tokens** |
| Provider | OpenRouter (different infra) |

**Assessment:** Command-R+ has a critical limitation: 4K max output tokens. AlgoChat multi-step sequences can easily exceed this, especially S3 where the model needs to process memory recall output and compose a summary message. This makes it unreliable for multi-step scenarios.

Additionally, using OpenRouter introduces a different billing model and provider dependency. The cloud Ollama models are all through the same local-proxy infrastructure — Command-R+ would require separate OpenRouter credentials and incurs real token costs.

**Verdict:** Not recommended. The 4K output ceiling rules it out for any task requiring multi-step reasoning or context-heavy responses. Use a cloud Ollama model instead.

---

## Scenario Analysis by Model

### S1: AlgoChat Message Handling

Tests the most fundamental junior agent skill: receive a message and reply via `corvid_send_message`.

**All text-based tool models** must produce JSON matching this schema:
```json
{"tool": "corvid_send_message", "args": {"to": "<agent-id>", "message": "<text>", "channel": "algochat"}}
```

The extractor handles multiple output formats (see tool parsing section). Models that produce clean `tool_name\n{...}` output (Qwen style) will parse cleanly. Models that wrap in markdown code fences or produce verbose preamble may trigger false positives in the text stripper.

**Predicted reliability:**
- Qwen 3.5: High (proven Qwen family path)
- Kimi K2.5: High (kimi text parser handles this pattern)
- DeepSeek V3.2: High (deepseek3.2 family parser)
- Nemotron Super: Medium (nemotron path less exercised)

### S2: Single Tool Call — Memory Recall

Tests `corvid_recall_memory` with a specific key. Requires the model to:
1. Identify the correct tool name
2. Pass `key` as the argument (not `query`)
3. Not invent a result — report what the tool returns

Argument normalization in the provider (`normalizeToolArgs`) handles common misnamings like `memory_key` → `key`. This reduces S2 failure risk significantly.

**Predicted reliability:** High for all models that support tools at all.

### S3: Multi-Tool Sequence

The hardest scenario: recall memory, then use the result to compose a send_message.

Key failure modes:
1. Model calls only one tool and stops
2. Model calls tools out of order
3. Model fabricates the memory result instead of using the tool output
4. Model produces invalid JSON for the second tool call

Text-based tool models handle multi-step sequences by re-entering the generation loop after each tool call result is injected back into context. The reliability depends heavily on whether the model's training corpus included multi-turn tool use patterns.

**Predicted reliability:**
- Qwen 3.5: Medium-High (had T1.2 timeout in Feb 2026 with extended thinking; use /no_think)
- Kimi K2.5: Medium (needs live validation)
- DeepSeek V3.2: Medium-High (tier 1, larger reasoning capacity)
- Nemotron Super: Medium (no thinking, may short-circuit early)

### S4: Task Management Query

Tests `corvid_list_work_tasks` with `status` and `limit` parameters. Requires the model to:
1. Use the right tool name
2. Pass enum-validated `status` value (`"active"`)
3. Pass numeric `limit`
4. Report results concisely without padding

Simpler than S3 since it's single-tool. Argument normalization handles likely mismatches.

**Predicted reliability:** High for all models with working tool support.

---

## Live Benchmark Results

> **To fill in:** Run `bun scripts/benchmark-ollama-cloud.ts` with all target agents configured.
> Results will be written directly to this file's table below.

| Model | S1 | S2 | S3 | S4 | Pass Rate | Avg Time |
|-------|----|----|----|----|-----------|-----------
| Qwen 3.5 397B | — | — | — | — | —/4 | — |
| Kimi K2.5 | — | — | — | — | —/4 | — |
| Nemotron 3 Super | — | — | — | — | —/4 | — |
| DeepSeek V3.2 671B | — | — | — | — | —/4 | — |
| Llama 3.3 70B | — | — | — | — | —/4 | — |

*✓ = Pass, ✗ = Fail, ⏱ = Timeout*

---

## Recommendations

### Agent Role Assignments

**Starling** (junior, AlgoChat first-responder, messaging):
- **Keep: `qwen3.5:cloud`**
- Rationale: Tier 1, thinking mode available, proven Feb 2026 test results, text parser mature
- No config changes needed

**Merlin** (junior, backend tasks, promoted):
- **Keep: `kimi-k2.5:cloud`**
- Rationale: 128K context handles long AlgoChat threads, thinking mode for multi-step reasoning
- Monitor: Run S3 live to confirm multi-tool chaining
- Optional: If S3 fails consistently, try `deepseek-v3.2:cloud` as a swap

**Condor** (heavy-lift analysis, council synthesis):
- **Upgrade: `nemotron-3-super:cloud` → `deepseek-v3.2:cloud`**
- Rationale: Tier 1 vs Tier 2, thinking mode support, 671B parameter reasoning for deep analysis
- Context tradeoff: 64K vs 128K — acceptable for analysis tasks; thinking mode compensates
- Config change: Update Condor agent model in the database

### Config Changes

1. **Condor model update:**
   ```sql
   UPDATE agents SET model = 'deepseek-v3.2:cloud' WHERE name = 'Condor';
   ```
   Or via the dashboard: Agents → Condor → Edit → Model.

2. **Verify TEXT_BASED_TOOL_FAMILIES** in `server/providers/ollama/provider.ts` includes all active models:
   ```typescript
   private static readonly TEXT_BASED_TOOL_FAMILIES = new Set([
       'qwen3', 'qwen3.5',    // Starling
       'kimi',                 // Merlin
       'deepseek3.2',          // Condor (new)
       'nemotron',             // legacy Condor
       // ...
   ]);
   ```
   All of the above are already present — no code change needed.

3. **Context window overrides** — `deepseek-v3.2` already has a 64K override in `CLOUD_CONTEXT_OVERRIDES`. No change needed.

### Prompt Tuning Notes

- **Qwen 3.5**: Append `/no_think` to disable extended thinking for simple AlgoChat replies. Use full thinking for complex tasks.
- **Kimi K2.5**: Tends to verbose responses — add "Be concise, 2-3 sentences" to system prompt for AlgoChat replies.
- **DeepSeek V3.2**: Thinking mode is active — for council synthesis tasks this is desirable. For quick AlgoChat pings, consider suppressing thinking.
- **Nemotron Super**: No thinking mode — responses will be direct but may miss nuance on complex council tasks.

---

## References

- `server/providers/ollama/provider.ts` — `TEXT_BASED_TOOL_FAMILIES`, `CLOUD_CONTEXT_OVERRIDES`, `CLOUD_THINKING_MODELS`
- `server/providers/ollama/model-capabilities.ts` — capability detection, tool support detection
- `server/providers/cost-table.ts` — model pricing and tier classifications
- `scripts/test-ollama-agents.ts` — general Ollama agent test suite (15 scenarios)
- `scripts/ollama-test-results.md` — Feb 2026 baseline test run (14/15 pass)
- `scripts/benchmark-ollama-cloud.ts` — this benchmark's live runner script

---

*Configuration analysis by CorvidAgent — 2026-03-30*
*Live results: run `bun scripts/benchmark-ollama-cloud.ts` to populate the results table*
