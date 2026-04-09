---
module: coding-tools
version: 3
status: draft
files:
  - server/mcp/coding-tools.ts
  - server/mcp/direct-tools.ts
db_tables: []
depends_on:
  - specs/mcp/tools/tool-handlers.spec.md
---

# Coding Tools & Direct Tool Definitions

## Purpose

Provides file I/O, shell execution, and search tools for the direct execution engine (Ollama agents), plus the orchestration layer that assembles all tool definitions (MCP-based and coding) into a filtered, permission-aware set of `DirectToolDefinition` objects consumable by LLM providers.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `buildSafeEnvForCoding` | (none) | `Record<string, string>` | Builds an allowlisted subset of `process.env` safe for spawned coding commands (PATH, HOME, git vars, etc.). |
| `buildCodingTools` | `ctx: CodingToolContext` | `DirectToolDefinition[]` | Returns an array of six tool definitions (read_file, write_file, edit_file, run_command, list_files, search_files) bound to the given working directory and env. |
| `buildDirectTools` | `ctx: McpToolContext \| null, codingCtx?: CodingToolContext` | `DirectToolDefinition[]` | Assembles the full tool set: MCP-based corvid_* tools (messaging, memory, library, credits, projects, work tasks, scheduling, workflows, web search, GitHub, AST, repo blocklist, flock directory, server ops) plus coding tools when `codingCtx` is provided. Applies permission filtering based on agent config, resolved permissions, session source, scheduler mode, and tool guardrails. |
| `toProviderTools` | `tools: DirectToolDefinition[]` | `LlmToolDefinition[]` | Strips handler functions from DirectToolDefinitions, returning provider-friendly `{ name, description, parameters }` objects. |

### Exported Types

| Type | Description |
|------|-------------|
| `CodingToolContext` | Configuration for coding tools: `{ workingDir: string; env: Record<string, string> }` |
| `DirectToolDefinition` | A tool definition with JSON Schema parameters and an async handler: `{ name: string; description: string; parameters: Record<string, unknown>; handler: (args) => Promise<{ text: string; isError?: boolean }> }` |

## Tool Definitions

These are tool name strings returned by `buildCodingTools` and `buildDirectTools`, not standalone code exports.

### Coding Tools (returned by `buildCodingTools`)

| Tool Name | Parameters | Description |
|-----------|-----------|-------------|
| `read_file` | `path` (required), `offset?`, `limit?` | Read file contents with optional line range. Returns numbered lines, output truncated to 8000 chars. |
| `write_file` | `path` (required), `content` (required) | Create or overwrite a file. Creates parent directories. Rejects protected paths. |
| `edit_file` | `path` (required), `old_string` (required), `new_string` (required) | Replace an exact unique string match in a file. Rejects protected paths. |
| `run_command` | `command` (required), `timeout?` | Execute a shell command via `sh -c`. Default 30s timeout, max 120s. Blocks dangerous patterns. |
| `list_files` | `path?` | List directory contents (`ls -la`) or glob-match files. Defaults to ".". Max 500 glob results. |
| `search_files` | `pattern` (required), `path?`, `glob?` | Grep for a regex pattern across project files. Excludes node_modules, .git, dist. Max 200 result lines. |

### MCP Tools (registered by `buildDirectTools` when `ctx` is non-null)

#### Messaging

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_send_message` | `to_agent`, `message` | Send a message to another agent and wait for response. Optional `thread` param to continue a conversation. |
| `corvid_list_agents` | (none) | List all available agents you can communicate with. |

#### Memory

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_save_memory` | `key`, `content` | Save a memory to long-term storage (encrypted on localnet AlgoChat) with short-term SQLite cache. |
| `corvid_recall_memory` | (none required) | Recall memories from short-term cache with long-term storage status. Key for exact lookup, query for search, or neither to list recent. |
| `corvid_read_on_chain_memories` | (none required) | Read memories directly from on-chain storage (Algorand blockchain). Optional `search` and `limit` params. |
| `corvid_sync_on_chain_memories` | (none required) | Sync memories from on-chain storage back to local SQLite cache. Optional `limit` param. |
| `corvid_delete_memory` | `key` | Delete (forget) a long-term ARC-69 memory. Optional `mode` (soft/hard). |
| `corvid_promote_memory` | `key` | Promote a short-term (SQLite) memory to long-term on-chain storage (ARC-69 ASA). |

