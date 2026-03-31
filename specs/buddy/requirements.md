---
spec: service.spec.md
---

## User Stories

- As an agent operator, I want to pair a lead agent with a buddy agent for review so that work output gets a second opinion before being finalized
- As an agent operator, I want buddy review rounds visible in Discord as colored embeds so that I can observe the lead-buddy conversation in real time
- As a team agent, I want to review another agent's work with read-only tools (Read, Glob, Grep) so that I can inspect code without accidentally modifying it
- As an agent operator, I want the buddy to short-circuit the review by saying "LGTM" so that simple approvals do not consume unnecessary rounds
- As a platform administrator, I want buddy rounds capped at a configurable maximum (1-10, default 3) so that runaway review loops are prevented

## Acceptance Criteria

- `BuddyService.startSession()` validates that lead and buddy agent IDs differ; throws `Error: Lead and buddy agent cannot be the same` if equal
- `startSession()` throws if either agent ID is not found in the database (`Error: Lead agent not found: <id>` or `Error: Buddy agent not found: <id>`)
- `maxRounds` is clamped to [1, 10] and defaults to 3 if not provided
- The conversation loop runs asynchronously after `startSession()` returns; callers receive the session record immediately
- Each agent turn has a 5-minute safety timeout; if exceeded, the process is stopped and partial output is used
- Early approval detection: buddy responses under 300 characters containing "lgtm", "approved", or similar keywords (without negative qualifiers like "not approved", "but", "however", "issues") end the loop early
- Buddy sessions use `toolAllowList` with `BUDDY_DEFAULT_TOOLS` (Read, Glob, Grep); MCP servers are not loaded for restricted-tool sessions
- Optional `onRoundComplete: BuddyRoundCallback` is called after every agent turn (both lead and buddy); callback errors are logged but do not break the loop
- The `approved` field in `BuddyRoundEvent` is `true` only on the final buddy turn when the buddy approves; all other rounds have `approved: false`
- `onSessionUpdate` registers callbacks for session status changes; returns an unsubscribe function
- If the conversation loop throws, session status is set to `failed` and an update event is emitted
- If the buddy fails to respond, the loop breaks and the session completes with the last lead output
- Discord visibility: when `onRoundComplete` is provided by the Discord caller, lead outputs use the agent's `displayColor` and buddy outputs use a distinct color (purple/magenta `0x9b59b6`)

## Constraints

- Buddy mode is intentionally lighter than councils: no voting, no synthesis, just a request-response loop
- Buddy agents get read-only tools only; they cannot modify files, push code, or run destructive commands
- The callback (`onRoundComplete`) is async fire-and-forget within each round; there is no timeout on the callback itself
- Session records are persisted to the database via `createBuddySession`, `updateBuddySessionStatus`, `addBuddyMessage`

## Out of Scope

- Multi-buddy review (only one buddy per session; use councils for multi-agent review)
- Buddy agent selection heuristics (the caller explicitly chooses lead and buddy)
- Automatic buddy assignment based on agent expertise or availability
- Buddy mode for non-code tasks (designed for code review workflows)
- Persistent buddy pairings or buddy preferences
