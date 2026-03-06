---
module: mcp-sdk-tools
version: 1
status: active
files:
  - server/mcp/sdk-tools.ts
  - server/mcp/scheduler-tool-gating.ts
db_tables: []
depends_on:
  - specs/mcp/tool-handlers.spec.md
---

# MCP SDK Tools

## Purpose

Creates the MCP server that exposes all `corvid_*` tools to Claude agent sessions. Defines tool schemas (names, descriptions, Zod input schemas), wires them to handler functions, and enforces the tool permission system: default allowed tools, explicit grants for privileged tools, and scheduler-mode blocking.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createCorvidMcpServer` | `(ctx: McpToolContext, pluginTools?: ReturnType<typeof tool>[])` | MCP server instance | Creates an MCP server with all corvid_* tools, filtered by agent permissions |

## Invariants

1. **DEFAULT_ALLOWED_TOOLS**: 35 tools available to all agents when `mcp_tool_permissions` is NULL. Privileged tools (`corvid_grant_credits`, `corvid_credit_config`) are excluded from this set
2. **Tiered scheduler tool gating**: Uses `SCHEDULER_ALWAYS_BLOCKED` (5 tools: `corvid_send_message`, `corvid_grant_credits`, `corvid_credit_config`, `corvid_github_fork_repo`, `corvid_ask_owner`) and `SCHEDULER_GATED_TOOLS` (3 tools allowed for specific action types: `corvid_github_create_issue` for daily_review/improvement_loop/custom, `corvid_github_create_pr` for work_task/improvement_loop/codebase_review, `corvid_github_comment_on_pr` for review_prs/daily_review). Defined in `scheduler-tool-gating.ts`
3. **Permission resolution**: Web-source sessions get all tools. Non-web sessions are filtered by `ctx.resolvedToolPermissions` (agent base + skill bundle tools + project bundle tools). If no permissions are set, `DEFAULT_ALLOWED_TOOLS` is used
4. **Scheduler mode filtering**: When `ctx.schedulerMode` is true, `isToolBlockedForScheduler(toolName, ctx.schedulerActionType)` determines which tools are removed. Always-blocked tools are removed unconditionally; gated tools are allowed only when the action type is in the tool's allowed set
5. **Plugin tool injection**: Optional `pluginTools` parameter allows dynamically loaded plugin tools to be added to the MCP server alongside built-in tools
6. **Zod schema validation**: Every tool has a Zod v4 input schema. Invalid inputs are rejected before the handler is called
7. **Conditional tool registration**: `corvid_create_work_task` is only registered when `ctx.workTaskService` is available. `corvid_code_symbols` and `corvid_find_references` are only registered when `ctx.astParserService` is available. All other tools are registered unconditionally

## Behavioral Examples

### Scenario: Default agent (no explicit permissions)

- **Given** an agent with `mcp_tool_permissions = NULL`
- **When** `createCorvidMcpServer` is called
- **Then** all 35 `DEFAULT_ALLOWED_TOOLS` are registered (minus any conditionally unavailable tools), privileged tools are excluded

### Scenario: Agent with explicit permissions

- **Given** an agent with `mcp_tool_permissions = ["corvid_send_message", "corvid_grant_credits"]`
- **When** `createCorvidMcpServer` is called
- **Then** only `corvid_send_message` and `corvid_grant_credits` are registered (explicit grant includes privileged tool)

### Scenario: Scheduler-mode session (always-blocked tool)

- **Given** a scheduler-initiated session (`ctx.schedulerMode = true`, any action type)
- **When** `createCorvidMcpServer` is called
- **Then** always-blocked tools (`corvid_send_message`, `corvid_grant_credits`, etc.) are removed from the final set

### Scenario: Scheduler-mode session (gated tool allowed)

- **Given** a scheduler-initiated session (`ctx.schedulerMode = true`, `ctx.schedulerActionType = 'daily_review'`)
- **When** `createCorvidMcpServer` is called
- **Then** `corvid_github_create_issue` is included (allowed for daily_review), but `corvid_github_create_pr` is excluded (not allowed for daily_review)

### Scenario: Web-source session

- **Given** a session with `ctx.sessionSource = 'web'`
- **When** `createCorvidMcpServer` is called
- **Then** all registered tools are available (no permission filtering for web sessions)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Tool input fails Zod validation | MCP SDK returns validation error before handler is called |
| Handler throws | Error propagated through MCP SDK error handling |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers/index.ts` | All 36 `handle*` functions and `McpToolContext` type (barrel re-export) |
| `server/db/agents.ts` | `getAgent` (for permission lookup) |
| `@anthropic-ai/claude-agent-sdk` | `createSdkMcpServer`, `tool` |
| `zod/v4` | `z` for input schema definitions |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `createCorvidMcpServer` called during session startup to create the MCP server |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
| 2026-02-24 | corvid-agent | Updated dependency path after tool-handlers refactor (#233) |