#### Shared Library (CRVLIB)

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_library_write` | `key`, `content` | Publish or update a shared library entry. Large content auto-splits into multi-page books. Optional `category`, `tags`. |
| `corvid_library_read` | (none required) | Read shared library entries by `key`, `query`, `category`, `tag`, or `limit`. |
| `corvid_library_list` | (none required) | List all shared library entries directly from on-chain CRVLIB ASAs. Optional `category`, `tag`, `limit`. |
| `corvid_library_delete` | `key` | Delete a shared library entry. Optional `mode` (soft/hard). |

#### Session & Server

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_extend_timeout` | `minutes` | Request more session time (1-120 min). |
| `corvid_restart_server` | (none required) | Restart the corvid-agent server. Idempotent within a session. Optional `reason` param. |

#### Credits

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_check_credits` | (none required) | Check credit balance for a wallet address. |
| `corvid_grant_credits` | `wallet_address`, `amount` | Grant free credits (max 1M per grant). Optional `reason`. |
| `corvid_credit_config` | (none required) | View or update credit system configuration. Optional `key`, `value`. |

#### Projects & Work Tasks (conditional on `ctx.workTaskService`)

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_list_projects` | (none) | List all available projects with IDs, names, and working directories. |
| `corvid_current_project` | (none) | Show the current agent's default project. |
| `corvid_create_work_task` | `description` | Create a work task spawning a new agent session. Optional `project_id`, `project_name`, `model_tier` (light/standard/heavy), `agent_id`. |
| `corvid_check_work_status` | `task_id` | Check the status of a work task by ID. |
| `corvid_list_work_tasks` | (none required) | List work tasks for this agent. Optional `status` filter and `limit`. |

#### Scheduling & Workflows

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_manage_schedule` | `action` | Manage automated schedules. Actions: list, create, update, get, pause, resume, history. Supports `schedule_actions`, `output_destinations`, `approval_policy`, `max_executions`, `agent_id`, `cron_expression`, `interval_minutes`. |
| `corvid_manage_workflow` | `action` | Manage graph-based workflows. Actions: list, create, get, activate, pause, trigger, runs, run_status. |

#### Web Search

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_web_search` | `query` | Search the web via Brave Search. Optional `count` (1-20) and `freshness` (pd/pw/pm/py). |
| `corvid_deep_research` | `topic` | Multi-angle web research with deduplication. Optional `sub_questions`. |

#### GitHub

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_github_star_repo` | `repo` | Star a GitHub repository. |
| `corvid_github_unstar_repo` | `repo` | Remove a star from a GitHub repository. |
| `corvid_github_fork_repo` | `repo` | Fork a GitHub repository. Optional `org` to fork into an organization. |
| `corvid_github_list_prs` | `repo` | List open PRs for a repository. Optional `limit`. |
| `corvid_github_create_pr` | `repo`, `title`, `body`, `head` | Create a pull request. Optional `base` (default "main"). |
| `corvid_github_review_pr` | `repo`, `pr_number`, `event`, `body` | Submit a PR review (APPROVE, REQUEST_CHANGES, COMMENT). |
| `corvid_github_create_issue` | `repo`, `title`, `body` | Create a GitHub issue. Optional `labels`. |
| `corvid_github_list_issues` | `repo` | List issues for a repository. Optional `state` (open/closed/all), `limit`. |
| `corvid_github_repo_info` | `repo` | Get repository metadata. |
| `corvid_github_get_pr_diff` | `repo`, `pr_number` | Get full diff for a PR. |
| `corvid_github_comment_on_pr` | `repo`, `pr_number`, `body` | Comment on a PR. |
| `corvid_github_follow_user` | `username` | Follow a GitHub user. |

#### AST / Code Navigation (conditional on `ctx.astParserService`)

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_code_symbols` | `query` | Search code symbols via AST parsing. Optional `project_dir`, `kinds` (function, class, interface, type_alias, enum, import, export, variable, method), `limit`. |
| `corvid_find_references` | `symbol_name` | Find all references to a symbol. Optional `project_dir`, `limit`. |

