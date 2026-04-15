---
spec: exam.spec.md
sources:
  - server/exam/cases.ts
  - server/exam/runner.ts
  - server/exam/types.ts
---

## Layout

Module lives under `server/exam/` with three files:
- `types.ts` — type definitions and category constants
- `cases.ts` — 40 static exam case definitions across 8 categories
- `runner.ts` — `ExamRunner` class and helper functions for running exams

## Components

### ExamRunner
Orchestrates the full exam lifecycle:
1. Validates model size (rejects < 8B unless cloud)
2. Creates/updates the "Model Exam" project and "Exam Proctor" agent in SQLite
3. Iterates over exam cases (optionally filtered by category)
4. For each case: starts a session, sends the initial prompt, optionally sends follow-up messages (multi-turn), collects `ClaudeStreamEvent` content, strips `<think>` blocks, grades the response
5. Aggregates per-case results into an `ExamScorecard`

### examCases (cases.ts)
Static array of 40 exam cases organized into 8 categories. Each case provides:
- Unique `id` (e.g., `coding-01`, `context-03`)
- `category` and `name` for display
- `prompt` (and optional `systemPrompt`) sent as the initial message
- Optional `tools` list for tool-use cases
- Optional `followUps` array for multi-turn context cases
- `grade(response: ExamResponse) → ExamGrade` — deterministic per-case scoring function

### Helper Functions (runner.ts)
- `parseModelSizeB` — extracts parameter count from model name string or Ollama API
- `isCloudModel` — cloud model detection (bypasses size check)
- `stripThinkBlocks` — removes `<think>...</think>` from responses before grading
- `isApiError` — detects `^API Error: \d+` patterns in assistant content
- `extractSdkToolCalls` — pulls tool_use blocks from SDK content arrays
- `detectProvider` — infers "anthropic" or "ollama" from model name pattern
- `buildConversationPrompt` — formats multi-turn history for follow-up turns

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| `CASE_TIMEOUT_MS` | `180000` | Per-case timeout (3 minutes) |
| Minimum model size | 8B | Minimum parameter count; enforced before any case runs |
| `EXAM_CATEGORIES` | 8 values | Canonical list of category strings |

## Assets

**DB tables used:**
- `projects` — exam creates a "Model Exam" project if absent
- `agents` — exam creates/updates an "Exam Proctor" agent
- `sessions` — one session per exam case

**External services:**
- Ollama `/api/show` endpoint — queried when model size cannot be parsed from the name
- `ProcessManager` — starts sessions and subscribes to `ClaudeStreamEvent` events
