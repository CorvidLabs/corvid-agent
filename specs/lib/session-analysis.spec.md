---
module: session-analysis
version: 1
status: draft
files:
  - server/lib/session-analysis.ts
db_tables: []
depends_on:
  - specs/process/claude-process.spec.md
---

# Session Analysis

## Purpose

Heuristic detection of "cheerleading" responses — agent turns that acknowledge or encourage without making substantive progress. Analyzes Claude stream events from a single response turn to determine whether the agent is doing real work (tool calls, code, structured content) or merely producing forward-commitment and enthusiasm filler.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isCheerleadingResponse` | `events: ClaudeStreamEvent[]` | `boolean` | Returns `true` if the turn contains no tool calls, is short, lacks substantive markers, and matches forward-commitment or enthusiasm patterns. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `CHEERLEADING_WARNING_THRESHOLD` | `number` | Number of consecutive cheerleading turns (2) that should trigger an owner warning. |

## Invariants

1. Any turn containing a `tool_use` event (via `content_block_start` or embedded in `assistant` content) is never flagged as cheerleading.
2. Empty text (no assistant event found) is never flagged as cheerleading.
3. Text longer than 200 characters (`MAX_CHEERLEADING_LENGTH`) is never flagged as cheerleading.
4. Text containing substantive markers (code fences, numbered lists, bullet lists, markdown headings) is never flagged as cheerleading.
5. Forward-commitment patterns (e.g. "I'll look into", "Let me investigate", "On it") trigger cheerleading detection as the primary signal.
6. Enthusiasm patterns (e.g. "Great idea!", "Absolutely", "Happy to help") trigger cheerleading detection only when text is shorter than 80 characters.

## Behavioral Examples

1. **Forward-commitment without action** — Assistant event with text "I'll look into that right away!" and no tool_use events → `isCheerleadingResponse` returns `true`.
2. **Tool use present** — Events include a `content_block_start` with `type: 'tool_use'` and text "Let me check that" → returns `false` (tool calls indicate real work).
3. **Substantive short response** — Text "Here's the fix:\n```ts\nreturn null;\n```" under 200 chars → returns `false` (code fence is a substantive marker).
4. **Long enthusiasm** — Text over 200 characters containing "Great idea!" plus detailed explanation → returns `false` (exceeds length threshold).
5. **Short enthusiasm** — Text "Absolutely!" (11 chars, under 80) with no tool calls → returns `true`.
6. **Short enthusiasm, not short enough** — Text with enthusiasm pattern at 90 characters → returns `false` (enthusiasm-only detection requires < 80 chars).
7. **No assistant event** — Events contain only `content_block_delta` entries with no `assistant` event → returns `false` (empty extracted text).

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Empty events array | Returns `false` (no tool use, no text) |
| Events with no assistant event and no tool_use | Returns `false` |
| Malformed event objects | Safely skipped; no throw |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `process/types` | `ClaudeStreamEvent`, `ContentBlock`, `AssistantEvent`, `ContentBlockStartEvent`, `extractContentText` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `process/session-cheerleading-detector` | `isCheerleadingResponse`, `CHEERLEADING_WARNING_THRESHOLD` |

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-03-18 | Initial spec — cheerleading detection heuristics and threshold constant. |
