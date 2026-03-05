---
module: external-client
version: 1
status: draft
files:
  - server/mcp/external-client.ts
  - server/mcp/stdio-server.ts
db_tables: []
depends_on:
  - specs/mcp/coding-tools.spec.md
---

# External MCP Client & Stdio Server

## Purpose

Manages connections to third-party MCP servers via stdio transport, discovers their tools, and exposes them as `DirectToolDefinition` proxies for the direct execution engine. Also provides a standalone MCP stdio server that exposes corvid-agent tools to external CLI clients by proxying calls to the HTTP API.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `ExternalMcpConnection` | Represents a live connection to an external MCP server: `{ config: McpServerConfig; client: Client; transport: StdioClientTransport; tools: DirectToolDefinition[] }` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ExternalMcpClientManager` | Manages the lifecycle of connections to external MCP servers -- connecting, tool discovery, proxying tool calls, and disconnecting. |

#### ExternalMcpClientManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `connectAll` | `configs: McpServerConfig[]` | `Promise<ExternalMcpConnection[]>` | Connect to all provided MCP server configs. Gracefully degrades: logs a warning and skips any server that fails to start. Returns the successful connections. |
| `getAllTools` | (none) | `DirectToolDefinition[]` | Returns all tool definitions from all connected external MCP servers, flattened into a single array. |
| `disconnectAll` | (none) | `Promise<void>` | Disconnect all external MCP servers by closing their transports. Logs warnings on close errors. Resets the internal connection list. |
| `connectionCount` (getter) | (none) | `number` | Returns the number of currently active connections. |

## Stdio Server (server/mcp/stdio-server.ts)

The stdio server is a standalone Bun script (not a module with traditional exports). It registers MCP tools that proxy to the corvid-agent HTTP API. It reads `CORVID_AGENT_ID` and `CORVID_API_URL` from environment variables and exits if either is missing.

### Registered Tools

| Tool Name | Parameters | Description |
|-----------|-----------|-------------|
| `corvid_send_message` | `to_agent: string`, `message: string` | Send a message to another agent via the HTTP API. |
| `corvid_save_memory` | `key: string`, `content: string` | Save an encrypted memory via the HTTP API. |
| `corvid_recall_memory` | `key?: string`, `query?: string` | Recall memories via the HTTP API. |
| `corvid_list_agents` | (none) | List available agents via the HTTP API. |

### Internal Functions (stdio-server.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `callApi` | `path: string, body?: Record<string, unknown>` | `Promise<{ response: string; isError?: boolean }>` | Calls the corvid-agent HTTP API. Uses GET when no body is provided, POST otherwise. Returns parsed JSON response or error text. |

## Invariants

1. External tool names are namespaced with a sanitized server name prefix (lowercased, non-alphanumeric replaced with underscores, leading/trailing underscores stripped) to avoid collisions between servers and with built-in tools.
2. Connection to each external MCP server has a 30-second timeout; if the server does not respond within that window the connection attempt fails.
3. `connectAll` never throws -- individual server failures are logged as warnings and skipped. The method always returns an array (possibly empty) of successful connections.
4. `disconnectAll` never throws -- individual transport close errors are logged as warnings and processing continues for remaining connections.
5. The stdio server requires both `CORVID_AGENT_ID` and `CORVID_API_URL` environment variables; it exits with code 1 if either is missing.
6. The stdio server uses `@modelcontextprotocol/sdk` McpServer and StdioServerTransport for standards-compliant MCP communication.
7. Tool proxies extract only `type: "text"` content items from external MCP results; non-text content is ignored (falls back to JSON.stringify of the full result if no text parts exist).
8. The `ExternalMcpClientManager` merges `process.env` with each server config's `envVars`, with config values taking precedence.
9. After `disconnectAll`, the internal connections array is reset to empty and `connectionCount` returns 0.

## Behavioral Examples

### Scenario: Connecting to multiple external MCP servers
- **Given** an `ExternalMcpClientManager` instance and two `McpServerConfig` entries (e.g., "github-server" and "slack-server")
- **When** `connectAll` is called with both configs
- **Then** both servers are connected via stdio transport, their tools are discovered, and each tool is namespaced (e.g., `github_server_create_issue`, `slack_server_send_message`). `connectionCount` equals 2.

### Scenario: One external server fails to connect
- **Given** an `ExternalMcpClientManager` instance and two configs, where the second server's command does not exist
- **When** `connectAll` is called
- **Then** the first server connects successfully, the second logs a warning, and the returned array contains only one connection. `connectionCount` equals 1.

### Scenario: Calling an external tool
- **Given** a connected external MCP server "github-server" with a tool "create_issue"
- **When** the proxy tool `github_server_create_issue` handler is invoked with `{ repo: "owner/name", title: "Bug" }`
- **Then** the manager calls `client.callTool({ name: "create_issue", arguments: { repo: "owner/name", title: "Bug" } })`, extracts text content from the result, and returns `{ text: "...", isError?: boolean }`.

### Scenario: External tool call fails
- **Given** a connected external MCP server whose tool throws an error
- **When** the proxy handler is invoked
- **Then** the error is caught and returned as `{ text: "External MCP tool error (server/tool): message", isError: true }`.

### Scenario: Stdio server proxies a send_message call
- **Given** the stdio server is running with `CORVID_AGENT_ID=agent-1` and `CORVID_API_URL=http://localhost:3000`
- **When** a client calls `corvid_send_message` with `{ to_agent: "helper", message: "hello" }`
- **Then** the server POSTs `{ agentId: "agent-1", toAgent: "helper", message: "hello" }` to `http://localhost:3000/api/mcp/send-message` and returns the response text as MCP content.

### Scenario: Stdio server missing environment variables
- **Given** `CORVID_AGENT_ID` is not set
- **When** the stdio server script starts
- **Then** it prints an error to stderr and exits with code 1.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| External MCP server fails to start (bad command, crash) | `connectAll` logs warning, skips that server, continues with remaining |
| External MCP server connection times out (>30s) | Promise rejects with timeout error, server is skipped |
| External tool call throws | Returns `{ text: "External MCP tool error (server/tool): ...", isError: true }` |
| External tool returns no text content | Falls back to `JSON.stringify(result)` as the text value |
| Transport close fails during `disconnectAll` | Warning logged, remaining connections still closed |
| Stdio server: missing `CORVID_AGENT_ID` or `CORVID_API_URL` | Prints error to stderr, `process.exit(1)` |
| Stdio server: HTTP API returns non-OK status | Returns `{ response: "API error (status): body", isError: true }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@modelcontextprotocol/sdk/client` | `Client` class for MCP protocol communication |
| `@modelcontextprotocol/sdk/client/stdio` | `StdioClientTransport` for stdio-based MCP transport |
| `@modelcontextprotocol/sdk/server/mcp` | `McpServer` class (stdio-server.ts) |
| `@modelcontextprotocol/sdk/server/stdio` | `StdioServerTransport` (stdio-server.ts) |
| `shared/types` | `McpServerConfig` interface for server configuration |
| `server/mcp/direct-tools` | `DirectToolDefinition` type for tool proxy shape |
| `server/lib/logger` | `createLogger` for structured logging |
| `zod/v4` | `z` schema definitions for stdio server tool parameter validation |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/direct-process` | `ExternalMcpClientManager` -- instantiated to connect external MCP servers and merge their tools into the direct execution tool set |
| `server/routes/mcp-servers` | `ExternalMcpClientManager` -- imported for MCP server management API routes |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
