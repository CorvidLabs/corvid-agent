---
module: councils
version: 1
status: draft
files:
  - server/councils/discussion.ts
  - server/councils/synthesis.ts
db_tables: []
depends_on:
  - specs/db/connection.spec.md
  - specs/process/process-manager.spec.md
  - specs/algochat/bridge.spec.md
  - specs/lib/infra.spec.md
  - specs/providers/provider-system.spec.md
  - specs/observability/observability.spec.md
---

# Councils

## Purpose

Orchestrates multi-agent council deliberation lifecycle including launch, parallel member responses, multi-round asynchronous discussion, peer review, chairman synthesis, abort handling, and follow-up chat, with real-time WebSocket broadcasting of stage transitions, logs, and discussion messages.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `onCouncilStageChange` | `cb: (launchId: string, stage: string, sessionIds?: string[]) => void` | `() => void` | Register a callback for council stage change events. Returns an unsubscribe function. |
| `onCouncilLog` | `cb: (logEntry: CouncilLaunchLog) => void` | `() => void` | Register a callback for council log entries. Returns an unsubscribe function. |
| `onCouncilDiscussionMessage` | `cb: (message: CouncilDiscussionMessage) => void` | `() => void` | Register a callback for council discussion messages. Returns an unsubscribe function. |
| `onCouncilAgentError` | `cb: (error: CouncilAgentError) => void` | `() => void` | Register a callback for council agent error events. Returns an unsubscribe function. |
| `broadcastAgentError` | `error: CouncilAgentError` | `void` | Broadcast an agent error to all registered error listeners. |
| `launchCouncil` | `db: Database, processManager: ProcessManager, councilId: string, projectId: string, prompt: string, agentMessenger: AgentMessenger \| null` | `LaunchCouncilResult` | Core council launch: validates council/project, creates launch record, starts member sessions, and sets up auto-advance watcher. |
| `triggerReview` | `db: Database, processManager: ProcessManager, launchId: string` | `{ ok: true; reviewSessionIds: string[] } \| { ok: false; error: string; status: number }` | Trigger peer review stage — delegates to synthesis module with injected infrastructure callbacks. |
| `finishWithAggregatedSynthesis` | `db: Database, launchId: string` | `void` | Finish a council by aggregating all session responses into a combined synthesis (no chairman). |
| `triggerSynthesis` | `db: Database, processManager: ProcessManager, launchId: string, chairmanOverride?: string` | `{ ok: true; synthesisSessionId: string } \| { ok: false; error: string; status: number }` | Trigger chairman synthesis stage — delegates to synthesis module with injected infrastructure callbacks. |
| `abortCouncil` | `db: Database, processManager: ProcessManager, launchId: string` | `{ ok: true; killed: number; aggregated: number } \| { ok: false; error: string; status: number }` | Manually end a council: kills running sessions, aggregates available responses, marks complete. |
| `startCouncilChat` | `db: Database, processManager: ProcessManager, launchId: string, message: string` | `CouncilChatResult \| CouncilChatError` | Start or resume a follow-up chat session with the chairman agent about a completed council's synthesis. |
| `buildDiscussionPrompt` | `originalPrompt: string, memberResponses: { agentId: string; agentName: string; label: string; content: string }[], priorDiscussion: CouncilDiscussionMessage[], round: number` | `string` | Build the prompt sent to each agent during a discussion round, including original question, member responses, and prior discussion history. |
| `formatDiscussionMessages` | `messages: CouncilDiscussionMessage[]` | `string` | Format discussion messages grouped by round into a readable string. |
| `waitForSessions` | `processManager: ProcessManager, sessionIds: string[], timeoutMs?: number` | `Promise<WaitForSessionsResult>` | Wait for a set of sessions to complete, with timeout. Returns which sessions completed vs timed out. |
| `aggregateSessionResponses` | `db: Database, allSessions: Session[]` | `string[]` | Collect last assistant response from each session, labelled by agent name. Prefers reviewer sessions over member sessions. Re-exported from synthesis module. |
| `triggerReview` _(synthesis.ts)_ | `db: Database, processManager: ProcessManager, launchId: string, emitLog: EmitLogFn, broadcastStageChange: BroadcastStageChangeFn, watchAutoAdvance?: WatchAutoAdvanceFn` | `{ ok: true; reviewSessionIds: string[] } \| { ok: false; error: string; status: number }` | Core review logic: collects member responses, creates review sessions for each agent, updates stage, optionally sets up auto-advance watcher. |
| `finishWithAggregatedSynthesis` _(synthesis.ts)_ | `db: Database, launchId: string, emitLog: EmitLogFn, broadcastStageChange: BroadcastStageChangeFn` | `void` | Aggregate all session responses and mark launch as complete without a chairman synthesis step. |
| `triggerSynthesis` _(synthesis.ts)_ | `db: Database, processManager: ProcessManager, launchId: string, emitLog: EmitLogFn, broadcastStageChange: BroadcastStageChangeFn, formatDiscussionMessages: (msgs: CouncilDiscussionMessage[]) => string, chairmanOverride?: string` | `{ ok: true; synthesisSessionId: string } \| { ok: false; error: string; status: number }` | Core synthesis logic: collects all member responses, reviews, and discussion, builds a synthesis prompt, starts a chairman session, and watches for completion to store final synthesis. |

