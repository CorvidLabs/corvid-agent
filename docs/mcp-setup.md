# MCP Setup Guide

CorvidAgent exposes **56 MCP tools** (`corvid_*`) via standard [Model Context Protocol](https://modelcontextprotocol.io) stdio transport. This means it works with any MCP-compatible AI assistant.

## Quick Setup

```bash
corvid-agent init --mcp
```

This auto-detects installed editors and writes the config for Claude Code, Cursor, VS Code / Copilot, and OpenCode.

---

## Per-Client Setup

All clients use the same MCP server config. The only difference is where the config file lives.

### Config Snippet

**Local mode** (when running from the corvid-agent repo):

```json
{
  "corvid-agent": {
    "command": "bun",
    "args": ["<path-to-repo>/server/mcp/stdio-server.ts"],
    "env": {
      "CORVID_API_URL": "http://127.0.0.1:3000"
    }
  }
}
```

**Remote mode** (connecting to a running server):

```json
{
  "corvid-agent": {
    "command": "npx",
    "args": ["-y", "corvid-agent-mcp"],
    "env": {
      "CORVID_AGENT_URL": "http://your-server:3000",
      "CORVID_AGENT_API_KEY": "your-api-key"
    }
  }
}
```

---

### Claude Code

**Config path:** `~/.claude/claude_desktop_config.json`

Add the config snippet under `mcpServers`:

```json
{
  "mcpServers": {
    "corvid-agent": { ... }
  }
}
```

Restart Claude Code after editing.

---

### Cursor

**Config path:** `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "corvid-agent": { ... }
  }
}
```

Restart Cursor after editing.

---

### GitHub Copilot (VS Code)

**Config path:** `.vscode/mcp.json` (per-project) or VS Code settings

Create `.vscode/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "corvid-agent": {
      "command": "npx",
      "args": ["-y", "corvid-agent-mcp"],
      "env": {
        "CORVID_AGENT_URL": "http://127.0.0.1:3000"
      }
    }
  }
}
```

Or add to VS Code settings (`settings.json`):

```json
{
  "github.copilot.chat.mcp.servers": {
    "corvid-agent": {
      "command": "npx",
      "args": ["-y", "corvid-agent-mcp"],
      "env": {
        "CORVID_AGENT_URL": "http://127.0.0.1:3000"
      }
    }
  }
}
```

Reload VS Code window after editing.

---

### OpenCode

**Config path:** `~/.config/opencode/config.json` or `opencode.json` in project root

```json
{
  "mcpServers": {
    "corvid-agent": {
      "command": "npx",
      "args": ["-y", "corvid-agent-mcp"],
      "env": {
        "CORVID_AGENT_URL": "http://127.0.0.1:3000"
      }
    }
  }
}
```

---

### Codex CLI

**Config path:** `codex.json` in project root or `~/.codex/config.json`

```json
{
  "mcpServers": {
    "corvid-agent": {
      "command": "npx",
      "args": ["-y", "corvid-agent-mcp"],
      "env": {
        "CORVID_AGENT_URL": "http://127.0.0.1:3000"
      }
    }
  }
}
```

---

### Any Other MCP Client

CorvidAgent uses the standard MCP stdio transport. Any client that supports MCP can connect by running:

```bash
npx -y corvid-agent-mcp
```

with environment variables `CORVID_AGENT_URL` and optionally `CORVID_AGENT_API_KEY`.

---

## Troubleshooting

### `bun` not found

Some editors may not have `bun` in their PATH. Use `npx corvid-agent-mcp` instead of the local `bun server/mcp/stdio-server.ts` command.

### Environment variables not passed

Each editor handles env vars differently. If tools fail with "API error", check that:
- `CORVID_AGENT_URL` or `CORVID_API_URL` points to a running server
- `CORVID_AGENT_API_KEY` is set if the server requires auth (non-localhost)

### Tools not appearing

After editing the MCP config file:
1. Restart the editor / reload the window
2. Check the MCP server logs for errors
3. Verify the server is running: `curl http://127.0.0.1:3000/api/health`

### Which tools are available?

The stdio server exposes 4 core tools: `corvid_send_message`, `corvid_save_memory`, `corvid_recall_memory`, `corvid_list_agents`.

The full `corvid-agent-mcp` npm package exposes 14 tools including agents, sessions, work tasks, and projects.

When connected via the web dashboard or Claude Agent SDK, all 56 tools are available.

---

## Agent Skills

`corvid-agent init --mcp` also installs **Agent Skills** — markdown files that teach your AI assistant when and how to use each tool group. Skills are installed to:

| Editor | Skills Path |
|--------|------------|
| Claude Code | `.claude/skills/` |
| Cursor | `.cursor/rules/` |
| VS Code / Copilot | `.github/skills/` |
