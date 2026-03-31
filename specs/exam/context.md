# Exam — Context

## Why This Module Exists

Agents need to be tested — not just unit tests on the codebase, but functional tests of agent behavior. The exam module creates a dedicated test project and agent, then runs a suite of cases (unit, e2e, or both) against it. This validates that agents can actually perform tasks correctly, not just that the code compiles.

## Architectural Role

Exam is a **quality assurance tool** — it spawns real agent sessions and evaluates their output against expected results. It's orthogonal to traditional testing (bun test) and focuses on agent behavioral correctness.

## Key Design Decisions

- **Dedicated test project**: Creates an isolated project for test runs so exam results don't pollute real projects.
- **Agent-driven auto-fix**: When tests fail, the exam runner can spawn an agent session to attempt automatic fixes, creating a self-healing loop.
- **Case-based structure**: Test cases are defined declaratively in `cases.ts`, making it easy to add new behavioral tests.

## Relationship to Other Modules

- **Process Manager**: Exam runs create real agent sessions.
- **Projects/Agents/Sessions (DB)**: Uses the standard project and agent infrastructure.
- **Self-Test**: Self-test is the simpler variant; exam is the full suite.
