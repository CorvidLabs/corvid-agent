---
module: selftest
version: 1
status: draft
files:
  - server/selftest/config.ts
  - server/selftest/service.ts
db_tables: []
depends_on:
  - specs/db/connection.spec.md
  - specs/process/process-manager.spec.md
---

# Self-Test

## Purpose

Provides a self-test facility that creates a dedicated project and agent for running the corvid-agent test suite (unit, e2e, or both), then spawns an agent session to execute and auto-fix failing tests.

## Public API

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `SELF_TEST_PROJECT` | `{ name: string; workingDir: string; claudeMd: string }` | Project config for self-test: name is `'corvid-agent (self)'`, workingDir is `process.cwd()`, claudeMd contains instructions for running tests |
| `SELF_TEST_AGENT` | `{ name: string; systemPrompt: string; model: string; permissionMode: 'full-auto'; allowedTools: string; maxBudgetUsd: number; algochatEnabled: boolean }` | Agent config for self-test: name is `'Self-Test Agent'`, model is `'claude-sonnet-4-20250514'`, permissionMode is `'full-auto'`, tools are `'Bash,Read,Write,Edit,Glob,Grep'`, maxBudgetUsd is `5.0`, algochatEnabled is `false` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|

### Exported Types

| Type | Description |
|------|-------------|

### Exported Classes

| Class | Description |
|-------|-------------|
| `SelfTestService` | Orchestrates self-test project/agent setup and test session creation |

#### SelfTestService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database`, `processManager: ProcessManager` | `SelfTestService` | Creates the service with database and process manager handles |
| `ensureSetup` | _(none)_ | `{ projectId: string; agentId: string }` | Finds or creates the self-test project and agent; syncs existing agent config with current `SELF_TEST_AGENT` values; returns their IDs |
| `run` | `testType: 'unit' \| 'e2e' \| 'all'` | `{ sessionId: string }` | Calls `ensureSetup`, creates a session with an appropriate test prompt, starts the agent process, and returns the session ID |

## Invariants

1. The self-test project name is always `'corvid-agent (self)'` and uses `process.cwd()` as its working directory.
2. The self-test agent always runs in `'full-auto'` permission mode with a `$5.00` budget cap.
3. `ensureSetup` is idempotent: it finds existing project/agent by name rather than creating duplicates.
4. When the self-test agent already exists, `ensureSetup` updates its configuration to match `SELF_TEST_AGENT` (system prompt, model, permission mode, tools, budget).
5. The session `source` is always `'web'`.
6. Test type `'unit'` runs `bun test`; `'e2e'` runs `npx playwright test --config=playwright.config.js`; `'all'` runs both sequentially.
7. The agent is instructed to analyze failures, fix source code, and re-run to verify fixes.

## Behavioral Examples

### Scenario: First-time self-test run
- **Given** no self-test project or agent exists in the database
- **When** `run('unit')` is called
- **Then** a new project `'corvid-agent (self)'` and agent `'Self-Test Agent'` are created, a session named `'Self-Test: unit'` is created with a prompt to run `bun test`, and the agent process is started

### Scenario: Subsequent self-test run with existing setup
- **Given** the self-test project and agent already exist
- **When** `run('e2e')` is called
- **Then** the existing project and agent are reused (agent config synced), a new session `'Self-Test: e2e'` is created with a prompt to run Playwright tests, and the agent process is started

### Scenario: Running all tests
- **Given** `run('all')` is called
- **When** the agent session starts
- **Then** the prompt instructs the agent to run unit tests first, then e2e tests, and fix any failures

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Database unavailable | Errors propagate from `createProject`, `createAgent`, or `createSession` calls |
| Process manager fails to start | Error propagates from `processManager.startProcess` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `db` | `listProjects`, `createProject` for project CRUD; `listAgents`, `createAgent`, `updateAgent` for agent CRUD; `createSession` for session creation |
| `process` | `ProcessManager` class for starting agent sessions |
| `lib` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `SelfTestService` class (initialization and lifecycle) |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
