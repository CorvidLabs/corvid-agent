---
module: approval
version: 1
status: draft
files:
  - server/process/approval-manager.ts
  - server/process/approval-types.ts
  - server/process/owner-question-manager.ts
db_tables:
  - escalation_queue
  - owner_questions
depends_on:
  - specs/db/escalation-queue.spec.md
  - specs/lib/infra.spec.md
---

# Approval

## Purpose

Manages tool-use approval flow and owner question/answer interactions for agent sessions, including real-time approval resolution, escalation queuing with expiry, and owner-directed question prompts with timeout handling.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `formatToolDescription` | `toolName: string, input: Record<string, unknown>` | `string` | Generates a human-readable description of a tool invocation (e.g. "Run command: ...", "Write file: ...") by switching on known tool names. |

### Exported Types

| Type | Description |
|------|-------------|
| `OperationalMode` | Union `'normal' \| 'queued' \| 'paused'` controlling how the ApprovalManager handles incoming requests. |
| `ApprovalRequest` | Interface describing a pending approval: `id`, `sessionId`, `toolName`, `toolInput`, `description`, `createdAt`, `timeoutMs`, `source`. |
| `ApprovalResponse` | Interface for an approval decision: `requestId`, `behavior` (`'allow' \| 'deny'`), optional `message` and `updatedInput`. |
| `ApprovalHandler` | Function type `(request: ApprovalRequest) => Promise<ApprovalResponse>`. |
| `ApprovalRequestWire` | Wire-safe subset of `ApprovalRequest` omitting `toolInput` — safe to send over WebSocket/HTTP. |
| `OwnerQuestion` | Interface for a question posed to the project owner: `id`, `sessionId`, `agentId`, `question`, `options`, `context`, `createdAt`, `timeoutMs`. |
| `OwnerQuestionResponse` | Interface for an owner's answer: `questionId`, `answer`, `selectedOption`. |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ApprovalManager` | Manages the lifecycle of tool-use approval requests, supporting normal (wait-then-queue), queued (immediate escalation), and paused (immediate deny) modes. |
| `OwnerQuestionManager` | Manages the lifecycle of owner-directed questions from agents, with timeout handling and persistence to the `owner_questions` table. |

#### ApprovalManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `operationalMode` (getter) | — | `OperationalMode` | Returns the current operational mode. |
| `operationalMode` (setter) | `mode: OperationalMode` | `void` | Sets the operational mode and logs the transition. |
| `setDatabase` | `db: Database` | `void` | Injects the SQLite database reference and starts the escalation expiry timer. |
| `getDefaultTimeout` | `source: string` | `number` | Returns the default timeout: 120s for `'algochat'`, 55s otherwise. |
| `createRequest` | `request: ApprovalRequest, senderAddress?: string` | `Promise<ApprovalResponse>` | Creates a pending approval. In paused mode, immediately denies. In queued mode, immediately enqueues. In normal mode, waits for resolution or times out and enqueues. |
| `resolveRequest` | `requestId: string, response: ApprovalResponse` | `boolean` | Resolves a pending in-memory approval request. Returns `false` if not found. |
| `resolveQueuedRequest` | `queueId: number, approved: boolean` | `boolean` | Resolves a queued escalation by DB ID, unblocking the waiting SDK process. |
| `getQueuedRequests` | — | `EscalationRequest[]` | Returns all pending escalation requests from the database. |
| `resolveByShortId` | `shortId: string, partial: { behavior: 'allow' \| 'deny'; message?: string }, senderAddress?: string` | `boolean` | Resolves a pending request by matching a short ID prefix. Validates sender address if tracked. |
| `setSenderAddress` | `requestId: string, senderAddress: string` | `void` | Associates a sender address with an existing pending request for sender verification. |
| `getPendingForSession` | `sessionId: string` | `ApprovalRequest[]` | Returns all pending approval requests for a given session. |
| `hasPendingRequests` | — | `boolean` | Returns whether any approval requests are currently pending. |
| `cancelSession` | `sessionId: string` | `void` | Denies and removes all pending and queued approvals for a session. |
| `shutdown` | — | `void` | Stops the expiry timer and denies all pending and queued requests with "Server shutting down". |

#### OwnerQuestionManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setDatabase` | `db: Database` | `void` | Injects the SQLite database reference for question persistence. |
| `createQuestion` | `params: { sessionId, agentId, question, options?, context?, timeoutMs? }` | `Promise<OwnerQuestionResponse \| null>` | Creates a pending question, persists it to DB, and waits for resolution or timeout. Returns `null` on timeout. Timeout is clamped between 60s and 600s (default 120s). |
| `resolveQuestion` | `questionId: string, response: OwnerQuestionResponse` | `boolean` | Resolves a pending question by ID. Persists the response. Returns `false` if not found. |
| `cancelSession` | `sessionId: string` | `void` | Cancels all pending questions for a session, resolving them as `null`. |
| `getPendingForSession` | `sessionId: string` | `OwnerQuestion[]` | Returns all pending questions for a session. |
| `findByShortId` | `shortId: string` | `OwnerQuestion \| null` | Finds a pending question by short ID prefix (first N chars of UUID). |
| `resolveByShortId` | `shortId: string, response: Omit<OwnerQuestionResponse, 'questionId'>` | `boolean` | Resolves a question matched by short ID prefix. |
| `shutdown` | — | `void` | Times out all pending questions and clears the map. |

## Invariants

1. In `paused` mode, all approval requests are immediately denied without queuing.
2. In `queued` mode, all approval requests are immediately persisted to the escalation queue (no timeout window).
3. In `normal` mode, approval requests wait up to `timeoutMs` before being queued as escalations and denied to the caller.
4. A queued escalation resolver (`resolveQueuedRequest`) unblocks the corresponding SDK process promise; if no in-memory resolver exists (process restarted), the DB status is still updated.
5. Expired escalation requests (older than 24 hours) are automatically cleaned up on boot and every hour; their in-memory resolvers are denied.
6. `resolveByShortId` rejects responses from a different sender address than the original request's tracked sender.
7. Owner question timeouts are clamped to the range [60s, 600s] regardless of the requested value.
8. Owner questions resolved as `null` on timeout are persisted with status `'timeout'` in the database.
9. `cancelSession` on both managers denies/nullifies all pending items for that session and cleans up timers.
10. `shutdown` on both managers resolves all pending items (deny/null) and clears internal state.

## Behavioral Examples

### Scenario: Normal mode approval timeout and escalation
- **Given** the ApprovalManager is in `normal` mode with a database attached
- **When** a `createRequest` is called and no resolution arrives within `timeoutMs`
- **Then** the request is persisted to the escalation queue, the promise resolves with `behavior: 'deny'` and `message: 'Approval timed out'`

### Scenario: Paused mode immediate denial
- **Given** the ApprovalManager `operationalMode` is `'paused'`
- **When** `createRequest` is called
- **Then** the promise resolves immediately with `behavior: 'deny'` and `message: 'System is in paused mode'`

### Scenario: Queued mode immediate escalation
- **Given** the ApprovalManager is in `queued` mode with a database attached
- **When** `createRequest` is called
- **Then** the request is immediately persisted to the escalation queue and the promise blocks until `resolveQueuedRequest` is called

### Scenario: Owner question timeout
- **Given** a question is created with `timeoutMs: 120000`
- **When** no answer arrives within 120 seconds
- **Then** the promise resolves with `null`, and the DB row is updated to status `'timeout'`

### Scenario: Short ID approval resolution via AlgoChat
- **Given** a pending approval request with ID `a1b2c3d4-...` and `senderAddress: 'ALICE...'`
- **When** `resolveByShortId('a1b2', { behavior: 'allow' }, 'ALICE...')` is called
- **Then** the request is resolved with `behavior: 'allow'`

### Scenario: Short ID sender mismatch
- **Given** a pending approval with tracked `senderAddress: 'ALICE...'`
- **When** `resolveByShortId('a1b2', { behavior: 'allow' }, 'BOB...')` is called
- **Then** the method returns `false` and the request remains pending

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `resolveRequest` called with unknown `requestId` | Returns `false`, logs debug message |
| `resolveQueuedRequest` called with no database | Returns `false` |
| `resolveQueuedRequest` called with unknown or already-resolved `queueId` | Returns `false`, logs debug message |
| `resolveByShortId` with no matching prefix | Returns `false`, logs debug message |
| `resolveByShortId` with wrong sender address | Returns `false`, logs warning |
| `resolveQuestion` called with unknown `questionId` | Returns `false`, logs debug message |
| Database persistence fails in OwnerQuestionManager | Logs warning, continues (non-fatal) |
| `getQueuedRequests` called with no database | Returns empty array |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `db/escalation-queue` | `enqueueRequest`, `resolveRequest`, `getPendingRequests`, `expireOldRequests`, `EscalationRequest` type |
| `lib/logger` | `createLogger` for structured logging |
| `lib/bash-security` | (indirect, via `approval-types` import chain) |
| `shared/types` | `SessionSource` type used in `ApprovalRequest.source` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `process/manager` | `ApprovalManager` instance for approval flow orchestration |
| `process/sdk-process` | `ApprovalManager` for tool-use permission checks during SDK execution |
| `routes/*` | API endpoints for approval resolution, escalation queue management |
| `algochat/bridge` | `resolveByShortId` and `setSenderAddress` for on-chain approval flow |
| `ws/handler` | WebSocket events for real-time approval request/response |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
