---
spec: process-manager.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/process-manager-cleanup.test.ts` | Unit | `cleanupSessionState` idempotency, memory map cleanup |
| `server/__tests__/process-manager-death-loop.test.ts` | Unit | Zero-turn circuit breaker (3 consecutive zero-turn completions blocks resume) |
| `server/__tests__/process-manager-external-mcp.test.ts` | Unit | External MCP server integration in session config |
| `server/__tests__/process-manager-metrics.test.ts` | Unit | `getMemoryStats()` map size reporting |
| `server/__tests__/process-manager-sendmessage.test.ts` | Unit | `sendMessage` to running/non-running sessions |
| `server/__tests__/process-manager-startup-timeout.test.ts` | Unit | Startup timeout enforcement |
| `server/__tests__/session-resilience-manager.test.ts` | Unit | API outage pause/resume, crash restart backoff, max restarts exceeded, orphan pruning |
| `server/__tests__/session-timer-manager.test.ts` | Unit | Inactivity timeout, stable timer, `extendTimeout` clamping, fallback checker |
| `server/__tests__/session-config-resolver.test.ts` | Unit | Persona/skill prompt injection, tool permission chain resolution |
| `server/__tests__/provider-routing.test.ts` | Unit | All routing decision branches (Cursor missing, no Claude, Ollama proxy) |
| `server/__tests__/approval-manager.test.ts` | Unit | Approval queue, mode transitions (normal/queued/paused), approve/deny |
| `server/__tests__/mcp-service-container.test.ts` | Unit | Service registration, tool context building |
| `server/__tests__/session-lifecycle.test.ts` | Integration | Full session start → event → stop lifecycle |
| `server/__tests__/context-management.test.ts` | Integration | Context reset after 8 turns, resume prompt construction |
| `server/__tests__/session-resume-observations.test.ts` | Unit | Relevant observations injected into resume prompt |
| `server/__tests__/resilience.test.ts` | Integration | API outage detection and auto-resume end-to-end |

## Manual Testing

- [ ] Start an agent session, send 8 messages, and confirm the 9th triggers a context reset with a new process
- [ ] Kill the Anthropic API connectivity mid-session and confirm the session pauses then auto-resumes
- [ ] Configure a Cursor provider with a missing binary and confirm fallback to SDK process
- [ ] Set `OLLAMA_USE_CLAUDE_PROXY=true` and start an Ollama agent; confirm it routes through SDK
- [ ] Trigger 3 consecutive zero-turn completions and confirm the next resume attempt is rejected
- [ ] Let a session exceed `AGENT_TIMEOUT_MS` and confirm it is stopped automatically

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `startProcess` when a process already runs for that session | Existing process killed before new one starts |
| `resumeProcess` for a session with no process | Fresh process started with resume prompt |
| `sendMessage` to a non-running session | Returns `false` |
| Project not found for session | `not_found` error event emitted; process not started |
| AlgoChat session exits with code 1 (third time) | After 3 restarts, session left in error state; no more retries |
| API outage during active session — 10 auto-resume attempts fail | Session set to `error`; `auto_resume_exhausted` event emitted |
| Credits exhausted for AlgoChat session | `credits_exhausted` error emitted; session stopped |
| `extendTimeout` beyond 4× `AGENT_TIMEOUT_MS` | Clamped to 4× maximum |
| Orphan prune finds session with no process and not paused | Subscriber and meta entries removed from maps |
| Cursor `result` event emitted | Not broadcast to subscribers (only `session_turn_metrics` events persisted) |
