---
spec: tool-catalog.spec.md
---

## User Stories

- As a team agent, I want access to coding tools (read_file, write_file, edit_file, run_command, list_files, search_files) so that I can autonomously read and modify project files during my sessions
- As an agent operator, I want tool access to be permission-filtered per agent so that agents can only use tools they are authorized for
- As a platform administrator, I want dangerous shell commands (sudo, rm -rf /, mkfs, dd, shutdown) to be blocked automatically so that agents cannot damage the host system
- As a team agent, I want to connect to external MCP servers and use their tools alongside built-in tools so that I can integrate with third-party services
- As an agent operator, I want scheduler-mode sessions to have restricted tool sets so that automated executions cannot send messages, grant credits, or fork repositories
- As an agent developer, I want tool guardrails to enforce path traversal prevention and protected file restrictions so that agents stay sandboxed within their project directory
- As a team agent, I want MCP tools for GitHub operations (create PR, review PR, create issue, star repo) so that I can interact with repositories programmatically
- As an external agent, I want an MCP stdio server that proxies to the corvid-agent HTTP API so that I can access corvid-agent tools from external CLI clients

## Acceptance Criteria

- `buildCodingTools` returns exactly six tools: `read_file`, `write_file`, `edit_file`, `run_command`, `list_files`, `search_files`, all bound to the provided `workingDir`
- All file paths in coding tools are resolved relative to `workingDir`; paths resolving outside the project root throw `AuthorizationError` with "Path traversal denied"
- Leading slashes are stripped from file paths before resolution so that absolute paths from small models are treated as relative
- `edit_file` rejects edits where `old_string` is not found, appears multiple times, or equals `new_string`
- `run_command` blocks dangerous patterns (hardcoded list + `isProtectedBashCommand`), enforces a maximum timeout of 120 seconds, and uses an allowlisted environment via `buildSafeEnvForCoding`
- Output from `read_file`, `run_command`, `list_files`, and `search_files` is middle-truncated at 8,000 characters
- `buildDirectTools` applies permission filtering: when `resolvedToolPermissions` is set, only listed tools are included; when absent, `DEFAULT_ALLOWED_TOOLS` gates non-web sessions
- `isToolBlockedForScheduler` removes always-blocked tools (corvid_send_message, corvid_grant_credits, corvid_credit_config, corvid_fork_repo, corvid_ask_owner) from scheduler sessions
- `toProviderTools` strips handler functions from tool definitions, returning only `name`, `description`, and `parameters`
- `ExternalMcpClientManager.connectAll` gracefully degrades on individual server failures (logs warning, skips server) and never throws
- External tool names are namespaced with the sanitized server name prefix to prevent collisions
- External MCP server connections have a 30-second timeout
- `DEFAULT_CORE_TOOLS` is a readonly array of 41 tool name strings with no runtime dependencies
- The stdio server reads `CORVID_AGENT_ID` and `CORVID_API_URL` from environment and exits if either is missing
- `write_file` and `edit_file` reject writes to protected paths as determined by `isProtectedPath`

## Constraints

- Shell commands in `run_command` execute with only the allowlisted environment variables (PATH, HOME, git vars, etc.), not the full `process.env`
- Tool result truncation floor is 8,000 characters for coding tools (separate from the 30% context-window cap applied by the process module)
- `search_files` excludes `node_modules`, `.git`, and `dist` directories and caps results at 200 lines
- `list_files` caps glob results at 500 entries
- External MCP connections use stdio transport only; HTTP transport is defined but not used for external servers

## Out of Scope

- Tool handler business logic for individual corvid_* tools (each handler is its own module)
- Permission grant management and HMAC signing (handled by the permissions module)
- Provider-level tool support detection (handled by the providers module)
- Skill bundle and persona overlay management