### Exported Types

| Type | Description |
|------|-------------|
| `LaunchCouncilResult` | `{ launchId: string; sessionIds: string[] }` — result of launching a council. |
| `CouncilChatResult` | `{ ok: true; sessionId: string; created: boolean }` — successful chat start/resume result. |
| `CouncilChatError` | `{ ok: false; error: string; status: number }` — failed chat attempt. |
| `WaitForSessionsResult` | `{ completed: string[]; timedOut: string[] }` — result of waiting for sessions with timeout. |
| `EmitLogFn` | `(db: Database, launchId: string, level: CouncilLogLevel, message: string, detail?: string) => void` — callback type for structured log emission. |
| `BroadcastStageChangeFn` | `(launchId: string, stage: string, sessionIds?: string[]) => void` — callback type for broadcasting stage transitions to WS clients. |
| `WatchAutoAdvanceFn` | `(db: Database, processManager: ProcessManager, launchId: string, sessionIds: string[], role: 'member' \| 'reviewer') => void` — callback type for auto-advance watcher injection. |

### Exported Classes

_(none)_

## Invariants

1. Council stage transitions follow the pipeline: `responding` -> `discussing` -> `reviewing` -> `synthesizing` -> `complete`. Stages cannot be skipped except when `discussionRounds` is 0 (skips `discussing`).
2. The `triggerReview` function requires the launch to be in `responding` or `discussing` stage; otherwise it returns an error.
3. The `triggerSynthesis` function requires the launch to be in `reviewing` stage; otherwise it returns an error.
4. `startCouncilChat` requires the launch to be in `complete` stage with a non-null synthesis.
5. `abortCouncil` cannot abort an already-complete launch; it returns an error.
6. Discussion, review, and synthesis functions in `synthesis.ts` receive infrastructure callbacks (emitLog, broadcastStageChange) via dependency injection rather than importing them directly, enabling testability.
7. Auto-advance watchers subscribe to process events before checking `isRunning`, closing the race window where a process could exit between check and subscribe.
8. Per-agent round timeout is 10 minutes. For local Ollama agents (serialized inference), timeout scales by agent count. Hard cap is 3 hours total.
9. Discussion prompts instruct agents to take clear positions, add new information, and avoid repetition.
10. The `aggregateSessionResponses` function prefers reviewer sessions over member sessions when both exist.
11. On-chain discussion messages are sent best-effort (fire-and-forget) via `AgentMessenger.sendOnChainBestEffort`.
12. All stage changes, logs, and discussion messages are broadcast to registered listeners (used by WebSocket layer).
13. If discussion rounds fail, the system falls through to trigger review anyway as a recovery mechanism.
14. `waitForSessions` resolves with partial results on timeout rather than rejecting, reporting which sessions completed and which timed out.
15. On-chain discussion messages are only sent when council `onChainMode` is `'full'`.
16. Synthesis attestation (SHA-256 hash) is published on-chain when `onChainMode` is `'attestation'`.
17. Governance votes use reputation-weighted voting via `evaluateWeightedVote`. Each agent's vote is weighted by their reputation score (0–100, default 50 if unavailable).
18. Councils can configure `quorumType` (`majority`/`supermajority`/`unanimous`) and an optional `quorumThreshold` (0.0–1.0) that overrides the governance tier default.
19. On synthesis completion for governance launches, `resolveGovernanceVote` evaluates the weighted vote and updates the governance vote status to `approved`, `rejected`, or `awaiting_human`.
20. The chairman synthesis prompt includes governance vote weights for governance launches, instructing higher-reputation positions to carry more influence.

