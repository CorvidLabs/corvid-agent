---
spec: councils.spec.md
---

## Product Requirements

- Multiple agents can discuss a problem together in a structured council, deliberate across several rounds, and then vote on the best solution — similar to a committee reaching a decision.
- Higher-reputation agents carry more weight in votes, so the most trusted contributors have proportionally greater influence on outcomes.
- Critical system changes require unanimous agreement and human approval before they can proceed, preventing any single agent from making unauthorized changes.
- If a council gets stuck or takes too long, operators can abort it and still receive a summary of what was discussed so far.
- After a council finishes, operators can continue the conversation with the lead agent to ask follow-up questions about the decision.

## User Stories

- As an agent operator, I want to launch multi-agent council deliberations so that complex decisions benefit from diverse agent perspectives
- As a team agent, I want to participate in council discussions across multiple rounds so that I can refine my position based on other agents' arguments
- As a platform administrator, I want governance votes to use reputation-weighted voting so that higher-reputation agents have proportionally more influence on structural decisions
- As an agent operator, I want to follow up with the chairman agent after a council completes so that I can ask clarifying questions about the synthesis
- As a platform administrator, I want Layer 0 (Constitutional) changes to require 100% quorum and human-only approval so that critical system files cannot be modified without full oversight
- As an agent operator, I want to abort a running council and get aggregated partial results so that stuck deliberations do not block progress indefinitely

## Acceptance Criteria

- `launchCouncil` validates council and project IDs (throws `NotFoundError` if missing), creates a launch record, starts member sessions in parallel, and sets up an auto-advance watcher
- Council stage transitions follow the pipeline: `responding -> discussing -> reviewing -> synthesizing -> complete`; stages cannot be skipped except when `discussionRounds` is 0 (skips `discussing`)
- `triggerReview` requires the launch to be in `responding` or `discussing` stage; `triggerSynthesis` requires `reviewing` stage; violations return `{ ok: false, status: 400 }`
- `abortCouncil` kills all running sessions, aggregates available responses, marks the launch as `complete`, and returns the kill count; attempting to abort an already-complete launch returns `{ ok: false, status: 400 }`
- `startCouncilChat` requires `complete` stage with a non-null synthesis; creates a new chairman session or resumes an existing one
- Per-agent round timeout is 10 minutes; for local Ollama agents the timeout scales by agent count; hard cap is 3 hours total
- `waitForSessions` resolves with partial results (`{ completed, timedOut }`) on timeout rather than rejecting
- Discussion prompts instruct agents to take clear positions, add new information, and avoid repetition
- `aggregateSessionResponses` prefers reviewer sessions over member sessions when both exist
- On-chain discussion messages are sent only when council `onChainMode` is `'full'`; attestation (SHA-256 hash of synthesis) is published when `onChainMode` is `'attestation'`
- `classifyPath` assigns governance tiers: Layer 0 for constitutional files (spending.ts, schema.ts, governance.ts, .env), Layer 1 for structural files (package.json, CLAUDE.md, migrations), Layer 2 for operational files
- `evaluateWeightedVote` uses each agent's reputation score (0-100, default 50 if unavailable) as vote weight; Layer 2 requires 50% weighted approval, Layer 1 requires 75% + human approval, Layer 0 requires 100% + human-only
- Councils can configure `quorumThreshold` (0.0-1.0) to override the governance tier default
- All stage changes, logs, and discussion messages are broadcast to registered listeners for WebSocket forwarding
- If discussion rounds fail entirely, the system falls through to trigger review as a recovery mechanism

## Constraints

- Layer 0 paths cannot be modified by automation; `checkAutomationAllowed` blocks Layer 0 and Layer 1 paths
- Auto-advance watchers subscribe to process events before checking `isRunning` to close the race window
- Infrastructure callbacks (emitLog, broadcastStageChange) are injected via dependency injection for testability
- On-chain discussion messages are fire-and-forget via `sendOnChainBestEffort`
- The chairman synthesis prompt includes governance vote weights for governance launches

## Out of Scope

- Council configuration CRUD (handled by the database and routes modules)
- Agent session spawning mechanics (delegated to ProcessManager)
- WebSocket transport implementation (handled by the ws module)
- Proposal lifecycle management beyond vote evaluation
- Cross-council coordination or hierarchical council structures
