---
spec: tool-handlers.spec.md
sources:
  - server/mcp/tool-handlers/index.ts
  - server/mcp/tool-handlers/types.ts
  - server/mcp/tool-handlers/messaging.ts
  - server/mcp/tool-handlers/cross-channel-guard.ts
  - server/mcp/tool-handlers/memory.ts
  - server/mcp/tool-handlers/session.ts
  - server/mcp/tool-handlers/credits.ts
  - server/mcp/tool-handlers/github.ts
  - server/mcp/tool-handlers/a2a.ts
---

## Module Structure

`server/mcp/tool-handlers/` is a domain-partitioned handler layer. Each file contains the business logic for a related group of `corvid_*` tools. All handlers share the `McpToolContext` type and the `textResult`/`errorResult` helpers from `types.ts`.

| Handler File | Domain | Key Tools |
|-------------|--------|-----------|
| `messaging.ts` | Inter-agent messaging | `corvid_send_message` |
| `cross-channel-guard.ts` | Routing enforcement | `checkCrossChannelSend`, `isChannelBoundSource` |
| `memory.ts` | Memory operations | `corvid_save_memory`, `corvid_recall_memory`, `corvid_read_on_chain_memories`, `corvid_sync_on_chain_memories`, `corvid_delete_memory`, `corvid_promote_memory` |
| `session.ts` | Session management | `corvid_list_agents`, `corvid_extend_timeout` |
| `credits.ts` | Credit management | `corvid_check_credits`, `corvid_grant_credits`, `corvid_credit_config` |
| `work.ts` | Work tasks | `corvid_create_work_task`, `corvid_check_work_status`, `corvid_list_work_tasks` |
| `scheduling.ts` | Schedule CRUD | `corvid_manage_schedule` |
| `workflow.ts` | Workflow CRUD | `corvid_manage_workflow` |
| `search.ts` | Web search | `corvid_web_search`, `corvid_deep_research` |
| `github.ts` | GitHub operations | `corvid_github_*` (9 tools) + identity helpers |
| `a2a.ts` | Agent-to-agent protocol | `corvid_discover_agent`, `corvid_invoke_remote_agent` |
| `owner.ts` | Owner communication | `corvid_notify_owner`, `corvid_ask_owner` |
| `notifications.ts` | Notification config | `corvid_configure_notifications` |
| `reputation.ts` | Reputation & attestation | `corvid_check_reputation`, `corvid_check_health_trends`, `corvid_publish_attestation`, `corvid_verify_agent_reputation` |
| `ast.ts` | Code analysis | `corvid_code_symbols`, `corvid_find_references` |
| `councils.ts` | Multi-agent deliberation | `corvid_launch_council` |
| `repo-blocklist.ts` | Repository blocklist | `corvid_manage_repo_blocklist` |
| `flock-directory.ts` | Agent directory | `corvid_flock_directory` |
| `projects.ts` | Project management | `corvid_list_projects`, `corvid_current_project` |
| `contacts.ts` | Contact lookup | `corvid_lookup_contact` |
| `observations.ts` | Short-term memory | `corvid_record_observation`, `corvid_list_observations`, `corvid_boost_observation`, `corvid_dismiss_observation`, `corvid_observation_stats` |
| `browser.ts` | Browser automation | `corvid_browser` |
| `discord.ts` | Discord messaging | `corvid_discord_send_message`, `corvid_discord_send_image` |
| `library.ts` | Shared library | `corvid_library_write`, `corvid_library_read`, `corvid_library_list`, `corvid_library_delete` |
| `server-ops.ts` | Server management | `corvid_restart_server` |

## Key Classes and Subsystems

### McpToolContext (types.ts)
The shared context object threaded through every handler call. Contains: `agentId`, `db` (SQLite Database), session metadata (`sessionId`, `sessionSource`, `depth`), optional service references (`workTaskService`, `schedulerService`, `processManager`, `browserService`, `astParserService`), `schedulerMode` and `schedulerActionType`, and `emitStatus` callback for progress updates.

### Cross-Channel Guard (cross-channel-guard.ts)
Detects when an agent in a channel-bound session (Discord, Telegram) attempts to route messages through `corvid_send_message`. Logs a structured warning and returns an advisory string that is appended to the tool result. Enforcement is advisory — the message is still delivered, but the agent is reminded to reply in the originating channel.

Channel-bound sources: `discord`, `telegram`
Non-channel-bound sources: `web`, `algochat`, `agent`, `undefined`

### GitHub Identity Helpers (github.ts)
Exported for reuse by other modules:
- `friendlyModelName()` — maps raw model IDs to human-readable names
- `formatAgentSignature()` / `formatCoAuthoredBy()` — produce identity footers
- `buildAgentSignature()` — looks up agent from DB and builds a full signature footer appended to all GitHub write operations (PRs, issues, PR comments, reviews)

### Rate Limits and Depth Control
| Constant | Value | Scope |
|----------|-------|-------|
| `MAX_INVOKE_DEPTH` | 3 | `handleSendMessage`, `handleInvokeRemoteAgent` |
| `DEDUP_WINDOW_MS` | 30,000ms | `handleSendMessage` duplicate suppression |
| `WORK_TASK_MAX_PER_DAY` | 100 (env) | `handleCreateWorkTask` daily limit per agent |

## Configuration Values and Constants

| Env Var | Default | Description |
|---------|---------|-------------|
| `WORK_TASK_MAX_PER_DAY` | `100` | Max work tasks an agent can create per calendar day |

## Related Resources

| Resource | Description |
|----------|-------------|
| `server/mcp/sdk-tools.ts` | Imports all handler functions and wires them to MCP tool definitions with Zod schemas |
| `server/db/agent-memories.ts` | Memory CRUD consumed by `memory.ts` |
| `server/db/credits.ts` | Credit operations consumed by `credits.ts` |
| `server/github/operations.ts` | GitHub API client consumed by `github.ts` |
| `server/a2a/client.ts` | A2A protocol client consumed by `a2a.ts` |
| `server/discord/embeds.ts` | Discord message sending consumed by `discord.ts` |
| `server/db/observations.ts` | Short-term observation CRUD consumed by `observations.ts` |
