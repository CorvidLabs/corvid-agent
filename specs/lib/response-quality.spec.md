---
module: response-quality
version: 2
status: draft
files:
  - server/lib/response-quality.ts
db_tables: []
depends_on: []
---

# Response Quality

## Purpose

Detects "cheerleading" responses — model outputs that sound productive but contain zero actionable content. Provides heuristic scoring for both text responses and tool calls, tracking consecutive low-quality outputs to trigger corrective nudges that steer the model back to substantive work.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `scoreResponseQuality` | `text: string, hasToolCalls: boolean` | `ResponseQualityScore` | Scores text response quality from 0.0 (pure cheerleading) to 1.0 (highly substantive) based on positive/negative signal heuristics. |
| `countVacuousToolCalls` | `toolCalls: ToolCallQualityInput[]` | `number` | Counts semantically empty tool calls (e.g. trivial save_memory, status-only workflow updates). |
| `buildQualityNudge` | _(none)_ | `string` | Returns a corrective nudge message to inject when consecutive low-quality responses are detected. |
| `buildLoopNudge` | `toolName: string` | `string` | Returns a corrective nudge message for repetitive tool call loops, naming the repeated tool. |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ResponseQualityTracker` | Stateful tracker for consecutive low-quality responses within a session. Records scores, vacuous tool calls, nudge counts, and nudge-exhaustion state. |
| `RepetitiveToolCallDetector` | Detects when a model repeatedly calls the same tool with identical arguments N times, indicating a stuck loop. Tracks a sliding window of fingerprinted calls. |

### Exported Types

| Type | Description |
|------|-------------|
| `ResponseQualityScore` | Score (0–1) with array of contributing `QualitySignal` values. |
| `QualitySignal` | Union of signal identifiers (e.g. `cheerleading_phrases`, `has_code_blocks`, `vacuous_workflow_update`). |
| `ToolCallQualityInput` | Tool call shape with `name` and `arguments` for quality analysis. |
| `ResponseQualityMetrics` | Aggregate metrics: `totalLowQualityResponses`, `totalVacuousToolCalls`, `qualityNudgeCount`, `nudgesExhausted`. |

## Invariants

1. Score is always clamped to [0.0, 1.0].
2. Empty text with tool calls scores 1.0 (model is acting, not chatting).
3. Empty text without tool calls scores 0.0.
4. `ResponseQualityTracker` resets consecutive count on any above-threshold response.
5. Nudge trigger requires `CONSECUTIVE_LOW_QUALITY_TRIGGER` (default 2) consecutive low-quality responses.
6. `RepetitiveToolCallDetector` uses stable fingerprints (sorted JSON args) for deterministic comparison.
7. Loop detection requires `threshold` (default 3) consecutive identical tool calls within the sliding window.
8. `nudgesExhausted` is only set when `markNudgesExhausted()` is explicitly called after nudge cap is reached.

## Signals

### Negative (decrease score)
- `cheerleading_phrases` — matches known filler phrases ("great idea", "let's do this", etc.)
- `high_exclamation_ratio` — excessive exclamation marks relative to sentence count
- `no_code_blocks` — no inline or fenced code blocks
- `no_file_references` — no file paths or extensions
- `no_concrete_references` — no function/class/type names or line numbers
- `restatement` — restates the user's request instead of acting

### Positive (increase score)
- `has_tool_calls` — response includes tool invocations
- `has_code_blocks` — contains code blocks
- `has_file_references` — references specific files
- `has_concrete_references` — mentions specific identifiers
- `has_action_items` — contains numbered/checkboxed lists

## Behavioral Examples

1. **Pure cheerleading** — "Great idea! I'm excited to help! Let's dive in and make it happen!" → score ~0.0, signals: `cheerleading_phrases`, `high_exclamation_ratio`, `no_code_blocks`, `no_file_references`, `no_concrete_references`.
2. **Substantive response** — "The bug is in `server/lib/crypto.ts` line 42 — `getEncryptionPassphrase` doesn't handle the testnet fallback. Here's the fix: ..." → score ~0.9+, signals: `has_code_blocks`, `has_file_references`, `has_concrete_references`.
3. **Tool-only response** — empty text with tool calls → score 1.0, signal: `has_tool_calls`.
4. **Vacuous save_memory** — `corvid_save_memory({ key: "x", content: "ok" })` → flagged as vacuous (content < 10 chars).
5. **Consecutive low quality** — two text responses both scoring < 0.35 → tracker triggers nudge injection on the second.
6. **Repetitive tool loop** — `read_file({ path: "a.ts" })` called 3 times in a row → detector returns true, nudge injected naming the tool.
7. **Nudge exhaustion** — all quality nudges used without improvement → `nudgesExhausted` set, session terminated with `stall_quality_exhausted`.

## Error Cases

1. **Null/undefined text** — treated as empty string; scores 0.0 without tool calls or 1.0 with.
2. **Malformed tool arguments** — non-object arguments are safely coerced via `String()` without throwing.
3. **Nudge cap exceeded** — after `MAX_QUALITY_NUDGES` nudges, no more are injected regardless of quality scores.

## Dependencies

None. This module is self-contained with no external dependencies.

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-03-18 | Initial spec — scoring, vacuous detection, tracker, nudge builder. |
| 2 | 2026-03-25 | Add RepetitiveToolCallDetector, buildLoopNudge, nudge-exhaustion tracking. |
