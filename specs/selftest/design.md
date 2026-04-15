---
spec: selftest.spec.md
sources:
  - server/selftest/config.ts
  - server/selftest/service.ts
---

## Layout

Two-file module: `config.ts` holds pure constants; `service.ts` contains the `SelfTestService` class.
No HTTP routes — the service is consumed directly by `server/index.ts`.

```
server/selftest/
  config.ts      — SELF_TEST_PROJECT and SELF_TEST_AGENT constants
  service.ts     — SelfTestService class (ensureSetup + run)
```

## Components

### `SELF_TEST_PROJECT` constant
Describes the project that gets created in the database for self-test runs:
- `name`: `'corvid-agent (self)'`
- `workingDir`: `process.cwd()` (evaluated at module load time)
- `claudeMd`: instructions covering `bun test`, Playwright, and client build

### `SELF_TEST_AGENT` constant
Agent config seeded from `SELF_TEST_PROJECT.claudeMd`:
- `model`: `claude-sonnet-4-20250514`
- `permissionMode`: `'full-auto'`
- `allowedTools`: `'Bash,Read,Write,Edit,Glob,Grep'`
- `maxBudgetUsd`: `5.0`
- `algochatEnabled`: `false`

### `SelfTestService` class
Lifecycle: constructed at server startup with `db` and `processManager` handles.

`ensureSetup()` — idempotent:
1. `listProjects` → find by name or `createProject`
2. `listAgents` → find by name or `createAgent`; if found, `updateAgent` to sync config
3. Returns `{ projectId, agentId }`

`run(testType)` — calls `ensureSetup`, builds a prompt string per test type, calls `createSession`, then `processManager.startProcess`.

## Tokens

| Constant | Value | Notes |
|----------|-------|-------|
| `SELF_TEST_PROJECT.name` | `'corvid-agent (self)'` | Used as idempotency key |
| `SELF_TEST_AGENT.name` | `'Self-Test Agent'` | Used as idempotency key |
| `SELF_TEST_AGENT.maxBudgetUsd` | `5.0` | Hard cap per run |
| `SELF_TEST_AGENT.permissionMode` | `'full-auto'` | No human approval gates |

## Assets

### Database Tables
- `projects` — one row named `'corvid-agent (self)'`
- `agents` — one row named `'Self-Test Agent'`
- `sessions` — one row created per `run()` invocation with `source: 'web'`

### External
- `ProcessManager` — starts the agent process and streams output to the session
