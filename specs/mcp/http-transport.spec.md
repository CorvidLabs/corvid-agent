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
| `handleMcpHttpRequest` | `req: Request, baseUrl: string` | `Promise<Response>` | Routes an incoming HTTP request to the appropriate MCP transport. Creates new sessions for POST/GET, routes existing sessions by `mcp-session-id` header, returns 405 for unsupported methods. Internally creates an `McpServer` with 24 corvid tools (health, agents, sessions, messaging, memory, observations, work tasks, projects) that proxy to the local REST API. |

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

The MCP server exposes 24 tools that proxy to the local REST API:

| Tool | Category | Description |
|------|----------|-------------|
| `corvid_health` | Health | Check server health status |
| `corvid_list_agents` | Agents | List all registered agents |
| `corvid_get_agent` | Agents | Get agent details by ID |
| `corvid_create_session` | Sessions | Create a new agent session |
| `corvid_list_sessions` | Sessions | List sessions with optional status filter |
| `corvid_get_session` | Sessions | Get session details by ID |
| `corvid_stop_session` | Sessions | Stop a running session |
| `corvid_send_message` | Messaging | Send a message to another agent |
| `corvid_save_memory` | Memory | Save to short-term SQLite storage |
| `corvid_recall_memory` | Memory | Recall memories by key/query |
| `corvid_read_on_chain_memories` | Memory | Read from Algorand blockchain |
| `corvid_sync_on_chain_memories` | Memory | Sync on-chain to local cache |
| `corvid_delete_memory` | Memory | Delete an ARC-69 memory |
| `corvid_promote_memory` | Memory | Promote short-term to on-chain |
| `corvid_record_observation` | Observations | Record a short-term observation |
| `corvid_list_observations` | Observations | List/search observations |
| `corvid_boost_observation` | Observations | Boost observation relevance |
| `corvid_dismiss_observation` | Observations | Dismiss an observation |
| `corvid_observation_stats` | Observations | Get observation statistics |
| `corvid_create_work_task` | Work Tasks | Create a work task on a branch |
| `corvid_list_work_tasks` | Work Tasks | List work tasks with optional filter |
| `corvid_get_work_task` | Work Tasks | Get work task details by ID |
| `corvid_list_projects` | Projects | List all configured projects |
| `corvid_get_project` | Projects | Get project details by ID |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | corvid-agent | Initial spec |
| 2026-04-09 | corvid-agent | Updated tool count from 17 to 24: added corvid_promote_memory, corvid_delete_memory, corvid_record_observation, corvid_list_observations, corvid_boost_observation, corvid_dismiss_observation, corvid_observation_stats. Added corvid_save_memory description updated to short-term SQLite |
