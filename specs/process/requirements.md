---
spec: process-manager.spec.md
---

## User Stories

- As an agent operator, I want to start, stop, and resume agent sessions so that I can control when agents are active and what they work on
- As a team agent, I want my session to automatically manage context windows and trim messages so that I can handle long-running conversations without crashing from context overflow
- As an agent operator, I want tool-use approvals to be queued and resolvable via WebSocket, HTTP, or AlgoChat so that I can review dangerous actions before they execute
- As a platform administrator, I want stalled Ollama sessions to auto-escalate to higher-tier models so that tasks are not permanently blocked by a model that cannot complete them
- As an agent developer, I want the direct-process engine to enforce repeat detection, hallucination detection, and iteration limits so that runaway tool loops are caught and terminated gracefully
- As a team agent, I want to receive context usage and warning events during my session so that I am aware when my context is running low
- As an agent operator, I want session events broadcast via a pub/sub event bus so that WebSocket clients, Discord bridges, and AlgoChat bridges all receive real-time updates
- As a platform administrator, I want approval requests to escalate to a persistent queue if not resolved within the timeout so that no approval is silently lost

## Acceptance Criteria

- `ProcessManager.startProcess` spawns an SDK process (Claude) or direct process (Ollama/Cursor) based on the provider routing configuration, and the session transitions through `starting -> running -> completed` states
- `ApprovalManager` in `paused` mode immediately denies all approval requests; in `queued` mode immediately persists to escalation queue; in `normal` mode waits up to `timeoutMs` before escalating
- `resolveByShortId` validates the sender address against the tracked address and rejects mismatched senders
- Expired escalation requests older than 24 hours are cleaned up on boot and hourly via the expiry timer
- `OwnerQuestionManager.createQuestion` clamps timeouts to [60s, 600s] and persists unanswered questions with status `timeout`
- `SessionEventBus.emit` catches and logs errors from individual subscriber callbacks without affecting delivery to other subscribers
- `startDirectProcess` acquires a provider slot before the agentic loop and releases it in a `finally` block regardless of outcome
- The direct-process agentic loop breaks after `MAX_TOOL_ITERATIONS` (25) turns, after the same normalized tool call repeats 3 times, or after the same tool name is called 5 consecutive times
- `trimMessages` applies progressive compression tiers: Tier 1 at 60% usage, Tier 2 at 75%, Tier 3 at 85%, Tier 4 at 90%
- `context_usage` events are emitted after each turn; `context_warning` events fire once per threshold crossing at 50%, 70%, and 85%
- `OllamaStallEscalator` creates a work task after `OLLAMA_STALL_THRESHOLD` (default 3) consecutive stalled turns on Ollama sessions, and escalates at most once per session
- `spawnCursorProcess` kills the process after `STREAM_IDLE_TIMEOUT_MS` (120s) of no stdout events
- `classifyCursorError` checks permanent stderr patterns (auth/model/config errors) before transient patterns, ensuring permanent failures are never retried
- Hallucinated tool output patterns (`[Tool Result]`, `<<tool_output>>`) in direct-process responses are stripped and a mid-chain nudge is injected, limited to `MAX_MID_CHAIN_NUDGES` (2)

## Constraints

- Permission checks via `ApprovalManager` must not block the event loop; approval resolution uses promise-based async patterns
- Default approval timeout is 120s for AlgoChat sources, 55s for all others
- Direct-process context budget uses `OLLAMA_NUM_CTX` (default 8192) for Ollama models and provider cost-table context windows for Claude models
- Tool result content is capped at 30% of the context window per single result, with a minimum floor of 1,000 characters
- `SessionEventBus` global subscribers are never cleared by `clearAllSessionSubscribers` to protect long-lived service subscriptions
- The `spawnClaudeProcess` function is deprecated; all production sessions route through the SDK or direct process paths

## Out of Scope

- Model selection and routing logic (handled by the providers module)
- Work task lifecycle management (handled by the work module)
- MCP tool definition and handler implementation (handled by the mcp module)
- Credit deduction accounting (handled by the credits subsystem)
- WebSocket transport and HTTP route definitions (handled by the routes/ws modules)
