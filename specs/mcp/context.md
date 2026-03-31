# MCP (Coding Tools) — Context

## Why This Module Exists

Agents need to interact with the filesystem, run shell commands, and search code. The MCP module provides these capabilities as tool definitions that LLM providers can call. It also assembles the complete tool catalog (MCP-based tools + direct coding tools) into a filtered, permission-aware set for each agent session.

## Architectural Role

MCP is the **tool layer** — it defines what agents can *do*, not what they *know*. Every agent capability that involves side effects (file writes, command execution, API calls) is exposed through MCP tools.

## Key Design Decisions

- **Direct execution engine for Ollama**: Ollama agents can't use MCP natively, so the coding tools module provides equivalent functionality via a direct tool definition format.
- **Permission filtering**: Tools are filtered per-agent based on permissions. Not all agents get all tools.
- **Tool categories**: Tools are organized into categories (coding, memory, communication, etc.) for UI display and permission grouping.

## Relationship to Other Modules

- **Process Manager**: Tools are registered per session.
- **Permissions**: Tool access is gated by the permission broker.
- **AST**: Code navigation tools delegate to the AST service.
- **Memory**: Memory tools (`corvid_save_memory`, `corvid_recall_memory`) are MCP tools.
- **Browser**: The `corvid_browser` tool delegates to the browser service.
