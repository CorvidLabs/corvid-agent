---
module: mcp-tool-handlers
version: 1
status: active
files:
  - server/mcp/tool-handlers/index.ts
  - server/mcp/tool-handlers/types.ts
  - server/mcp/tool-handlers/messaging.ts
  - server/mcp/tool-handlers/memory.ts
  - server/mcp/tool-handlers/session.ts
  - server/mcp/tool-handlers/credits.ts
  - server/mcp/tool-handlers/work.ts
  - server/mcp/tool-handlers/scheduling.ts
  - server/mcp/tool-handlers/workflow.ts
  - server/mcp/tool-handlers/search.ts
  - server/mcp/tool-handlers/github.ts
  - server/mcp/tool-handlers/a2a.ts
  - server/mcp/tool-handlers/owner.ts
  - server/mcp/tool-handlers/notifications.ts
  - server/mcp/tool-handlers/reputation.ts
  - server/mcp/tool-handlers/ast.ts
  - server/mcp/tool-handlers/councils.ts
  - server/mcp/tool-handlers/repo-blocklist.ts
  - server/mcp/tool-handlers/flock-directory.ts
  - server/mcp/tool-handlers/projects.ts
  - server/mcp/tool-handlers/contacts.ts
  - server/mcp/tool-handlers/observations.ts
  - server/mcp/tool-handlers/browser.ts
  - server/mcp/tool-handlers/discord.ts
  - server/mcp/tool-handlers/library.ts
  - server/mcp/tool-handlers/server-ops.ts
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

### Exported Helpers (from types.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `textResult` | `(text: string)` | `CallToolResult` | Wrap text in standard MCP `CallToolResult` format |
| `errorResult` | `(text: string)` | `CallToolResult` | Wrap error message in MCP `CallToolResult` error format |

