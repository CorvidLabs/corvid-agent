# @corvid-agent/mcp

MCP (Model Context Protocol) server that exposes a [corvid-agent](https://github.com/CorvidLabs/corvid-agent) REST API as MCP tools. This allows MCP-compatible clients like Claude Code, Cursor, and others to interact with a corvid-agent instance.

## Quick Start

```bash
# Install
npm install @corvid-agent/mcp

# Run via stdio (default, connects to localhost:3000)
npx corvid-agent-mcp

# With custom server URL
CORVID_AGENT_URL=http://my-server:3000 npx corvid-agent-mcp

# With API key authentication
CORVID_AGENT_API_KEY=your-key npx corvid-agent-mcp
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `CORVID_AGENT_URL` | `http://localhost:3000` | Base URL of the corvid-agent server |
| `CORVID_AGENT_API_KEY` | — | Optional API key for authentication |

## MCP Client Configuration

### Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "corvid-agent": {
      "command": "npx",
      "args": ["corvid-agent-mcp"],
      "env": {
        "CORVID_AGENT_URL": "http://localhost:3000",
        "CORVID_AGENT_API_KEY": "your-key"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP configuration:

```json
{
  "corvid-agent": {
    "command": "npx",
    "args": ["corvid-agent-mcp"],
    "env": {
      "CORVID_AGENT_URL": "http://localhost:3000"
    }
  }
}
```

## Available Tools

| Tool | Description |
|---|---|
| `corvid_list_agents` | List all registered agents |
| `corvid_get_agent` | Get agent details by ID |
| `corvid_create_session` | Create a new agent session |
| `corvid_list_sessions` | List sessions with optional status filter |
| `corvid_get_session` | Get session details by ID |
| `corvid_get_session_messages` | Get message history for a session |
| `corvid_stop_session` | Stop a running session |
| `corvid_send_message` | Send a message to an agent |
| `corvid_create_work_task` | Create a work task (spawns agent on dedicated branch) |
| `corvid_list_work_tasks` | List work tasks with optional filters |
| `corvid_get_work_task` | Get work task details by ID |
| `corvid_list_projects` | List all projects |
| `corvid_get_project` | Get project details by ID |
| `corvid_health` | Check server health status |

## Programmatic Usage

```typescript
import { createCorvidMcpServer } from '@corvid-agent/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createCorvidMcpServer({
  baseUrl: 'http://localhost:3000',
  apiKey: 'optional-key',
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## License

MIT