## Behavioral Examples

### Scenario: Full council lifecycle with discussion
- **Given** a council with 3 agents and 2 discussion rounds
- **When** `launchCouncil` is called
- **Then** 3 member sessions are started in parallel, and an auto-advance watcher is set up
- **When** all member sessions complete
- **Then** auto-advance triggers discussion (2 rounds of parallel discusser sessions)
- **When** all discussion rounds complete
- **Then** review is triggered with 3 reviewer sessions
- **When** all reviewer sessions complete
- **Then** synthesis is triggered with the chairman agent
- **When** the chairman session completes
- **Then** the synthesis is stored and stage becomes `complete`

### Scenario: Council with zero discussion rounds
- **Given** a council with `discussionRounds: 0`
- **When** all member sessions complete
- **Then** discussion stage is skipped entirely and review is triggered immediately

### Scenario: Aborting a running council
- **Given** a council in `responding` stage with 2 running sessions
- **When** `abortCouncil` is called
- **Then** both sessions are killed, available responses are aggregated, stage is set to `complete`, and the kill count is returned

### Scenario: Follow-up chat after completion
- **Given** a council in `complete` stage with a synthesis
- **When** `startCouncilChat(db, pm, launchId, 'Can you elaborate?')` is called
- **Then** a new chairman session is created with a system prompt containing the original question, synthesis, and discussion context, and the session ID is returned

### Scenario: Resuming an existing follow-up chat
- **Given** a council with an existing `chatSessionId`
- **When** `startCouncilChat` is called again
- **Then** `processManager.resumeProcess` is called on the existing session instead of creating a new one

### Scenario: Council with onChainMode 'attestation'
- **Given** a council with `onChainMode` set to `'attestation'`
- **When** the synthesis session completes
- **Then** a SHA-256 hash of the synthesis text is published on-chain via `sendOnChainToSelf`, and the txid is stored in `council_launches.synthesis_txid`

### Scenario: Council with onChainMode 'off' (default)
- **Given** a council with default `onChainMode` (`'off'`)
- **When** discussion rounds run
- **Then** no on-chain messages are sent (`sendDiscussionOnChain` is not called)

### Scenario: Session timeout during discussion round
- **Given** a discussion round with 3 agents, one of which hangs
- **When** the per-round timeout fires
- **Then** `waitForSessions` resolves with 2 completed and 1 timed out, the timed-out session is force-stopped, and the round proceeds

### Scenario: Governance vote with weighted voting
- **Given** a governance council launch (Layer 2) with 3 agents having reputation scores 90, 30, and 50
- **When** the high-reputation agent (90) approves and the other two reject
- **Then** the weighted approval ratio is 90/(90+30+50) = 52.9%, which meets the 50% Layer 2 threshold
- **And** the governance vote status is updated to `approved`

### Scenario: Governance vote with custom quorum threshold
- **Given** a council with `quorumThreshold: 0.8`
- **When** a governance vote achieves 70% weighted approval
- **Then** the vote is rejected because 70% < 80% custom threshold

