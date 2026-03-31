---
spec: exam.spec.md
---

## User Stories

- As a platform administrator, I want to run a standardized exam against any model so that I can objectively evaluate its competency before deploying it for agent tasks
- As an agent operator, I want per-category score breakdowns so that I can identify a model's strengths and weaknesses across coding, reasoning, tools, and collaboration
- As a platform administrator, I want to filter exams by category so that I can quickly test a model on specific competency areas without running the full suite
- As an agent developer, I want exam results saved as structured scorecards so that I can compare models over time
- As a platform administrator, I want models below a minimum parameter threshold rejected so that undersized models do not waste compute on exams they cannot pass

## Acceptance Criteria

- `ExamRunner.runExam` executes all 40 exam cases across 8 categories (coding: 6, context: 6, tools: 5, AlgoChat: 5, council: 6, instruction: 6, collaboration: 3, reasoning: 3) and returns an `ExamScorecard`
- `ExamRunner.runExam` accepts an optional `categories` filter to run only specific category subsets
- Models with fewer than 8B parameters are rejected with an error before any cases run; cloud models are exempt from this check
- Model size is parsed from the name string first (e.g., `:8b`, `14.8B`); if unparseable, the Ollama `/api/show` endpoint is queried
- Each exam case has a 3-minute timeout (`CASE_TIMEOUT_MS = 180000`); timeout produces an error response with partial content
- The exam auto-creates a "Model Exam" project and "Exam Proctor" agent if they do not exist; existing agent config is updated to match the requested model
- Provider detection: models starting with `claude-` use `anthropic`; models containing `-cloud` or matching Ollama patterns use `ollama`; default is `ollama`
- Multi-turn cases with `followUps` clear previous content and grade only the final response
- `<think>...</think>` blocks are stripped from responses via `stripThinkBlocks` before grading
- API error messages matching `^API Error: \d+` are detected by `isApiError` and set as the error field
- Overall score is the average of individual case scores (0-1) multiplied by 100, rounded to integer
- Per-category scores use the same formula within each category
- `getCasesByCategory` filters cases by category string; `getCaseById` returns a single case or undefined
- The instruction-03 "Refusal" case verifies the model does NOT reveal a secret code; revealing it is a failure
- Council exam cases use a system prompt that explicitly instructs no tool usage

## Constraints

- Requires a running process manager and database for session creation and event subscription
- Each case runs in its own session; concurrent case execution is not supported
- Exam agent always uses the model being tested, not the platform default
- Ollama `/api/show` endpoint must be reachable for model size verification when name parsing fails; unreachable Ollama skips the size check
- The 40 exam cases and their grading functions are hardcoded in `cases.ts`

## Out of Scope

- Custom or user-defined exam cases (only the built-in 40 cases are supported)
- Comparative benchmarking across multiple models in a single run
- Persistent exam result storage in the database (scorecards are returned but not persisted by this module)
- Testing multimodal capabilities (image, audio)
- Exam case versioning or A/B testing of grading functions
- Real-time progress streaming during exam execution
