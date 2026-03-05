---
module: commands
version: 1
status: draft
files:
  - server/algochat/command-handler.ts
  - server/algochat/work-command-router.ts
db_tables:
  - sessions
  - agents
  - credit_ledger
  - councils
  - council_launches
  - agent_schedules
  - schedule_executions
  - agent_messages
depends_on:
  - server/algochat/config.ts
  - server/algochat/response-formatter.ts
  - server/algochat/agent-messenger.ts
  - server/process/manager.ts
  - server/work/service.ts
  - server/db/sessions.ts
  - server/db/agents.ts
  - server/db/credits.ts
  - server/db/councils.ts
  - server/db/schedules.ts
  - server/db/agent-messages.ts
  - server/routes/councils.ts
  - server/scheduler/service.ts
  - server/lib/errors.ts
  - server/lib/logger.ts
  - shared/command-defs.ts
---

# Commands

## Purpose

Processes slash commands from AlgoChat messages and routes work task requests (both from slash commands and agent-to-agent `[WORK]` prefixed messages) through a unified WorkTaskService interface.

## Public API

### Exported Functions

_No standalone exported functions. All functionality is exposed via exported classes and interfaces._

### Exported Types

| Type | Description |
|------|-------------|
| `CommandHandlerContext` | Interface with `findAgentForNewConversation(): string \| null`, `getDefaultProjectId(): string`, and `extendSession(sessionId: string, minutes: number): boolean` |
| `AgentWorkRequestParams` | Interface for agent-to-agent `[WORK]` request parameters: `fromAgentId`, `fromAgentName`, `toAgentId`, `content`, `paymentMicro`, `threadId`, optional `projectId`, `emitMessageUpdate` callback |
| `AgentWorkRequestResult` | Interface with `message: AgentMessage` and `sessionId: string \| null` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `CommandHandler` | Parses, authorizes, and dispatches slash commands from AlgoChat messages; handles `/help`, `/status`, `/stop`, `/agent`, `/queue`, `/approve`, `/deny`, `/mode`, `/credits`, `/history`, `/work`, `/council`, `/extend`, `/schedule` |
| `WorkCommandRouter` | Centralizes work task creation from both slash commands (`/work`) and agent-to-agent `[WORK]` messages; delegates to WorkTaskService |

#### CommandHandler Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database, config: AlgoChatConfig, processManager: ProcessManager, responseFormatter: ResponseFormatter, context: CommandHandlerContext` | `CommandHandler` | Creates handler with all required dependencies |
| `setWorkCommandRouter` | `router: WorkCommandRouter` | `void` | Injects the optional work command router |
| `setAgentMessenger` | `messenger: AgentMessenger` | `void` | Injects the optional agent messenger reference (used for council launches) |
| `setSchedulerService` | `service: SchedulerService` | `void` | Injects the optional scheduler service reference |
| `isOwner` | `participant: string` | `boolean` | Checks if a participant address is in the configured owner set; fail-closed (returns false when no owners configured) |
| `handleCommand` | `participant: string, content: string, responseFn?: (text: string) => void` | `boolean` | Parses and dispatches a slash command; returns `true` if handled, `false` if not a command. When `responseFn` is provided (local/dashboard chat), responses go through it; otherwise responses are sent on-chain |

#### WorkCommandRouter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database` | `WorkCommandRouter` | Creates router with DB reference |
| `setWorkTaskService` | `service: WorkTaskService` | `void` | Injects or updates the WorkTaskService dependency |
| `hasService` | _(getter)_ | `boolean` | Returns whether a WorkTaskService is currently available |
| `handleSlashCommand` | `participant: string, description: string, respond: (text: string) => void, findAgent: () => string \| null` | `void` | Handles `/work <description>` from AlgoChat; creates task, registers completion callback, responds with status/PR URL |
| `handleAgentWorkRequest` | `params: AgentWorkRequestParams` | `Promise<AgentWorkRequestResult>` | Handles `[WORK]` prefix from agent-to-agent messages; creates agent_messages row, delegates to WorkTaskService, registers completion callback that updates message status |

## Invariants

1. Privileged commands (`/stop`, `/approve`, `/deny`, `/mode`, `/work`, `/agent`, `/council`, `/extend`, `/schedule`) require owner authorization; unauthorized attempts are rejected with an error message.
2. Local/dashboard chat (when `responseFn` is provided) bypasses owner authorization checks entirely.
3. `isOwner` is fail-closed: returns `false` when no owner addresses are configured.
4. `handleCommand` returns `false` for messages that do not start with `/`, allowing them to be processed as regular messages.
5. Unknown commands (starting with `/` but not matching any handler) also return `false`.
6. Council creation requires at least 2 agents; the first agent becomes chairman by default.
7. `/extend` clamps minutes to the range [1, 120], defaulting to 30.
8. `/history` limits output to at most 20 transactions.
9. `WorkCommandRouter.handleAgentWorkRequest` always creates an `agent_messages` DB row before attempting task creation; on failure, the message status is set to `'failed'` with error details.
10. Council stage listener has a 45-minute safety timeout to prevent leaks if the council pipeline crashes.
11. Council synthesis responses are truncated to 3000 characters with a note to view the full synthesis on the dashboard.

