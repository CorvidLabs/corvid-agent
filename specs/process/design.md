---
spec: process-manager.spec.md
sources:
  - server/process/manager.ts
  - server/process/mcp-service-container.ts
  - server/process/session-config-resolver.ts
  - server/process/session-resilience-manager.ts
  - server/process/session-timer-manager.ts
  - server/process/resume-prompt-builder.ts
  - server/process/provider-routing.ts
  - server/process/session-exit-handler.ts
  - server/process/event-handler.ts
  - server/process/approval-manager.ts
---

## Module Structure

Ten files under `server/process/`, decomposed from the original monolithic `manager.ts`:

| File | Responsibility |
|------|----------------|
| `manager.ts` | `ProcessManager` class — central orchestrator, public API surface |
| `mcp-service-container.ts` | `McpServiceContainer` — MCP service registration, tool context building |
| `session-config-resolver.ts` | `resolveSessionConfig`, `resolveSessionPrompts`, `resolveToolPermissions` |
| `session-resilience-manager.ts` | `SessionResilienceManager` — API outage pause/resume, crash restart backoff, orphan pruning |
| `session-timer-manager.ts` | `SessionTimerManager` — inactivity timeouts, stable-period timers, fallback checker |
| `resume-prompt-builder.ts` | `buildResumePrompt` — conversation history + observations block construction |
| `provider-routing.ts` | `resolveProviderRouting`, `resolveDirectToolAllowList` — pure routing decision logic |
| `session-exit-handler.ts` | `handleSessionExit`, `saveSessionSummaryToMemory`, `cleanupChatWorktree` |
| `event-handler.ts` | `handleSessionEvent`, `applyCostUpdate`, `broadcastActivityStatus` |
| `approval-manager.ts` | `ApprovalManager` — tool approval queue and normal/queued/paused operational modes |

## Key Subsystems

**Provider routing** (`provider-routing.ts`) — Pure function `resolveProviderRouting()` returns a `RoutingDecision`. Priority order: agent-configured provider → Cursor binary check (fallback to SDK if missing) → Claude access check (fallback to Ollama if no Claude) → `OLLAMA_USE_CLAUDE_PROXY` routing.

**Session resilience** (`session-resilience-manager.ts`) — Tracks paused sessions in a `Map<sessionId, PausedSessionInfo>`. API outage: kills process, sets status to `'paused'`, schedules auto-resume with exponential backoff (5min × 3^n, capped at 60min, max 10 attempts). Crash restart: exponential backoff (5s × 3^n, max 3 restarts). Stable period (10min uptime) resets restart counter.

**Timer management** (`session-timer-manager.ts`) — Separate `Map` for per-session inactivity timeouts and stable-period timers. `extendTimeout` clamps to 4× `AGENT_TIMEOUT_MS`. Fallback polling checker (60s) catches any sessions that survived past their deadline.

**Context reset** — After `MAX_TURNS_BEFORE_CONTEXT_RESET` (8) user messages, the process is killed and resumed with the last 20 messages, each truncated to 2000 chars. A conversation summary observation is saved with `relevanceScore: 2.0`.

**Zero-turn circuit breaker** — If the last 3 completions produced zero turns, `resumeProcess` refuses to start a new process (death loop protection).

## Configuration Values

| Env Var | Default | Description |
|---------|---------|-------------|
| `AGENT_TIMEOUT_MS` | `1800000` (30min) | Per-session inactivity timeout |
| `COUNCIL_MODEL` | (none) | Model override for council chairman |
| `OLLAMA_USE_CLAUDE_PROXY` | `"false"` | Route Ollama agents through SDK |

## Related Resources

**DB tables:** `sessions`, `session_messages` (primary); also reads `agents`, `projects`, `credit_ledger`, `daily_spending`.

**Consumed by:** `server/index.ts`, `server/work/service.ts`, `server/scheduler/service.ts`, `server/routes/sessions.ts`, `server/ws/handler.ts`, `server/algochat/bridge.ts`.
