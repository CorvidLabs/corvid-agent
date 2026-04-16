---
spec: sdk-tools.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/mcp-tool-permissions.test.ts` | Unit | `resolveAllowedTools()`, `DEFAULT_ALLOWED_TOOLS` set, skill bundle merging, project bundle merging |
| `server/__tests__/mcp-servers.test.ts` | Integration | `createCorvidMcpServer()`: tool registration, permission filtering, scheduler-mode filtering |
| `server/__tests__/mcp-http-transport.test.ts` | Unit | Streamable HTTP transport, direct-tools JSON Schema validation |
| `server/__tests__/mcp-service-container.test.ts` | Unit | Conditional tool registration when optional services are absent |

## Manual Testing

- [ ] Start a session for an agent with `mcp_tool_permissions = NULL` — verify all 48 `DEFAULT_ALLOWED_TOOLS` are available
- [ ] Grant an agent explicit permissions including `corvid_grant_credits` — verify the privileged tool appears in its tool list
- [ ] Start a scheduler session with `actionType = 'daily_review'` — verify `corvid_github_create_issue` and `corvid_send_message` are available but `corvid_github_create_pr` is not
- [ ] Start a scheduler session with `actionType = 'work_task'` — verify `corvid_github_create_pr` is available but `corvid_github_create_issue` is not
- [ ] Start a web-source session — verify no permission filtering is applied
- [ ] Start a session with no `workTaskService` in context — verify `corvid_create_work_task` is absent from the tool list
- [ ] Call `isRepoAllowedForScheduler('CorvidLabs/corvid-agent')` with `GITHUB_ALLOWED_ORGS=CorvidLabs` — verify it returns `true`
- [ ] Call `getSchedulerAllowedOrgs()` after changing `GITHUB_ALLOWED_ORGS` env var at runtime — verify the new value is returned (not a stale snapshot)

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Agent with `mcp_tool_permissions = []` (empty array) | Resolves to empty tool set — no tools available |
| Agent with `mcp_tool_permissions` containing unknown tool name | Unknown tool silently filtered out; no error |
| Scheduler session with `actionType = undefined` | All gated tools are blocked (no action type match possible) |
| `isToolBlockedForScheduler` called with always-blocked tool name | Returns `true` regardless of `actionType` |
| `GITHUB_ALLOWED_ORGS` env var unset | `getSchedulerAllowedOrgs()` returns empty Set; all repos blocked |
| `GITHUB_ALLOWED_ORGS` set to `'*'` | Does NOT act as wildcard — only orgs explicitly listed are allowed |
| `checkSchedulerRateLimit` called after limit reached | Returns error string; does not increment counter further |
| Plugin tools injected via `pluginTools` parameter | Plugin tools added to MCP server alongside built-in tools |
| Tool input fails Zod schema validation | MCP SDK returns validation error before handler executes |
| `corvid_ask_owner` in scheduler session with `actionType = 'custom'` | Still blocked (always-blocked, not action-type-gated) |