## Behavioral Examples

### Scenario: Owner sends /status command
- **Given** a participant whose address is in the owner set
- **When** they send `/status`
- **Then** the handler responds with the count of active sessions and conversations, and returns `true`

### Scenario: Non-owner sends privileged command via on-chain
- **Given** a participant whose address is not in the owner set
- **When** they send `/stop session123` via on-chain message (no `responseFn`)
- **Then** the handler responds with "Unauthorized: /stop requires owner access" and returns `true`

### Scenario: Local chat sends privileged command
- **Given** any participant using local/dashboard chat (with `responseFn`)
- **When** they send `/mode paused`
- **Then** authorization is bypassed, operational mode is set to `paused`, and confirmation is sent via `responseFn`

### Scenario: /work command creates task
- **Given** the work command router and WorkTaskService are available, and an agent is found
- **When** owner sends `/work Fix the login page CSS`
- **Then** a work task is created with the description, and the response includes the task ID, branch name, and status; on completion, a follow-up message with the PR URL is sent

### Scenario: Agent-to-agent [WORK] request
- **Given** agent A sends a `[WORK] Implement feature X` message to agent B
- **When** `handleAgentWorkRequest` is called
- **Then** an `agent_messages` row is created, a work task is started for agent B, the message status is updated to `'processing'`, and on completion the message status is updated to `'completed'` or `'failed'`

### Scenario: /council with agent mentions
- **Given** 3 AlgoChat-enabled agents exist: Alice, Bob, Charlie
- **When** owner sends `/council @Alice @Bob -- Discuss the API design`
- **Then** a council is auto-created with Alice and Bob, Alice becomes chairman, and the council is launched with the prompt

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No owner addresses configured | `isOwner` returns `false` for all participants; privileged commands are denied |
| `/stop` with no session ID | Responds with usage message |
| `/stop` for non-running session | Responds with "Session X is not running" |
| `/agent` with unknown name | Responds with "Agent X not found" |
| `/approve` or `/deny` with invalid queue ID | Responds with usage message |
| `/mode` with invalid mode | Responds with list of valid modes (normal, queued, paused) |
| `/work` without WorkCommandRouter | Responds "Work task service not available" |
| `/work` without available agent | Responds "No agent available for work tasks" |
| WorkTaskService.create fails | Error message sent via respond callback |
| `[WORK]` with empty description | Throws `ValidationError` |
| `[WORK]` without WorkTaskService | Throws `NotFoundError` |
| `/council` with fewer than 2 agents available | Responds with error message explaining minimum requirement |
| `/council` with unknown agent mentions | Responds with names not found and lists available agents |
| Council launch fails | Error message sent via respond callback |
| `/schedule run` without scheduler service | Responds "Scheduler service not available" |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/algochat/config.ts` | `AlgoChatConfig` (ownerAddresses, defaultAgentId) |
| `server/algochat/response-formatter.ts` | `ResponseFormatter.sendResponse()` for on-chain responses |
| `server/algochat/agent-messenger.ts` | `AgentMessenger` (injected, used for council launches) |
| `server/algochat/work-command-router.ts` | `WorkCommandRouter` (injected for /work command) |
| `server/process/manager.ts` | `ProcessManager` (getActiveSessionIds, isRunning, stopProcess, approvalManager) |
| `server/work/service.ts` | `WorkTaskService` (create, onComplete) |
| `server/scheduler/service.ts` | `SchedulerService` (injected for /schedule run) |
| `server/db/sessions.ts` | `listConversations`, `getConversationByParticipant` |
| `server/db/agents.ts` | `getAlgochatEnabledAgents` |
| `server/db/credits.ts` | `getBalance`, `getCreditConfig`, `getTransactionHistory` |
| `server/db/councils.ts` | `listCouncils`, `createCouncil`, `getCouncilLaunch` |
| `server/db/schedules.ts` | `listSchedules`, `getSchedule`, `updateSchedule`, `updateScheduleNextRun`, `listExecutions` |
| `server/db/agent-messages.ts` | `createAgentMessage`, `updateAgentMessageStatus`, `getAgentMessage` |
| `server/routes/councils.ts` | `launchCouncil`, `onCouncilStageChange` |
| `server/lib/errors.ts` | `ValidationError`, `NotFoundError` |
| `server/lib/logger.ts` | `createLogger` |
| `shared/command-defs.ts` | `COMMAND_DEFS`, `getCommandDef` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/algochat/bridge.ts` | `CommandHandler` (instantiation, command dispatch), `WorkCommandRouter` (instantiation) |
| `server/algochat/agent-messenger.ts` | `WorkCommandRouter.handleAgentWorkRequest()` for agent-to-agent work delegation |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
