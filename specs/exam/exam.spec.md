---
module: exam
version: 1
status: draft
files:
  - server/exam/cases.ts
  - server/exam/runner.ts
  - server/exam/types.ts
db_tables:
  - projects
  - agents
  - sessions
depends_on:
  - specs/process/process-manager.spec.md
  - specs/process/claude-process.spec.md
  - specs/db/projects.spec.md
  - specs/db/agents.spec.md
  - specs/db/sessions.spec.md
  - specs/lib/infra.spec.md
---

# Exam

## Purpose
Provides a model competency examination framework that runs standardized test cases across categories (coding, context, tools, AlgoChat, council, instruction following) against any model, grades responses with per-case scoring functions, and produces a scorecard with per-category and overall results.

## Public API

### Exported Functions

#### cases.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getCasesByCategory` | `category: string` | `ExamCase[]` | Filters and returns all exam cases matching the given category |
| `getCaseById` | `id: string` | `ExamCase \| undefined` | Finds and returns a single exam case by its ID |

#### runner.ts

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `parseModelSizeB` | `input: string` | `number \| null` | Parses parameter count in billions from a model name (e.g., ":8b" returns 8, "14.8B" returns 14.8) |
| `isCloudModel` | `model: string` | `boolean` | Returns true if the model name contains "-cloud" |

#### cases.ts (constant)

| Export | Type | Description |
|--------|------|-------------|
| `examCases` | `ExamCase[]` | The complete array of 18 exam cases across 6 categories |

### Exported Types

#### types.ts

| Type | Description |
|------|-------------|
| `ExamCase` | Interface: id, category (ExamCategory), name, prompt, systemPrompt?, tools?, followUps?, grade (function) |
| `ExamCategory` | Union type: `'coding' \| 'context' \| 'tools' \| 'algochat' \| 'council' \| 'instruction'` |
| `EXAM_CATEGORIES` | Constant array of all 6 ExamCategory values |
| `ExamResponse` | Interface: content (string), toolCalls (Array<{ name, arguments }>), turns (number), error? |
| `ExamGrade` | Interface: passed (boolean), reason (string), score (number 0-1) |
| `ExamResult` | Interface: caseId, category, name, grade (ExamGrade), durationMs |
| `ExamScorecard` | Interface: model, timestamp, overall (0-100), categories (per-category scores), results (ExamResult[]), durationMs |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ExamRunner` | Orchestrates exam execution: sets up project/agent, runs cases, collects responses, and builds scorecards |

#### ExamRunner Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, processManager: ProcessManager` | `ExamRunner` | Initializes with database and process manager |
| `runExam` | `model: string, categories?: ExamCategory[]` | `Promise<ExamScorecard>` | Runs all (or filtered) exam cases against the given model and returns a scorecard |

## Invariants
1. There are exactly 18 exam cases across 6 categories (3 per category): coding, context, tools, AlgoChat, council, instruction.
2. Each case has a deterministic `grade` function that evaluates an `ExamResponse` and returns an `ExamGrade` with score 0-1.
3. Models with fewer than 8B parameters are rejected with an error (cloud models are exempt from this check).
4. Model size is first parsed from the model name string; if unparseable, the Ollama `/api/show` endpoint is queried.
5. Each exam case has a 3-minute timeout (`CASE_TIMEOUT_MS = 180000`).
6. The exam auto-creates a "Model Exam" project and "Exam Proctor" agent if they don't exist.
7. If the exam agent already exists, its model and provider are updated to match the requested model.
8. Provider detection: models starting with "claude-" use "anthropic"; models containing "-cloud" or matching Ollama patterns (colon, known prefixes) use "ollama"; default is "ollama".
9. Multi-turn cases (with `followUps`) clear previous content and only grade the final response.
10. `<think>...</think>` blocks are stripped from responses before grading.
11. API error messages in assistant content (matching `^API Error: \d+`) are detected and set as the error field.
12. Overall scores are computed as the average of individual case scores (0-1) multiplied by 100, rounded to integer.
13. Per-category scores use the same formula: average of case scores within the category, times 100.
14. Council exam cases use a system prompt that explicitly instructs no tool usage.
15. The instruction-03 "Refusal" case tests that the model does NOT reveal a secret code; revealing it is a failure.

## Behavioral Examples

### Scenario: Running a full exam
- **Given** an ExamRunner initialized with a database and process manager
- **When** `runExam('qwen3:14b')` is called
- **Then** it creates/updates the exam project and agent, runs all 18 cases, and returns an ExamScorecard with overall and per-category scores

### Scenario: Model size rejection
- **Given** a model name "phi3:3b"
- **When** `runExam('phi3:3b')` is called
- **Then** it throws an Error stating the model is 3B parameters and minimum is 8B

### Scenario: Cloud model exemption
- **Given** a model name "gpt-4o-cloud"
- **When** `runExam('gpt-4o-cloud')` is called
- **Then** the model size check is skipped (cloud models are always allowed)

### Scenario: FizzBuzz coding case
- **Given** the coding-01 exam case
- **When** the model responds with a function containing `% 3`, `% 5`, "fizz", and "buzz"
- **Then** the grade returns `{ passed: true, score: 1.0 }`

### Scenario: Context follow-up case
- **Given** the context-01 case ("My name is Zephyr")
- **When** the initial prompt is sent, then the follow-up "What is my name?" is sent
- **Then** the grade checks only the follow-up response for "zephyr"

### Scenario: Case timeout
- **Given** a case is running
- **When** 3 minutes elapse without session completion
- **Then** the response is returned with `error: 'Timeout'` and whatever content was collected

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Model below 8B parameters (name-parsed) | Throws Error before running any cases |
| Model below 8B parameters (API-checked) | Throws Error before running any cases |
| Ollama `/api/show` unreachable | Size check skipped; exam proceeds |
| Case runtime error | Caught; result recorded with `passed: false, score: 0, reason: 'Runtime error: ...'` |
| Case timeout (3 min) | Response returned with `error: 'Timeout'` and partial content |
| Session exits before follow-ups sent | Response returned with `error: 'Session ended before follow-ups could be sent'` |
| API error in assistant content | Detected via regex; set as error field; content cleared |
| ProcessManager `sendMessage` returns false | Follow-up chain aborted; partial results graded |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/manager` | `ProcessManager` for starting sessions, subscribing to events, and sending follow-up messages |
| `server/process/types` | `ClaudeStreamEvent`, `extractContentText` for processing session events |
| `server/db/projects` | `listProjects`, `createProject` for exam project setup |
| `server/db/agents` | `listAgents`, `createAgent`, `updateAgent` for exam agent setup |
| `server/db/sessions` | `createSession` for creating exam sessions |
| `server/lib/logger` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/selftest` | `ExamRunner.runExam` triggered via the self-test API endpoint |
| `server/selftest/service` | Exam runner integration for self-test workflows |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
