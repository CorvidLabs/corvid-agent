# CLI Reference

The `corvid-agent` CLI provides commands for managing agents, sessions, and configuration. It communicates with a running corvid-agent server.

```bash
corvid-agent [command] [options]
```

Global options:

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help (works on any command) |
| `--version`, `-v` | Show version |
| `--agent <id>` | Agent ID override |
| `--project <id>` | Project ID override |
| `--model <model>` | Model override |

---

## Table of Contents

- [Interactive REPL](#interactive-repl)
- [init](#init)
- [demo](#demo)
- [chat](#chat)
- [status](#status)
- [agent](#agent)
- [session](#session)
- [config](#config)
- [login](#login)
- [logout](#logout)

---

## Interactive REPL

Start an interactive chat session with an agent.

```bash
corvid-agent
corvid-agent --agent <id>
```

| Option | Description |
|--------|-------------|
| `--agent <id>` | Agent to chat with. If omitted, uses the default or prompts to pick one. |

### REPL commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/agent` | Switch to a different agent |
| `/clear` | Clear conversation history |
| `/status` | Show server status |
| `/quit`, `/exit` | Exit the REPL |
| `!<cmd>` | Run a shell command (e.g. `!ls -la`) |

### Examples

```bash
# Start interactive mode with default agent
corvid-agent

# Start with a specific agent
corvid-agent --agent abc12345
```

---

## init

Interactive project setup. Creates `.env`, installs dependencies, and optionally creates your first agent.

```bash
corvid-agent init [options]
```

| Option | Description |
|--------|-------------|
| `--mcp` | MCP-only setup: adds corvid-agent as an MCP server to Claude Code, Cursor, VS Code Copilot, and OpenCode. Also installs Agent Skills. |
| `--full` | Full setup including Angular dashboard build. |
| `--yes`, `-y` | Non-interactive mode with sensible defaults. Auto-detects Claude CLI and Ollama. |

### What init does

1. **Checks prerequisites** — Bun 1.3+, Git (required); Ollama, Claude CLI, Docker (optional)
2. **Creates `.env`** — Prompts for API keys, port, network (or uses defaults with `--yes`)
3. **Installs dependencies** — Runs `bun install`
4. **Builds dashboard** — Only with `--full`; otherwise prints instructions
5. **Creates default agent** — Prompts for name (or uses "Assistant" with `--yes`)

If run outside a corvid-agent directory, init offers to clone the repository first.

### Examples

```bash
# Guided interactive setup
corvid-agent init

# Full unattended setup
corvid-agent init --full --yes

# Just add MCP tools to your AI editor
corvid-agent init --mcp
```

---

## demo

Run a self-contained demo session. Starts a temporary server (or uses a running one), creates a demo agent, and streams a sample conversation. Everything is cleaned up on exit.

```bash
corvid-agent demo
```

No options. The demo uses port 3001 by default (to avoid conflicting with a running server on 3000). If a server is already running on port 3000, it uses that instead.

### Examples

```bash
corvid-agent demo
```

---

## chat

Send a one-shot message to an agent and stream the response.

```bash
corvid-agent chat "<prompt>" [options]
```

| Option | Description |
|--------|-------------|
| `--agent <id>` | Agent ID. If omitted, uses the default or prompts to pick one. |
| `--project <id>` | Project ID. If omitted, auto-detects from the current working directory. |
| `--model <model>` | Model override for this message. |

The command connects via WebSocket, sends the prompt, streams the response (including tool use and thinking indicators), then exits.

### Examples

```bash
# Ask a question
corvid-agent chat "What files are in this project?"

# Use a specific agent
corvid-agent chat "Fix the bug in auth.ts" --agent abc12345

# Override the model
corvid-agent chat "Summarize recent changes" --model claude-sonnet-4-20250514
```

---

## status

Check server health and display status information.

```bash
corvid-agent status
```

Shows:

- Server status and URL
- Uptime
- Active sessions count
- AlgoChat enabled/disabled
- Scheduler status (active schedules, running executions)
- Workflow status (total workflows, active runs)

### Examples

```bash
corvid-agent status
```

---

## agent

Manage agents.

```bash
corvid-agent agent <action> [id] [options]
```

### Actions

#### `agent list`

List all agents in a table showing ID, name, model, provider, permission mode, AlgoChat status, and whether each is the default.

```bash
corvid-agent agent list
```

#### `agent get <id>`

Show details for a specific agent: name, model, permission mode, description, AlgoChat status, wallet address, and creation date.

```bash
corvid-agent agent get <id>
```

#### `agent create`

Create a new agent.

```bash
corvid-agent agent create --name <name> [options]
```

| Option | Description |
|--------|-------------|
| `--name <name>` | Agent name (required) |
| `--description <text>` | Agent description |
| `--model <model>` | Model to use (e.g. `claude-sonnet-4-20250514`) |
| `--system-prompt <text>` | System prompt for the agent |

### Examples

```bash
corvid-agent agent list
corvid-agent agent get abc12345
corvid-agent agent create --name "Reviewer" --model claude-sonnet-4-20250514
corvid-agent agent create --name "Writer" --description "Writes documentation"
```

---

## session

Manage sessions.

```bash
corvid-agent session <action> [id]
```

### Actions

#### `session list`

List all sessions in a table showing ID, status, agent, source, turn count, cost, and creation date.

```bash
corvid-agent session list
```

#### `session get <id>`

Show session details: status, agent, project, source, turns, cost, creation date, and initial prompt (truncated).

```bash
corvid-agent session get <id>
```

#### `session stop <id>`

Stop a running session.

```bash
corvid-agent session stop <id>
```

#### `session resume <id>`

Resume a stopped session.

```bash
corvid-agent session resume <id>
```

### Examples

```bash
corvid-agent session list
corvid-agent session get abc12345
corvid-agent session stop abc12345
corvid-agent session resume abc12345
```

---

## config

Manage CLI configuration. Config is stored in `~/.corvid/config.json`.

```bash
corvid-agent config [action] [key] [value]
```

### Actions

#### `config show`

Show all config values. This is the default when no action is given.

```bash
corvid-agent config
corvid-agent config show
```

#### `config get <key>`

Get a specific config value.

```bash
corvid-agent config get <key>
```

#### `config set <key> <value>`

Set a config value. Use `"null"` to clear a value.

```bash
corvid-agent config set <key> <value>
```

### Valid keys

| Key | Description | Default |
|-----|-------------|---------|
| `serverUrl` | Server URL | `http://127.0.0.1:3000` |
| `authToken` | Authentication token | — |
| `defaultAgent` | Default agent ID | — |
| `defaultProject` | Default project ID | — |
| `defaultModel` | Default model override | — |

### Examples

```bash
corvid-agent config
corvid-agent config get serverUrl
corvid-agent config set serverUrl http://localhost:3578
corvid-agent config set defaultAgent abc123
corvid-agent config set authToken null    # clear the token
```

---

## login

Log in to CorvidAgent Cloud using the device authorization flow. Opens a browser, displays a user code, and waits for authorization.

```bash
corvid-agent login [options]
```

| Option | Description |
|--------|-------------|
| `--server <url>` | Server URL (default: from config or `http://127.0.0.1:3000`) |

The token is saved to `~/.corvid/config.json`.

### Examples

```bash
corvid-agent login
corvid-agent login --server https://your-server.example.com
```

---

## logout

Log out by removing the saved authentication token from `~/.corvid/config.json`.

```bash
corvid-agent logout
```

### Examples

```bash
corvid-agent logout
```
