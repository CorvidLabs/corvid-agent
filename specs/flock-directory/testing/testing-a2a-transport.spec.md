---
module: flock-directory-testing-a2a-transport
version: 1
status: draft
files:
  - server/flock-directory/testing/a2a-transport.ts
db_tables: []
depends_on:
  - specs/flock-directory/service.spec.md
  - specs/flock-directory/testing/testing-runner.spec.md
---

# Flock Directory A2A Test Transport

## Purpose

Provides an A2A HTTP transport for Flock Directory agent testing. Sends test challenges via the A2A protocol (`POST /a2a/tasks/send`) instead of AlgoChat, avoiding self-test deadlocks and keeping test conversations off-chain while still recording scores.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createA2ATransport` | `(db: Database)` | `TestTransport` | Creates a transport that resolves agent addresses to instance URLs via the Flock Directory, submits A2A tasks, and polls for completion |

## Key Behaviors

1. **Address resolution** — looks up the agent's `instanceUrl` from the Flock Directory registry by Algorand address
2. **Task submission** — POSTs to `/a2a/tasks/send` with the test message prefixed by `[FLOCK-TEST]`
3. **Polling** — polls `/a2a/tasks/{taskId}` every 2 seconds until state is `completed` or `failed`, or timeout
4. **Response extraction** — returns the last agent-role message's first text part from the completed task

## Invariants

- The transport never throws — all errors are caught and return `null`
- Test messages are always prefixed with `[FLOCK-TEST]`
- Submit timeout is capped at 30 seconds regardless of the test timeout

## Behavioral Examples

- Agent with valid instanceUrl → submits task, polls, returns agent response text
- Agent with no instanceUrl → returns `null` immediately with warning log
- Task times out → returns `null` after polling until deadline

## Error Cases

- Agent address not found in Flock Directory → returns `null`
- Agent has no `instanceUrl` configured → returns `null`
- HTTP error on task submission → returns `null`
- Polling timeout exceeded → returns `null`
- Network error during submit or poll → returns `null`

## Dependencies

- `server/flock-directory/service.ts` — `FlockDirectoryService` for agent address lookup
- `server/flock-directory/testing/runner.ts` — `TestTransport` interface

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-03-24 | Initial version — A2A HTTP transport for off-chain agent testing |