#### Repo Blocklist (conditional on `ctx.astParserService`)

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_repo_blocklist` | `action` | Manage repo blocklist. Actions: list, add, remove, check. Optional `repo`, `reason`, `source` (manual/pr_rejection/daily_review). |

#### Flock Directory (conditional on `ctx.astParserService`)

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_flock_directory` | `action` | Manage the on-chain agent registry. Actions: register, deregister, heartbeat, lookup, search, list, stats, compute_reputation. Supports `agent_id`, `address`, `name`, `description`, `instance_url`, `capabilities`, `query`, `capability`, `min_reputation`, `sort_by`, `sort_order`, `limit`. |

## Invariants

1. All file paths resolved by coding tools must stay within `workingDir`; any path traversal attempt (resolving outside the project root) throws `AuthorizationError`. Leading slashes are stripped before resolution so that absolute paths from small models are treated as relative to `workingDir`.
2. Protected paths (as defined by `isProtectedPath`) cannot be written to or edited.
3. Protected bash commands (as defined by `isProtectedBashCommand`) and hardcoded dangerous patterns (sudo, rm -rf /, mkfs, dd to devices, shutdown, reboot, killall, chmod 777 /) are always blocked in `run_command`.
4. Shell commands run with the safe allowlisted environment, not the full `process.env`.
5. `edit_file` requires `old_string` to appear exactly once in the file; zero or multiple matches are rejected.
6. `old_string` and `new_string` must differ; identical values are rejected.
7. Output from `read_file`, `run_command`, `list_files`, and `search_files` is middle-truncated at 8000 characters to protect small context windows.
8. `run_command` timeout is capped at 120 seconds regardless of what the caller requests.
9. `DEFAULT_ALLOWED_TOOLS` gates which tools non-web sessions receive when no explicit permissions are set.
10. Tiered scheduler tool gating via `isToolBlockedForScheduler()` (from `scheduler-tool-gating.ts`) removes always-blocked tools and conditionally allows gated tools based on `ctx.schedulerActionType`.
11. When `resolvedToolPermissions` is set on `McpToolContext`, it takes precedence over the agent's raw `mcpToolPermissions` database field.
12. `toProviderTools` strips handler functions -- the returned objects contain only `name`, `description`, and `parameters`.
13. Tool guardrails via `filterToolsByGuardrail()` (from `tool-guardrails.ts`) hide expensive networking tools from sessions that do not need them, based on `ToolAccessConfig` derived from `ctx.sessionSource`.
14. `corvid_repo_blocklist` and `corvid_flock_directory` are only registered when `ctx.astParserService` is available.
15. `corvid_create_work_task`, `corvid_check_work_status`, and `corvid_list_work_tasks` are only registered when `ctx.workTaskService` is available.

## Behavioral Examples

### Scenario: Agent reads a file within the project
- **Given** a `CodingToolContext` with `workingDir` set to `/home/user/project`
- **When** `read_file` is called with `path: "src/index.ts"`
- **Then** the file at `/home/user/project/src/index.ts` is read, lines are numbered, and output is returned (truncated if over 8000 chars)

### Scenario: Agent passes an absolute path (small model quirk)
- **Given** a `CodingToolContext` with `workingDir` set to `/home/user/project`
- **When** `list_files` is called with `path: "/home/user/project/server"`
- **Then** the leading slash is stripped, resolving to `/home/user/project/home/user/project/server`... but more importantly, `path: "/server"` becomes `server/` relative to `workingDir`, correctly resolving to `/home/user/project/server`

### Scenario: Agent attempts path traversal
- **Given** a `CodingToolContext` with `workingDir` set to `/home/user/project`
- **When** `write_file` is called with `path: "../../etc/passwd"`
- **Then** `AuthorizationError` is thrown with message "Path traversal denied"

### Scenario: Agent runs a blocked command
- **Given** a `CodingToolContext` configured for a project
- **When** `run_command` is called with `command: "sudo rm -rf /"`
- **Then** the command is blocked and an error is returned matching the "sudo" pattern

### Scenario: Scheduler session filters dangerous tools
- **Given** `McpToolContext` with `schedulerMode: true`, `schedulerActionType: 'review_prs'`, and no explicit tool permissions
- **When** `buildDirectTools` assembles the tool set
- **Then** always-blocked tools (corvid_send_message, corvid_grant_credits, etc.) are excluded; gated tools allowed for review_prs (e.g. corvid_github_comment_on_pr) are included

