---
spec: selftest.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/selftest-service.test.ts` | unit | `SELF_TEST_PROJECT` and `SELF_TEST_AGENT` constant correctness: name, workingDir, claudeMd content, model, permissionMode, allowedTools, maxBudgetUsd, algochatEnabled, and that systemPrompt equals claudeMd |

Note: `SelfTestService` class (ensureSetup + run) currently has no integration-level test against a real in-memory DB. The existing tests cover config values only.

## Manual Testing

- [ ] POST `/api/selftest/run` with `{ testType: 'unit' }` — verify a new session appears in the sessions list named `'Self-Test: unit'`
- [ ] Run twice — verify only one project `'corvid-agent (self)'` and one agent `'Self-Test Agent'` exist (idempotency)
- [ ] Change `SELF_TEST_AGENT.model` in code, restart, call `ensureSetup` — verify existing agent's model is updated
- [ ] POST with `{ testType: 'e2e' }` — verify session prompt references `npx playwright`
- [ ] POST with `{ testType: 'all' }` — verify prompt references both `bun test` and `playwright`
- [ ] Confirm session `source` is `'web'` in DB

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| First-ever run (no project/agent in DB) | Creates both; returns valid `projectId` and `agentId` |
| Repeated `ensureSetup` calls | No duplicate rows; returns same IDs each time |
| Agent config changes between runs | `updateAgent` is called; existing agent row reflects new config |
| `processManager.startProcess` throws | Error propagates to caller; session row already created |
| Database unavailable | Error propagates from `createProject` / `createAgent` / `createSession` |
| `run('unit')` prompt content | Contains `bun test` and instructs agent to fix failures |
| `run('e2e')` prompt content | Contains `npx playwright test --config=playwright.config.js` |
| `run('all')` prompt content | Contains both commands in sequence |
| Session `source` field | Always `'web'` regardless of test type |
| `algochatEnabled` | Always `false` — self-test agent must not perform on-chain operations |
