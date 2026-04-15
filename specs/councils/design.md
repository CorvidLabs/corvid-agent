---
spec: councils.spec.md
sources:
  - server/councils/discussion.ts
  - server/councils/synthesis.ts
  - server/councils/governance.ts
---

## Layout

Three-file backend module with clear separation of concerns:

```
server/councils/
  discussion.ts   — Council lifecycle orchestration: launch, chat, abort, event bus
  synthesis.ts    — Review and synthesis stages (dependency-injected infra callbacks)
  governance.ts   — Path classification, tier definitions, vote evaluation functions
```

## Components

### `discussion.ts` — Lifecycle Orchestrator

The primary entry point for council operations. Owns the in-process event bus (pub/sub via callback arrays) for stage changes, logs, discussion messages, and governance vote events.

| Function | Role |
|----------|------|
| `launchCouncil` | Validates council/project, creates launch record, starts all member sessions in parallel, sets up auto-advance watcher |
| `abortCouncil` | Kills all running sessions, aggregates available responses, marks launch complete |
| `startCouncilChat` | Creates or resumes a follow-up chairman session for post-synthesis Q&A |
| `triggerReview` | Delegates to `synthesis.ts` with injected infra callbacks |
| `triggerSynthesis` | Delegates to `synthesis.ts` with injected infra callbacks |
| `onCouncilStageChange` / `onCouncilLog` / `onCouncilDiscussionMessage` | Event bus registration (returns unsubscribe function) |

### `synthesis.ts` — Stage Engine (Dependency Injected)

Pure business logic for review and synthesis stages. Receives `emitLog`, `broadcastStageChange`, and `watchAutoAdvance` as callbacks to decouple from the event bus, enabling unit testing without mock setup.

| Function | Role |
|----------|------|
| `triggerReview` | Collects member responses, spawns reviewer sessions, optionally sets up auto-advance watcher |
| `triggerSynthesis` | Collects all responses + discussion, builds chairman prompt, starts chairman session, stores synthesis |
| `finishWithAggregatedSynthesis` | Aggregates all sessions without a chairman (direct-to-complete path) |
| `aggregateSessionResponses` | Picks best response per agent (reviewer preferred over member) |

### `governance.ts` — Tier Classifier and Vote Evaluator

Stateless pure functions. No DB access, no external dependencies beyond path-matching logic.

| Function | Role |
|----------|------|
| `classifyPath` / `classifyPaths` | Assigns a governance tier (0/1/2) to a file path based on basename and substring rules |
| `assessImpact` | Returns a full `GovernanceImpact` object for a set of file changes |
| `evaluateVote` / `evaluateWeightedVote` | Determines if a vote achieves quorum; supports reputation-weighted ballots |
| `evaluateProposalVote` | Evaluates proposal votes with cascading quorum config resolution |
| `checkAutomationAllowed` | Blocks Layer 0 and Layer 1 paths from automated changes |

### Auto-Advance Watcher Pattern

Subscribes to process events **before** calling `isRunning()` to close the race window where a session exits between check and subscribe. When all sessions in a stage complete, the watcher advances the council to the next stage.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Per-agent round timeout | 10 minutes | Timeout per agent per discussion/review round |
| Hard cap (total discussion) | 3 hours | Maximum total time before remaining rounds are skipped |
| Ollama timeout scaling | `baseTimeout × agentCount` | Adjusted for serialized local inference |
| Layer 0 quorum | 100% | Constitutional files require unanimous approval + human sign-off |
| Layer 1 quorum | 75% | Structural files require supermajority + human approval |
| Layer 2 quorum | 50% | Operational files require simple majority; automation allowed |

## Assets

| Resource | Description |
|----------|-------------|
| `council_launches` DB table | Tracks launch state, stage, synthesis text, on-chain txid, chat session |
| `council_launch_logs` DB table | Structured log entries per launch (level + message + detail) |
| `council_discussion_messages` DB table | Per-agent per-round discussion messages |
| `governance_votes` / `governance_member_votes` DB tables | Governance vote tracking with reputation weights |
| AlgoChat `AgentMessenger` | Used for on-chain discussion (`onChainMode: 'full'`) and attestation txid (`'attestation'`) |
