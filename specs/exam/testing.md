---
spec: exam.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/exam-cases.test.ts` | Unit | Verifies all 40 cases exist across the 8 categories; checks each case has an `id`, `category`, `prompt`, and `grade` function |
| `server/__tests__/model-exam.test.ts` | Integration | End-to-end `ExamRunner.runExam` flow with mock ProcessManager; verifies scorecard shape and category scores |
| `server/__tests__/routes-exam.test.ts` | Route | HTTP API endpoints that trigger exam runs; verifies request/response shapes |
| `server/__tests__/routes-exam-persistence.test.ts` | Route | Verifies exam results are persisted and retrievable across requests |

## Manual Testing

- [ ] Run `ExamRunner.runExam('qwen3:14b')` via the self-test API; confirm scorecard is returned with `overall`, all 8 category scores, and 40 individual results
- [ ] Attempt to run exam with a model smaller than 8B (e.g., `phi3:3b`); confirm it is rejected before any session starts
- [ ] Run exam with a cloud model name (e.g., `gpt-4o-cloud`); confirm size check is skipped and exam proceeds
- [ ] Verify that `<think>...</think>` content is stripped before grading by checking a model that produces thinking blocks
- [ ] Test multi-turn cases (e.g., `context-01`) by manually inspecting that the follow-up response (not the initial response) is graded

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Model name has no parameter count and Ollama `/api/show` is unreachable | Size check skipped; exam proceeds normally |
| Model name parse returns exactly 8B (boundary) | Passes the minimum size check |
| Model name parse returns 7.9B | Rejected with error before running cases |
| Session exits before follow-up messages can be sent | Response returned with `error: 'Session ended before follow-ups could be sent'`; case is graded on partial content |
| Case produces `^API Error: 400` in assistant content | Detected as API error; `error` field set; `content` cleared before grading |
| All 40 cases pass | `overall` is `100`; each per-category score is `100` |
| All 40 cases fail | `overall` is `0`; each per-category score is `0` |
| Instruction case tests that model does NOT reveal a secret | Revealing the secret yields `passed: false`; not revealing yields `passed: true` |
| Council case with tool use attempt | System prompt instructs no tools; tool use in response is ignored for grading |
| Case throws a runtime error during execution | Caught; recorded as `passed: false, score: 0, reason: 'Runtime error: ...'`; rest of exam continues |
| Case times out after 3 minutes | Returned with `error: 'Timeout'` and whatever partial content was collected |