### Scenario: Layer 1 governance vote requiring human approval
- **Given** a governance launch targeting Layer 1 paths (e.g., `package.json`)
- **When** 80% weighted approval is achieved
- **Then** the governance vote status is set to `awaiting_human`
- **When** a human operator approves via the `/vote/approve` endpoint
- **Then** the vote is re-evaluated and status is updated to `approved`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Council ID not found during launch | Throws `NotFoundError` |
| Project ID not found during launch | Throws `NotFoundError` |
| Launch not found for triggerReview | Returns `{ ok: false, error: 'Launch not found', status: 404 }` |
| Review triggered from wrong stage | Returns `{ ok: false, error: 'Cannot start review from stage ...', status: 400 }` |
| Synthesis triggered from wrong stage | Returns `{ ok: false, error: 'Cannot synthesize from stage ...', status: 400 }` |
| No chairman agent assigned for synthesis | Returns `{ ok: false, error: 'Council has no chairman agent assigned', status: 400 }` |
| Council not found for synthesis | Returns `{ ok: false, error: 'Council not found', status: 404 }` |
| Abort on already-complete launch | Returns `{ ok: false, error: 'Launch already complete', status: 400 }` |
| Chat on non-complete launch | Returns `{ ok: false, error: 'Council must be complete before chatting', status: 400 }` |
| Chat when no synthesis available | Returns `{ ok: false, error: 'No synthesis available to chat about', status: 400 }` |
| Failed to start chat session process | Returns `{ ok: false, error: 'Failed to start chat session', status: 500 }` |
| Failed to start member/reviewer/discusser session | Error is logged but does not abort the overall operation |
| Discussion rounds fail entirely | Falls through to trigger review as recovery |
| Overall discussion timeout (3h hard cap) | Remaining rounds are skipped, review is triggered |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `db` | `getCouncil`, `createCouncilLaunch`, `getCouncilLaunch`, `updateCouncilLaunchStage`, `addCouncilLaunchLog`, `insertDiscussionMessage`, `getDiscussionMessages`, `updateCouncilLaunchDiscussionRound`, `updateDiscussionMessageTxid`, `updateCouncilLaunchChatSession`, `getGovernanceVote`, `getGovernanceMemberVotes`, `updateGovernanceVoteStatus` from `db/councils`; `createSession`, `getSession`, `getSessionMessages`, `listSessionsByCouncilLaunch` from `db/sessions`; `getAgent` from `db/agents`; `getProject` from `db/projects` |
| `reputation` | `ReputationScorer.getCachedScore` — used for weighted governance vote evaluation |
| `governance` | `evaluateWeightedVote` — reputation-weighted vote evaluation with custom thresholds |
| `process` | `ProcessManager` — `startProcess`, `stopProcess`, `resumeProcess`, `isRunning`, `subscribe`, `unsubscribe`; `EventCallback` type |
| `algochat` | `AgentMessenger` — `sendOnChainBestEffort` for on-chain discussion messaging |
| `lib` | `createLogger` from `lib/logger`; `NotFoundError` from `lib/errors` |
| `providers` | `getModelPricing` from `providers/cost-table` for detecting local Ollama models |
| `observability` | `createEventContext`, `runWithEventContext` from `observability/event-context` |
| `shared` | `CouncilLogLevel`, `CouncilLaunchLog`, `CouncilDiscussionMessage`, `Council`, `CouncilOnChainMode` types from `shared/types` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `routes` | `routes/councils.ts` delegates HTTP API calls to `launchCouncil`, `triggerReview`, `triggerSynthesis`, `abortCouncil`, `startCouncilChat` |
| `ws` | WebSocket handler subscribes via `onCouncilStageChange`, `onCouncilLog`, `onCouncilDiscussionMessage` to broadcast real-time updates to clients |
| `algochat` | AlgoChat `/council` command uses `launchCouncil` directly |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-06 | corvid-agent | Added on-chain mode (off/attestation/full) for council communication |
| 2026-03-08 | corvid-agent | Governance v2: weighted voting, quorum config, vote resolution on synthesis completion |
