---
module: coding-tools
version: 1
status: draft
files:
  - server/mcp/coding-tools.ts
  - server/mcp/direct-tools.ts
db_tables: []
depends_on:
  - specs/mcp/tool-handlers.spec.md
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
| `buildDirectTools` | `ctx: McpToolContext \| null, codingCtx?: CodingToolContext` | `DirectToolDefinition[]` | Assembles the full tool set: MCP-based corvid_* tools (messaging, memory, credits, scheduling, workflows, web search, GitHub, AST) plus coding tools when `codingCtx` is provided. Applies permission filtering based on agent config, resolved permissions, session source, and scheduler mode. |
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

| Tool Name | Required Args | Description |
|-----------|--------------|-------------|
| `corvid_send_message` | `to_agent`, `message` | Send a message to another agent and wait for response. |
| `corvid_save_memory` | `key`, `content` | Save an encrypted memory on-chain. |
| `corvid_recall_memory` | (none required) | Recall memories by key, query, or list recent. |
| `corvid_list_agents` | (none) | List all communicable agents. |
| `corvid_extend_timeout` | `minutes` | Request more session time (1-120 min). |
| `corvid_check_credits` | (none required) | Check credit balance for a wallet. |
| `corvid_grant_credits` | `wallet_address`, `amount` | Grant free credits (max 1M per grant). |
| `corvid_credit_config` | (none required) | View or update credit system configuration. |
| `corvid_create_work_task` | `description` | Create a work task spawning a new agent session (conditional on `ctx.workTaskService`). |
| `corvid_manage_schedule` | `action` | Manage automated schedules (list, create, pause, resume, history). |
| `corvid_manage_workflow` | `action` | Manage graph-based workflows (list, create, get, activate, pause, trigger, runs, run_status). |
| `corvid_web_search` | `query` | Search the web via Brave Search. |
| `corvid_deep_research` | `topic` | Multi-angle web research with deduplication. |
| `corvid_github_star_repo` | `repo` | Star a GitHub repository. |
| `corvid_github_unstar_repo` | `repo` | Unstar a GitHub repository. |
| `corvid_github_fork_repo` | `repo` | Fork a GitHub repository. |
| `corvid_github_list_prs` | `repo` | List open PRs for a repository. |
| `corvid_github_create_pr` | `repo`, `title`, `body`, `head` | Create a pull request. |
| `corvid_github_review_pr` | `repo`, `pr_number`, `event`, `body` | Submit a PR review. |
| `corvid_github_create_issue` | `repo`, `title`, `body` | Create a GitHub issue. |
| `corvid_github_list_issues` | `repo` | List issues for a repository. |
| `corvid_github_repo_info` | `repo` | Get repository metadata. |
| `corvid_github_get_pr_diff` | `repo`, `pr_number` | Get full diff for a PR. |
| `corvid_github_comment_on_pr` | `repo`, `pr_number`, `body` | Comment on a PR. |
| `corvid_github_follow_user` | `username` | Follow a GitHub user. |
| `corvid_code_symbols` | `query` | Search code symbols via AST parsing (conditional on `ctx.astParserService`). |
| `corvid_find_references` | `symbol_name` | Find all references to a symbol (conditional on `ctx.astParserService`). |

## Invariants

1. All file paths resolved by coding tools must stay within `workingDir`; any path traversal attempt (resolving outside the project root) throws `AuthorizationError`.
2. Protected paths (as defined by `isProtectedPath`) cannot be written to or edited.
3. Protected bash commands (as defined by `isProtectedBashCommand`) and hardcoded dangerous patterns (sudo, rm -rf /, mkfs, dd to devices, shutdown, reboot, killall, chmod 777 /) are always blocked in `run_command`.
4. Shell commands run with the safe allowlisted environment, not the full `process.env`.
5. `edit_file` requires `old_string` to appear exactly once in the file; zero or multiple matches are rejected.
6. `old_string` and `new_string` must differ; identical values are rejected.
7. Output from `read_file`, `run_command`, `list_files`, and `search_files` is middle-truncated at 8000 characters to protect small context windows.
8. `run_command` timeout is capped at 120 seconds regardless of what the caller requests.
9. `DEFAULT_ALLOWED_TOOLS` gates which tools non-web sessions receive when no explicit permissions are set.
10. Tiered scheduler tool gating via `isToolBlockedForScheduler()` removes always-blocked tools (send_message, grant_credits, credit_config, fork_repo, ask_owner) and conditionally allows gated tools (create_issue, create_pr, comment_on_pr) based on `ctx.schedulerActionType`.
11. When `resolvedToolPermissions` is set on `McpToolContext`, it takes precedence over the agent's raw `mcpToolPermissions` database field.
12. `toProviderTools` strips handler functions -- the returned objects contain only `name`, `description`, and `parameters`.

## Behavioral Examples

### Scenario: Agent reads a file within the project
- **Given** a `CodingToolContext` with `workingDir` set to `/home/user/project`
- **When** `read_file` is called with `path: "src/index.ts"`
- **Then** the file at `/home/user/project/src/index.ts` is read, lines are numbered, and output is returned (truncated if over 8000 chars)

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
