---
spec: doctor.spec.md
sources:
  - cli/commands/doctor.ts
---

## Layout

The CLI lives in `cli/` with commands in `cli/commands/`:

```
cli/
  index.ts             — Entry point: registers all subcommands (doctor, chat, init, login, etc.)
  config.ts            — loadConfig(): reads server URL from ~/.corvid-agent/config.json
  render.ts            — c color/formatting helpers (chalk-like)
  commands/
    doctor.ts          — doctorCommand(): comprehensive system health check
    chat.ts            — Interactive chat session
    init.ts            — Project initialization
    login.ts           — Authentication
    agent.ts           — Agent management commands
    session.ts         — Session management
    status.ts          — Server status
    settings.ts        — Settings management
    interactive.ts     — Interactive REPL mode
    pick-agent.ts      — Agent selection UI
    ...
```

## Components

### doctorCommand (commands/doctor.ts)
Runs a sequential series of health checks, printing pass/fail for each:

| Check | What It Validates |
|-------|------------------|
| Bun version | `>= 1.0` via `bun --version` |
| Node.js | Installed and accessible |
| Database | `corvid-agent.db` exists at project root |
| Anthropic API key | `ANTHROPIC_API_KEY` is set in env or `.env` |
| Server port | Localhost port (default 3000) is accessible |
| AlgoChat/Algorand | localnet `algod` is reachable at `http://localhost:4001` |
| GitHub token | `GITHUB_TOKEN` is valid (HTTP 200 from GitHub API) |

### Project Root Discovery
Walks up from `cwd()` searching for `package.json` containing `"corvid-agent"`. Used to locate the database file and `.env`. Falls back to showing an error if not found.

### Environment Loading
Uses a custom `.env` loader that reads key=value pairs without overwriting existing `process.env` entries. This matches the server's own env loading behavior.

### Output Format
Each check prints: `[icon] Check name — optional detail`
- Pass: green checkmark `✓`
- Fail: red cross `✗` with fix suggestion on the next line

Exit code 1 if any check fails; exit code 0 if all pass.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| Default server port | `3000` | Port checked for server accessibility |
| AlgoChat algod URL | `http://localhost:4001` | Localnet algod health check target |
| GitHub API URL | `https://api.github.com/user` | Used to validate GitHub token |

## Assets

### Consumed By
- `cli/index.ts` — registers `doctor` as a subcommand via `program.command('doctor')`

### Dependencies
- `cli/config.ts` — `loadConfig()` for configured server URL
- `cli/render.ts` — color formatting helpers for terminal output
