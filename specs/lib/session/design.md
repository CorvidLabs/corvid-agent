---
spec: response-quality.spec.md
sources:
  - server/lib/agent-session-limits.ts
  - server/lib/session-heartbeat.ts
  - server/lib/wait-sessions.ts
  - server/lib/response-quality.ts
---

## Layout

Session utilities under `server/lib/`, three functional areas:

**Rate limiting:**
- `agent-session-limits.ts` — `AgentSessionLimiter` class and `isSessionRateLimited` helper

**Heartbeat / wait:**
- `session-heartbeat.ts` — exported timing constants only (`HEARTBEAT_INTERVAL_MS`, `IDLE_TIMEOUT_MS`)
- `wait-sessions.ts` — `waitForSessions` with subscribe-first pattern and safety timeout

**Response quality:**
- `response-quality.ts` — `scoreResponseQuality`, `ResponseQualityTracker`, `RepetitiveToolCallDetector`, `RepetitionTracker`

## Components

### AgentSessionLimiter (agent-session-limits.ts)
Per-session instance created once at session start. Resolves `AgentTierConfig` from model name at construction time (immutable for session lifetime). Tracks usage counts for 4 rate-limited tools: `corvid_github_create_pr`, `corvid_github_create_issue`, `corvid_send_message`, `corvid_ask_owner`. `checkAndIncrement` checks current count against tier limit before incrementing; returns error string if over limit, null if allowed.

`canVoteInCouncil` getter delegates to tier config's `canVoteInCouncil` boolean.

### waitForSessions (wait-sessions.ts)
Subscribe-first pattern to close the race window where a process exits between `isRunning` check and subscribe:
1. Subscribe to all session exit events FIRST
2. Check `isRunning` for sessions that might have exited during subscribe
3. Heartbeat polling every 30s catches any remaining missed exits
4. Safety timeout fires at 10 min if all sessions are dead but pending set is non-empty

Cleans up all timers and subscriptions on resolution (success, timeout, or safety timeout).

### ResponseQualityTracker (response-quality.ts)
Stateful tracker for detecting "cheerleading" — model outputs that sound productive but contain no actionable content.

`scoreResponseQuality` computes a 0.0–1.0 score via positive signals (code blocks, file references, concrete identifiers, action items, tool calls) and negative signals (cheerleading phrases, exclamation ratio, restatement, no concrete content).

After `CONSECUTIVE_LOW_QUALITY_TRIGGER` (2) consecutive low-quality responses (below threshold), a quality nudge is suggested. After `MAX_QUALITY_NUDGES` nudges are exhausted, `nudgesExhausted` is set and the session can be terminated.

**RepetitiveToolCallDetector** — fingerprints tool calls by sorted JSON args; triggers after `threshold` (default 3) consecutive identical calls.

**RepetitionTracker** — detects when model rephrases the same content across turns; returns `'nudge'`, `'break'`, or `null`.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| `HEARTBEAT_INTERVAL_MS` | 30,000 ms | Polling interval for safety-net exit detection |
| `IDLE_TIMEOUT_MS` | 600,000 ms | Auto-advance threshold when all sessions are idle |
| `SAFETY_TIMEOUT_MS` | 600,000 ms | `waitForSessions` safety net when all sessions dead but pending |
| `REPETITION_BREAK_THRESHOLD` | 3 | Consecutive repetitions before `RepetitionTracker` signals break |
| Consecutive low quality trigger | 2 | Responses below threshold before nudge is injected |
| Default repetitive tool threshold | 3 | Identical consecutive tool calls before loop detected |

## Assets

No DB tables. No external services. Pure in-process logic. Consumes `ProcessManager` (via dependency injection in `waitForSessions`) and `AgentTierConfig` (from `agent-tiers.ts`).