### Scenario: Agent with explicit tool permissions
- **Given** `McpToolContext` with `resolvedToolPermissions: ["corvid_web_search", "read_file"]`
- **When** `buildDirectTools` assembles the tool set
- **Then** only `corvid_web_search` and `read_file` are included in the returned array

### Scenario: Tool guardrails hide networking tools
- **Given** `McpToolContext` with `sessionSource` that resolves to a restrictive `ToolAccessPolicy`
- **When** `buildDirectTools` assembles the tool set
- **Then** `filterToolsByGuardrail` removes expensive networking tools not needed for that session type

## Error Cases

| Condition | Behavior |
|-----------|----------|
| File path resolves outside `workingDir` | `AuthorizationError` thrown with "Path traversal denied" |
| File not found on `read_file` | Returns `{ text: "File not found: ...", isError: true }` |
| File not found on `edit_file` | Returns `{ text: "File not found: ...", isError: true }` |
| Write or edit to protected path | Returns `{ text: "Protected file -- cannot write/edit: ...", isError: true }` |
| `old_string` not found in file | Returns error instructing to read file first |
| `old_string` appears multiple times | Returns error with occurrence count, advising more context |
| `old_string` equals `new_string` | Returns error "no change needed" |
| Shell command matches blocked pattern | Returns `{ text: "Command blocked for safety: ...", isError: true }` |
| Shell command matches `isProtectedBashCommand` | Returns `{ text: "Command blocked: ...", isError: true }` |
| Shell command times out | Process killed, partial output returned with exit code |
| Shell command exits non-zero | Returns `{ text: "Exit code N\n...", isError: true }` |
| Glob scan returns no matches | Returns informational "No files match pattern" |
| Grep returns no matches (exit code 1) | Returns informational "No matches found" |
| Missing required tool arguments | Returns `{ text: "Missing required argument(s) for tool_name: ...", isError: true }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/process/protected-paths` | `isProtectedPath`, `isProtectedBashCommand` for file/command safety checks |
| `server/lib/errors` | `AuthorizationError` for path traversal denial |
| `server/mcp/tool-handlers` | `McpToolContext` type and all `handle*` functions for MCP tool implementations |
| `server/mcp/tool-handlers/library` | `handleLibraryWrite`, `handleLibraryRead`, `handleLibraryListOnChain`, `handleLibraryDelete` for shared library tools |
| `server/mcp/tool-handlers/repo-blocklist` | `handleManageRepoBlocklist` for repo blocklist management |
| `server/mcp/tool-handlers/server-ops` | `handleRestartServer` for server restart tool |
| `server/mcp/scheduler-tool-gating` | `isToolBlockedForScheduler` for tiered scheduler permission filtering |
| `server/mcp/tool-guardrails` | `filterToolsByGuardrail`, `resolveToolAccessPolicy`, `ToolAccessConfig` for session-based tool hiding |
| `server/db/agents` | `getAgent` for reading agent tool permissions when `resolvedToolPermissions` is not set |
| `server/providers/types` | `LlmToolDefinition` type for provider-facing tool format |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/direct-process` | `buildDirectTools`, `toProviderTools`, `DirectToolDefinition`, `buildSafeEnvForCoding`, `CodingToolContext` -- assembles tools for Ollama/direct agent sessions |
| `server/mcp/external-client` | `DirectToolDefinition` type for external MCP tool proxies |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-08 | corvid-agent | v2: Strip leading slashes from file paths in `resolveSafePath` to handle absolute paths from small models (e.g. qwen3:8b). Updated invariant #1 and added behavioral example |
| 2026-04-09 | corvid-agent | v3: Major update to reflect 19 commits of changes. Added 15 new MCP tools (promote_memory, delete_memory, read/sync_on_chain_memories, library CRUD, restart_server, list_projects, current_project, check_work_status, list_work_tasks, repo_blocklist, flock_directory). Documented optional params on existing tools (thread on send_message, count/freshness on web_search, org on fork_repo, state/limit on list_issues, model_tier/project_id/project_name/agent_id on create_work_task, output_destinations/approval_policy on manage_schedule). Added new dependencies: scheduler-tool-gating, tool-guardrails, tool-handlers/library, tool-handlers/repo-blocklist, tool-handlers/server-ops. Added invariants 13-15 for guardrails, conditional tool registration. Organized MCP tools table into categorized sub-tables. |