### Exported Helpers (from github.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `friendlyModelName` | `(model: string)` | `string` | Map a raw model ID (e.g. `claude-opus-4-6`) to a human-friendly name (e.g. `Opus 4.6`) |
| `formatAgentSignature` | `(agent: { name, model } \| null \| undefined)` | `string` | Format an identity footer from an agent object; returns empty string for null/undefined |
| `formatCoAuthoredBy` | `(agent: { name, model } \| null \| undefined)` | `string` | Format a Co-Authored-By git trailer from an agent object; returns empty string for null/undefined |
| `buildAgentSignature` | `(ctx: McpToolContext)` | `string` | Look up agent from DB and build identity footer; returns empty string on failure |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleSendMessage` | `(ctx, { to_agent, message, thread? })` | `Promise<CallToolResult>` | Send agent-to-agent message with dedup and depth check |
| `handleSaveMemory` | `(ctx, { key, content })` | `Promise<CallToolResult>` | Save/update an agent memory (encrypts if mnemonic available) |
| `handlePromoteMemory` | `(ctx, { key })` | `Promise<CallToolResult>` | Promote a short-term memory to on-chain ARC-69 storage |
| `handleRecallMemory` | `(ctx, { query, limit? })` | `Promise<CallToolResult>` | FTS search of agent memories |
| `handleReadOnChainMemories` | `(ctx, { search?, limit? })` | `Promise<CallToolResult>` | Read memories directly from on-chain storage via indexer |
| `handleSyncOnChainMemories` | `(ctx, { limit? })` | `Promise<CallToolResult>` | Sync on-chain memories back to local SQLite cache |
| `handleDeleteMemory` | `(ctx, { key, mode? })` | `Promise<CallToolResult>` | Delete an ARC-69 memory by key. Mode is 'soft' (default) or 'hard' |
| `handleListAgents` | `(ctx, {})` | `Promise<CallToolResult>` | List all agents with status summary |
| `handleExtendTimeout` | `(ctx, { additional_minutes })` | `Promise<CallToolResult>` | Extend current session timeout |
| `handleCheckCredits` | `(ctx, { wallet_address })` | `Promise<CallToolResult>` | Check credit balance for a wallet |
| `handleGrantCredits` | `(ctx, { wallet_address, amount, reference? })` | `Promise<CallToolResult>` | Grant credits to a wallet (privileged) |
| `handleCreditConfig` | `(ctx, { action, key?, value? })` | `Promise<CallToolResult>` | Get or update credit config (privileged) |
| `handleManageSchedule` | `(ctx, { action, ... })` | `Promise<CallToolResult>` | CRUD + approve/deny for agent schedules |
| `handleListProjects` | `(ctx)` | `Promise<CallToolResult>` | List all available projects with IDs, names, and working directories |
| `handleCurrentProject` | `(ctx)` | `Promise<CallToolResult>` | Show the current agent's default project |
| `handleCreateWorkTask` | `(ctx, { description, project_id?, project_name?, model_tier?, agent_id? })` | `Promise<CallToolResult>` | Create a work task (with daily rate limit). Resolves `project_name` to `project_id` if provided. If both are omitted and `ctx.sessionId` is set, uses that session's `projectId` before falling back to the agent's `defaultProjectId` in `WorkTaskService`. `agent_id` delegates execution and attribution to a specific agent |
| `handleCheckWorkStatus` | `(ctx, { task_id })` | `Promise<CallToolResult>` | Check the status of a work task by ID |
| `handleListWorkTasks` | `(ctx, { status?, limit? })` | `Promise<CallToolResult>` | List work tasks for the calling agent, optionally filtered by status |
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
| `handleLaunchCouncil` | `(ctx, { topic, agentIds?, chairmanAgentId?, discussionRounds?, governanceTier? })` | `Promise<CallToolResult>` | Launch a multi-agent council deliberation. Requires `processManager` in context |
| `handleManageRepoBlocklist` | `(ctx, { action, repo?, reason?, source? })` | `Promise<CallToolResult>` | Manage the repo blocklist: list, add, remove, or check entries |
| `handleFlockDirectory` | `(ctx, { action, agent_id?, address?, name?, description?, instance_url?, capabilities?, query?, capability?, min_reputation?, sort_by?, sort_order?, limit? })` | `Promise<CallToolResult>` | Flock Directory operations: register, deregister, heartbeat, lookup, search, list, stats, sync, compute_reputation, health_overview |
| `handleLookupContact` | `(ctx, { name?, platform?, platform_id? })` | `Promise<CallToolResult>` | Look up a contact by display name or by platform + platform_id; returns all known platform links for the matched contact |
| `handleRecordObservation` | `(ctx, { content, source?, source_id?, suggested_key?, relevance_score? })` | `Promise<CallToolResult>` | Record a short-term observation for potential graduation to long-term memory |
| `handleListObservations` | `(ctx, { status?, source?, query?, limit? })` | `Promise<CallToolResult>` | List or search observations with optional filters |
| `handleBoostObservation` | `(ctx, { id, score_boost? })` | `Promise<CallToolResult>` | Boost an observation's relevance score |
| `handleDismissObservation` | `(ctx, { id })` | `Promise<CallToolResult>` | Dismiss an observation to prevent graduation |
| `handleObservationStats` | `(ctx)` | `Promise<CallToolResult>` | Get observation count statistics by status |
| `handleDiscordSendMessage` | `(ctx, { channel_id, message, reply_to? })` | `Promise<CallToolResult>` | Send a text message to a Discord channel by ID |
| `handleDiscordSendImage` | `(ctx, { channel_id, image_base64, filename?, content_type?, message? })` | `Promise<CallToolResult>` | Send an image (base64) to a Discord channel, optionally with a text message |
| `handleBrowser` | `(ctx, { action, tab_id?, url?, query?, selector?, code?, text?, key?, value?, direction?, amount?, x?, y?, full_page?, max_length?, ms? })` | `Promise<CallToolResult>` | Browser automation via Playwright: tab management, navigation, reading, interaction, screenshots, JS execution |
| `handleLibraryWrite` | `(ctx, { key, content, category?, tags? })` | `Promise<CallToolResult>` | Create or update a shared library entry. Saves to SQLite and mints/updates a CRVLIB ASA on localnet |
| `handleLibraryRead` | `(ctx, { key?, query?, category?, tag?, limit? })` | `Promise<CallToolResult>` | Read a library entry by key, or search/list entries with optional filters |
| `handleLibraryListOnChain` | `(ctx, { category?, tag?, limit? })` | `Promise<CallToolResult>` | List all on-chain CRVLIB entries — reads blockchain directly via indexer |
| `handleLibraryDelete` | `(ctx, { key, mode? })` | `Promise<CallToolResult>` | Delete a shared library entry. Mode is 'soft' (default, archived) or 'hard' (destroyed) |
| `handleRestartServer` | `(ctx, { reason? })` | `Promise<CallToolResult>` | Safe, idempotent server restart. First call sets `server_restart_initiated_at` and exits with code 75. Post-restart call clears the flag and confirms success |

## Invariants

1. **Invocation depth limit**: `MAX_INVOKE_DEPTH = 3`. `handleSendMessage` and `handleInvokeRemoteAgent` check `ctx.depth` and reject if exceeded, preventing circular invocation deadlocks
2. **Message dedup**: `handleSendMessage` deduplicates by agent pair + first 200 chars of message within a 30-second window (`DEDUP_WINDOW_MS = 30,000`)
3. **Work task daily rate limit**: `handleCreateWorkTask` enforces `WORK_TASK_MAX_PER_DAY` (default 100). Checked by counting today's tasks for the agent
4. **Memory encryption**: `handleSaveMemory` encrypts content with the server mnemonic when available (except on localnet without a mnemonic)
5. **Privileged tools**: `handleGrantCredits` and `handleCreditConfig` are not in the default allowed set — they require explicit `mcp_tool_permissions` grant
6. **All handlers return `CallToolResult`**: Every handler returns `{ content: [{ type: 'text', text }] }` via `textResult()` or `errorResult()` helpers
7. **Service availability checks**: Handlers check for optional services (e.g. `ctx.workTaskService`, `ctx.schedulerService`) before use and return error results if missing
8. **Status emission**: Long-running handlers call `ctx.emitStatus?.()` to provide progress updates to the UI
9. **Agent identity signature**: GitHub write operations (`handleGitHubCreatePr`, `handleGitHubCreateIssue`, `handleGitHubCommentOnPr`, `handleGitHubReviewPr`) append an agent identity footer to the body via `buildAgentSignature()`. If the agent cannot be resolved, no signature is appended (fail-open)

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
| `server/db/repo-blocklist.ts` | `listRepoBlocklist`, `addToRepoBlocklist`, `removeFromRepoBlocklist`, `isRepoBlocked` |
| `server/db/contacts.ts` | `findContactByName`, `findContactByPlatformId` |
| `server/discord/embeds.ts` | `sendDiscordMessage`, `sendMessageWithFiles` |
| `server/lib/delivery-tracker.ts` | `getDeliveryTracker` |
| `server/db/observations.ts` | `recordObservation`, `listObservations`, `searchObservations`, `boostObservation`, `dismissObservation`, `countObservations` |

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
| 2026-02-24 | corvid-agent | Updated files list after refactor into domain-specific modules (#233) |
| 2026-03-19 | corvid-agent | Documented observation tool handlers |
| 2026-03-20 | corvid-agent | Added handleBrowser and browser.ts |
| 2026-03-23 | corvid-agent | Added Discord messaging tools: handleDiscordSendMessage, handleDiscordSendImage (#1422) |
| 2026-03-27 | corvid-agent | Added agent identity signature to GitHub write operations (#1555) |
| 2026-03-27 | corvid-agent | Added library tool handlers and library.ts to files list |
