---
module: mcp-tool-handlers
version: 1
status: active
files:
  - server/mcp/tool-handlers/index.ts
  - server/mcp/tool-handlers/types.ts
db_tables: []
depends_on:
  - specs/db/credits.spec.md
  - specs/work/work-task-service.spec.md
  - specs/scheduler/scheduler-service.spec.md
---

# MCP Tool Handlers

## Purpose

Implements every `corvid_*` MCP tool handler. Each exported function takes an `McpToolContext` plus tool-specific arguments and returns a `CallToolResult`. This is the business logic layer for all agent tools — messaging, memory, credits, GitHub operations, scheduling, workflows, reputation, and inter-agent invocation.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `McpToolContext` | Context object passed to every handler: agentId, db, services, session metadata |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleSendMessage` | `(ctx, { to_agent, message, thread? })` | `Promise<CallToolResult>` | Send agent-to-agent message with dedup and depth check |
| `handleSaveMemory` | `(ctx, { key, content })` | `Promise<CallToolResult>` | Save/update an agent memory (encrypts if mnemonic available) |
| `handleRecallMemory` | `(ctx, { query, limit? })` | `Promise<CallToolResult>` | FTS search of agent memories |
| `handleListAgents` | `(ctx, {})` | `Promise<CallToolResult>` | List all agents with status summary |
| `handleExtendTimeout` | `(ctx, { additional_minutes })` | `Promise<CallToolResult>` | Extend current session timeout |
| `handleCheckCredits` | `(ctx, { wallet_address })` | `Promise<CallToolResult>` | Check credit balance for a wallet |
| `handleGrantCredits` | `(ctx, { wallet_address, amount, reference? })` | `Promise<CallToolResult>` | Grant credits to a wallet (privileged) |
| `handleCreditConfig` | `(ctx, { action, key?, value? })` | `Promise<CallToolResult>` | Get or update credit config (privileged) |
| `handleManageSchedule` | `(ctx, { action, ... })` | `Promise<CallToolResult>` | CRUD + approve/deny for agent schedules |
| `handleCreateWorkTask` | `(ctx, { description, project_id? })` | `Promise<CallToolResult>` | Create a work task (with daily rate limit) |
| `handleWebSearch` | `(ctx, { query, count? })` | `Promise<CallToolResult>` | Web search via Brave API |
| `handleDeepResearch` | `(ctx, { query, queries? })` | `Promise<CallToolResult>` | Multi-query deep research via Brave |
| `handleDiscoverAgent` | `(ctx, { query })` | `Promise<CallToolResult>` | Discover remote agents via A2A protocol |
| `handleNotifyOwner` | `(ctx, { title?, message, level? })` | `Promise<CallToolResult>` | Send notification to owner via configured channels |
| `handleAskOwner` | `(ctx, { question, options?, context?, timeout_seconds? })` | `Promise<CallToolResult>` | Ask owner a blocking question and wait for answer |
| `handleConfigureNotifications` | `(ctx, { action, channel_type?, config?, enabled? })` | `Promise<CallToolResult>` | CRUD for notification channel configs |
| `handleGitHubStarRepo` | `(ctx, { repo })` | `Promise<CallToolResult>` | Star a GitHub repository |
| `handleGitHubUnstarRepo` | `(ctx, { repo })` | `Promise<CallToolResult>` | Unstar a GitHub repository |
| `handleGitHubForkRepo` | `(ctx, { repo })` | `Promise<CallToolResult>` | Fork a GitHub repository |
| `handleGitHubListPrs` | `(ctx, { repo, state? })` | `Promise<CallToolResult>` | List pull requests for a repo |
| `handleGitHubCreatePr` | `(ctx, { repo, title, body, head, base? })` | `Promise<CallToolResult>` | Create a pull request |
| `handleGitHubReviewPr` | `(ctx, { repo, pr_number, body, event? })` | `Promise<CallToolResult>` | Review a pull request |
| `handleGitHubCreateIssue` | `(ctx, { repo, title, body? })` | `Promise<CallToolResult>` | Create a GitHub issue |
| `handleGitHubListIssues` | `(ctx, { repo, state?, labels? })` | `Promise<CallToolResult>` | List issues for a repo |
| `handleGitHubRepoInfo` | `(ctx, { repo })` | `Promise<CallToolResult>` | Get repository metadata |
| `handleGitHubGetPrDiff` | `(ctx, { repo, pr_number })` | `Promise<CallToolResult>` | Get the diff for a pull request |
| `handleGitHubCommentOnPr` | `(ctx, { repo, pr_number, body })` | `Promise<CallToolResult>` | Comment on a pull request |
| `handleGitHubFollowUser` | `(ctx, { username })` | `Promise<CallToolResult>` | Follow a GitHub user |
| `handleManageWorkflow` | `(ctx, { action, ... })` | `Promise<CallToolResult>` | CRUD + run/cancel for workflows |
| `handleCheckReputation` | `(ctx, { agent_id? })` | `Promise<CallToolResult>` | Check agent reputation score |
| `handleCheckHealthTrends` | `(ctx, { project_id, days? })` | `Promise<CallToolResult>` | Check codebase health trends |
| `handlePublishAttestation` | `(ctx, {})` | `Promise<CallToolResult>` | Compute and publish on-chain reputation attestation |
| `handleVerifyAgentReputation` | `(ctx, { agent_url })` | `Promise<CallToolResult>` | Verify a remote agent's reputation attestation |
| `handleInvokeRemoteAgent` | `(ctx, { agent_url, message })` | `Promise<CallToolResult>` | Invoke a remote agent via A2A protocol |
| `handleCodeSymbols` | `(ctx, { project_id?, path?, query? })` | `Promise<CallToolResult>` | Search code symbols (functions, classes, types) in a project using AST parsing |
| `handleFindReferences` | `(ctx, { project_id?, symbol, path? })` | `Promise<CallToolResult>` | Find references to a symbol across project files using AST parsing |

## Invariants

1. **Invocation depth limit**: `MAX_INVOKE_DEPTH = 3`. `handleSendMessage` and `handleInvokeRemoteAgent` check `ctx.depth` and reject if exceeded, preventing circular invocation deadlocks
2. **Message dedup**: `handleSendMessage` deduplicates by agent pair + first 200 chars of message within a 30-second window (`DEDUP_WINDOW_MS = 30,000`)
3. **Work task daily rate limit**: `handleCreateWorkTask` enforces `WORK_TASK_MAX_PER_DAY` (default 100). Checked by counting today's tasks for the agent
4. **Memory encryption**: `handleSaveMemory` encrypts content with the server mnemonic when available (except on localnet without a mnemonic)
5. **Privileged tools**: `handleGrantCredits` and `handleCreditConfig` are not in the default allowed set — they require explicit `mcp_tool_permissions` grant
6. **All handlers return `CallToolResult`**: Every handler returns `{ content: [{ type: 'text', text }] }` via `textResult()` or `errorResult()` helpers
7. **Service availability checks**: Handlers check for optional services (e.g. `ctx.workTaskService`, `ctx.schedulerService`) before use and return error results if missing
8. **Status emission**: Long-running handlers call `ctx.emitStatus?.()` to provide progress updates to the UI

## Behavioral Examples

### Scenario: Send message with dedup

- **Given** agent A sends "Hello" to agent B
- **When** `handleSendMessage` is called
- **Then** the message is delivered and a dedup key is recorded
- **When** the same message is sent again within 30 seconds
- **Then** returns success with "(duplicate suppressed)" note

### Scenario: Work task rate limit hit

- **Given** an agent has created 100 work tasks today (`WORK_TASK_MAX_PER_DAY = 100`)
- **When** `handleCreateWorkTask` is called
- **Then** returns an error result: "Rate limit exceeded: maximum 100 work tasks per day."

### Scenario: Invocation depth exceeded

- **Given** a handler context with `depth = 3` and `MAX_INVOKE_DEPTH = 3`
- **When** `handleSendMessage` is called
- **Then** returns error: "Cannot send message: invocation depth 3 exceeds maximum of 3."

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Service not available (workTaskService, schedulerService, etc.) | Returns error result with descriptive message |
| Invocation depth exceeded | Returns error with depth limit message |
| Rate limit exceeded (work tasks) | Returns error with rate limit message |
| Invalid arguments | Returns error result (handler-specific validation) |
| GitHub API failure | Returns error result with GitHub error message |
| Web search failure | Returns error result with search error |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/agent-memories.ts` | `saveMemory`, `recallMemory`, `searchMemories`, `listMemories`, `updateMemoryTxid`, `updateMemoryStatus` |
| `server/db/credits.ts` | `getBalance`, `getCreditConfig`, `grantCredits`, `updateCreditConfig` |
| `server/db/schedules.ts` | `listSchedules`, `createSchedule`, `updateSchedule`, `listExecutions` |
| `server/db/workflows.ts` | `listWorkflows`, `createWorkflow`, `updateWorkflow`, `getWorkflow`, `listWorkflowRuns`, `getWorkflowRun` |
| `server/db/notifications.ts` | `listChannelsForAgent`, `upsertChannel`, `updateChannelEnabled`, `deleteChannel`, `getChannelByAgentAndType` |
| `server/scheduler/service.ts` | `validateScheduleFrequency` |
| `server/github/operations.ts` | `starRepo`, `forkRepo`, `listOpenPrs`, `createPr`, etc. |
| `server/lib/web-search.ts` | `braveWebSearch`, `braveMultiSearch` |
| `server/lib/crypto.ts` | `encryptMemoryContent` |
| `server/a2a/client.ts` | `discoverAgent`, `invokeRemoteAgent` |
| `server/improvement/health-store.ts` | `getRecentSnapshots`, `computeTrends`, `formatTrendsForPrompt` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/sdk-tools.ts` | All handler functions are imported and wired to MCP tool definitions |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `WORK_TASK_MAX_PER_DAY` | `100` | Maximum work tasks an agent can create per day |

Internal constants (not env-configurable):

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_INVOKE_DEPTH` | `3` | Maximum agent-to-agent invocation depth |
| `DEDUP_WINDOW_MS` | `30000` | 30-second dedup window for message sends |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
| 2026-02-24 | corvid-agent | Update files to reflect tool-handlers split into domain modules (PR #233) |
