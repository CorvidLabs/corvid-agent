---
spec: sdk-tools.spec.md
sources:
  - server/mcp/sdk-tools.ts
  - server/mcp/scheduler-tool-gating.ts
  - server/mcp/schemas/memory-tools.ts
---

## Module Structure

The `server/mcp/` directory contains the MCP server factory and tool registration infrastructure:

- **`sdk-tools.ts`** — `createCorvidMcpServer()`: assembles the MCP server, registers all `corvid_*` tools with their Zod schemas, and applies permission and scheduler filtering before returning the server instance
- **`scheduler-tool-gating.ts`** — Constants and functions for scheduler-mode tool gating: `SCHEDULER_ALWAYS_BLOCKED`, `SCHEDULER_GATED_TOOLS`, rate-limit constants, and `isToolBlockedForScheduler()`
- **`schemas/memory-tools.ts`** — Canonical Zod schemas and JSON Schema equivalents for all 5 memory tools (save, recall, read_on_chain, sync, delete)
- **`tool-permissions.ts`** — `resolveAllowedTools()` logic: merges base agent permissions with skill bundle and project bundle grants
- **`tool-guardrails.ts`** — `filterToolsByGuardrail()`: hides expensive networking tools from sessions that don't need them based on a policy for the session source
- **`http-transport.ts`** — Streamable HTTP transport for direct-tools access (MCP over HTTP)
- **`external-client.ts`** — MCP client for connecting to external MCP servers
- **`skill-loader.ts`** — Loads plugin skill bundles and their MCP tool definitions
- **`coding-tools.ts`** — Coding-specific tool definitions

## Key Subsystems

### Tool Permission Resolution
Three-layer permission system applied in `createCorvidMcpServer()`:

1. **Source check**: Web-source sessions (`ctx.sessionSource === 'web'`) skip all permission filtering and receive all tools
2. **Resolved permissions**: `resolveAllowedTools()` checks `ctx.resolvedToolPermissions` (merged from agent base + skill bundles + project bundles) then falls back to the agent's `mcpToolPermissions` DB column, then to `DEFAULT_ALLOWED_TOOLS` (48 tools)
3. **Scheduler mode filtering**: When `ctx.schedulerMode` is true, `isToolBlockedForScheduler(toolName, ctx.schedulerActionType)` removes always-blocked tools unconditionally and gates action-type-specific tools

After permission resolution, `filterToolsByGuardrail()` applies a policy-based secondary filter to hide expensive networking tools from sessions that don't need them.

### Scheduler Tool Gating (scheduler-tool-gating.ts)
Two-tier gating model:

- **Always-blocked** (`SCHEDULER_ALWAYS_BLOCKED`): 4 tools never available in any scheduler session: `corvid_grant_credits`, `corvid_credit_config`, `corvid_github_fork_repo`, `corvid_ask_owner`
- **Action-type-gated** (`SCHEDULER_GATED_TOOLS`): 4 tools allowed only for specific `ScheduleActionType` values:
  - `corvid_github_create_issue`: allowed for `daily_review`, `improvement_loop`, `custom`
  - `corvid_github_create_pr`: allowed for `work_task`, `improvement_loop`, `codebase_review`
  - `corvid_github_comment_on_pr`: allowed for `review_prs`, `daily_review`
  - `corvid_send_message`: allowed for `send_message`, `status_checkin`, `daily_review`, `custom`

### Conditional Tool Registration
Several tools only register when the corresponding service is available in `McpToolContext`:
- `corvid_create_work_task`, `corvid_check_work_status`, `corvid_list_work_tasks` → require `ctx.workTaskService`
- `corvid_code_symbols`, `corvid_find_references` → require `ctx.astParserService`
- `corvid_launch_council` → requires `ctx.processManager`
- `corvid_browser` → requires `ctx.browserService`

### Memory Tool Schemas
`schemas/memory-tools.ts` exports both Zod v4 schemas (for MCP SDK validation) and plain JSON Schema objects (for direct-tools HTTP transport). Both formats must stay in sync.

## Configuration Values and Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_ALLOWED_TOOLS` | 48 tools | Baseline set available to all agents with no explicit permissions |
| `SCHEDULER_ALWAYS_BLOCKED` | 4 tools | Unconditionally removed in scheduler mode |
| `SCHEDULER_MAX_ISSUES_PER_SESSION` | 3 | Issues limit per scheduler session |
| `SCHEDULER_MAX_PRS_PER_SESSION` | 3 | PRs limit per scheduler session |
| `SCHEDULER_MAX_PR_COMMENTS_PER_SESSION` | 5 | PR comments limit per scheduler session |
| `SCHEDULER_MAX_MESSAGES_PER_SESSION` | 3 | Messages limit per scheduler session |
| `SCHEDULER_ESCALATION_LABEL` | `'agent-escalation'` | Label auto-applied to issues created by scheduler sessions |
| `GITHUB_ALLOWED_ORGS` | env var | Comma-separated list of allowed GitHub org owners for scheduler sessions |

## Related Resources

| Resource | Description |
|----------|-------------|
| `server/mcp/tool-handlers/` | Handler implementations for all `corvid_*` tools |
| `server/process/manager.ts` | Calls `createCorvidMcpServer()` during session startup |
| `server/db/agents.ts` | `getAgent()` used as fallback permission lookup |
| `@anthropic-ai/claude-agent-sdk` | `createSdkMcpServer`, `tool` primitives |
| `zod/v4` | Input schema definitions for all tools |
