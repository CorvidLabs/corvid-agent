# Self-Test — Context

## Why This Module Exists

The platform needs to be able to test itself — not just unit tests, but spawning a real agent session to run the test suite and optionally auto-fix failures. Self-test provides this self-healing capability.

## Architectural Role

Self-test is a **quality assurance tool** — simpler than the full exam module, focused specifically on running the project's test suite via an agent session.

## Key Design Decisions

- **Dedicated test agent**: Creates a separate project and agent for test runs to avoid polluting production data.
- **Auto-fix capability**: When tests fail, the spawned agent can attempt to fix them, creating a feedback loop.
- **Configurable scope**: Can run unit tests, e2e tests, or both.

## Relationship to Other Modules

- **Process Manager**: Creates agent sessions for test execution.
- **DB**: Uses project, agent, and session tables.
- **Exam**: Exam is the more comprehensive testing framework; self-test is the quick version.
