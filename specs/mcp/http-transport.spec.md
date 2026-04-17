---
module: http-transport
version: 1
status: draft
files:
  - server/mcp/http-transport.ts
db_tables: []
depends_on:
  - specs/mcp/external-client.spec.md
---

# MCP HTTP Transport

## Purpose

Exposes corvid-agent MCP tools over Streamable HTTP at the `/mcp` endpoint. This allows any MCP-compatible client (Claude Code, Cursor, Gemini, etc.) to connect to the server by URL alone — no local stdio process or package install needed.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleMcpHttpRequest` | `req: Request, baseUrl: string` | `Promise<Response>` | Routes an incoming HTTP request to the appropriate MCP transport. Creates new sessions for POST/GET, routes existing sessions by `mcp-session-id` header, returns 405 for unsupported methods. Internally creates an `McpServer` with 56 corvid tools that proxy to the local REST API. |

## Invariants

1. The agent ID is resolved once on first request and cached for the lifetime of the process.
2. If agent resolution fails, the agent ID defaults to `'default'`.
3. Each MCP client session gets a unique UUID via `crypto.randomUUID()`.
4. Active transports are stored in a module-level `Map` keyed by session ID.
5. Sessions are cleaned up from the map when `onsessionclosed` fires.
6. Unsupported HTTP methods return 405 with a JSON error body.
7. POST and GET requests without an existing session ID create a new transport and MCP server instance.
8. All tool handlers catch errors and return MCP-formatted error results rather than throwing.
9. The MCP server is created with `{ name: 'corvid-agent', version: '1.0.0' }` identity.

## Behavioral Examples

### Scenario: MCP client initializes a session
- **Given** the `/mcp` endpoint is active
- **When** a client sends a POST with `method: 'initialize'` and `Accept: 'application/json, text/event-stream'`
- **Then** a new `WebStandardStreamableHTTPServerTransport` is created, a session ID is generated, the transport is stored in the active transports map, and the response includes the `mcp-session-id` header.

### Scenario: MCP client sends a request to an existing session
- **Given** a session has been initialized with ID `abc-123`
- **When** a client sends a POST with `mcp-session-id: abc-123` header
- **Then** the request is routed to the existing transport for that session.

### Scenario: Unsupported HTTP method
- **Given** the `/mcp` endpoint is active
- **When** a client sends a PUT request
- **Then** a 405 response is returned with `{ "error": "Method not allowed" }`.

### Scenario: Tool call with API error
- **Given** a session is active and the client calls `corvid_health`
- **When** the internal `/api/health` call throws an error
- **Then** the tool returns `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`.

### Scenario: Agent ID resolution fails
- **Given** the `/api/agents` endpoint is unreachable
- **When** the first MCP request arrives
- **Then** the agent ID falls back to `'default'` and the server continues normally.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unsupported HTTP method (PUT, PATCH, etc.) | Returns 405 with JSON error |
| Non-existent session ID on POST | Creates a new transport (client must re-initialize) |
| Internal API returns non-OK status | Returns error result via tool handler |
| Tool handler throws | Caught and returned as MCP error content |
| Agent resolution fails | Falls back to `'default'` agent ID |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@modelcontextprotocol/sdk/server/mcp` | `McpServer` class for MCP protocol server |
| `@modelcontextprotocol/sdk/server/webStandardStreamableHttp` | `WebStandardStreamableHTTPServerTransport` for HTTP-based MCP transport |
| `zod/v4` | `z` schema definitions for tool parameter validation |
| `server/lib/logger` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index` | `handleMcpHttpRequest` -- mounted at `/mcp` route in the main Bun server |

## MCP Tools Exposed

The MCP server exposes 56 tools that proxy to the local REST API:

### Communication & Memory (7 tools)
| Tool | Description |
|------|-------------|
| `corvid_send_message` | Send inter-agent messages |
| `corvid_save_memory` | Save to short-term SQLite storage |
| `corvid_recall_memory` | Recall memories by key or query |
| `corvid_read_on_chain_memories` | Read from Algorand blockchain |
| `corvid_sync_on_chain_memories` | Sync on-chain to local cache |
| `corvid_delete_memory` | Delete an ARC-69 memory |
| `corvid_promote_memory` | Promote short-term to on-chain |

### Shared Library (4 tools)
| Tool | Description |
|------|-------------|
| `corvid_library_write` | Publish/update shared library entries |
| `corvid_library_read` | Read from shared library (local cache) |
| `corvid_library_list` | List library entries from blockchain |
| `corvid_library_delete` | Delete shared library entries |

### Agent Management (6 tools)
| Tool | Description |
|------|-------------|
| `corvid_list_agents` | List available agents |
| `corvid_discover_agent` | Fetch remote agent card |
| `corvid_invoke_remote_agent` | Send task to remote A2A agent |
| `corvid_lookup_contact` | Resolve cross-platform contact identities |
| `corvid_launch_council` | Launch multi-agent deliberation |
| `corvid_flock_directory` | Manage on-chain agent registry |

### Session & Work (9 tools)
| Tool | Description |
|------|-------------|
| `corvid_create_work_task` | Create work task on dedicated branch |
| `corvid_check_work_status` | Check work task status |
| `corvid_list_work_tasks` | List work tasks with filters |
| `corvid_list_projects` | List available projects |
| `corvid_current_project` | Show current project |
| `corvid_extend_timeout` | Request more session time |
| `corvid_restart_server` | Restart corvid-agent server |
| `corvid_manage_schedule` | Create/manage automated schedules |
| `corvid_manage_workflow` | Manage graph-based workflows |

### Credits & Billing (3 tools)
| Tool | Description |
|------|-------------|
| `corvid_check_credits` | Check credit balance |
| `corvid_grant_credits` | Grant free credits (restricted) |
| `corvid_credit_config` | View/update credit system config (restricted) |

### Research & Web (2 tools)
| Tool | Description |
|------|-------------|
| `corvid_web_search` | Web search via Brave Search |
| `corvid_deep_research` | Multi-angle topic research |

### GitHub (12 tools)
| Tool | Description |
|------|-------------|
| `corvid_github_star_repo` | Star a repository |
| `corvid_github_unstar_repo` | Remove a star |
| `corvid_github_fork_repo` | Fork a repository |
| `corvid_github_list_prs` | List open pull requests |
| `corvid_github_list_issues` | List issues |
| `corvid_github_create_pr` | Create pull request |
| `corvid_github_create_issue` | Create issue |
| `corvid_github_review_pr` | Submit review on PR |
| `corvid_github_comment_on_pr` | Add comment to PR |
| `corvid_github_get_pr_diff` | Get PR diff/patch |
| `corvid_github_repo_info` | Get repository information |
| `corvid_github_follow_user` | Follow a GitHub user |

### Notifications & Reputation (7 tools)
| Tool | Description |
|------|-------------|
| `corvid_notify_owner` | Send notification to owner |
| `corvid_ask_owner` | Ask owner (blocking) for input |
| `corvid_configure_notifications` | Manage notification channels |
| `corvid_check_reputation` | Check agent reputation score |
| `corvid_check_health_trends` | View codebase health metrics |
| `corvid_publish_attestation` | Publish reputation attestation on-chain |
| `corvid_verify_agent_reputation` | Verify remote agent reputation |

### Code Tools (3 tools)
| Tool | Description |
|------|-------------|
| `corvid_code_symbols` | Search code symbols via AST |
| `corvid_find_references` | Find all symbol references |
| `corvid_repo_blocklist` | Manage repo blocklist |

### Platform Integration (2 tools)
| Tool | Description |
|------|-------------|
| `corvid_discord_send_message` | Send Discord message |
| `corvid_discord_send_image` | Send Discord image |
| `corvid_browser` | Browser automation with Chrome |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | corvid-agent | Initial spec |
| 2026-04-09 | corvid-agent | Updated tool count from 17 to 24: added corvid_promote_memory, corvid_delete_memory, corvid_record_observation, corvid_list_observations, corvid_boost_observation, corvid_dismiss_observation, corvid_observation_stats. Added corvid_save_memory description updated to short-term SQLite |
| 2026-04-16 | corvid-agent | Fix tool count: 24 → 56. Enumerate all registered tools by category (#2020, #2020) |
