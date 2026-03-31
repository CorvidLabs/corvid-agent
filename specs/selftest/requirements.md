---
spec: selftest.spec.md
---

## User Stories

- As a platform administrator, I want to run the full test suite via an agent session so that failing tests are automatically analyzed and fixed
- As an agent operator, I want to choose between unit tests, e2e tests, or both so that I can target specific test failures without running the entire suite
- As an agent developer, I want the self-test agent to auto-fix failing tests and re-run them so that test regressions are resolved without manual intervention
- As a platform administrator, I want the self-test setup to be idempotent so that running self-test multiple times does not create duplicate projects or agents

## Acceptance Criteria

- `SelfTestService.ensureSetup` finds or creates a project named `'corvid-agent (self)'` with `workingDir` set to `process.cwd()`; does not create duplicates
- `SelfTestService.ensureSetup` finds or creates an agent named `'Self-Test Agent'` with model `'claude-sonnet-4-20250514'`, permission mode `'full-auto'`, allowed tools `'Bash,Read,Write,Edit,Glob,Grep'`, max budget `$5.00`, and `algochatEnabled: false`
- When the self-test agent already exists, `ensureSetup` updates its configuration (system prompt, model, permission mode, tools, budget) to match `SELF_TEST_AGENT` constants
- `SelfTestService.run('unit')` creates a session with a prompt instructing the agent to run `bun test`, analyze failures, fix source code, and re-run to verify
- `SelfTestService.run('e2e')` creates a session with a prompt to run `npx playwright test --config=playwright.config.js`
- `SelfTestService.run('all')` creates a session with a prompt to run unit tests first, then e2e tests, and fix any failures
- Sessions are created with `source: 'web'` and name format `'Self-Test: {testType}'`
- `run` returns a `{ sessionId: string }` after starting the agent process
- The `SELF_TEST_PROJECT` constant specifies a `claudeMd` field containing instructions for running tests
- The `SELF_TEST_AGENT` constant specifies a `systemPrompt` for test execution behavior

## Constraints

- The self-test agent runs in `'full-auto'` permission mode with a hard $5.00 budget cap per session
- Requires a running database and process manager; errors from `createProject`, `createAgent`, `createSession`, or `processManager.startProcess` propagate directly
- Uses `process.cwd()` as the working directory, which must be the corvid-agent project root
- The self-test agent model is hardcoded to `claude-sonnet-4-20250514`; it cannot be changed at runtime
- AlgoChat is explicitly disabled for self-test sessions to avoid external side effects

## Out of Scope

- Reporting test results back to the caller (the session runs asynchronously; results are in the session log)
- Scheduling recurring self-test runs (handled by the scheduler module)
- Testing against models other than the hardcoded default
- Parallel test execution across multiple sessions
- Self-test for non-TypeScript components (e.g., Angular client tests)
- Persisting self-test results or scorecards to the database
