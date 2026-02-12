# CorvidAgent

AI agent orchestration platform with on-chain messaging via Algorand.

## Features

- **Agent orchestration** -- spawn, manage, and monitor AI agents (Claude + Ollama)
- **Council discussions** -- multi-agent deliberation with structured voting, discussion rounds, and follow-up chat
- **Scheduler** -- cron/interval-based autonomous agent tasks with approval policies
- **Ollama support** -- run local models (Qwen, LLama, etc.) with weight-based concurrency and tok/s metrics
- **AlgoChat** -- on-chain encrypted messaging via Algorand (PSK / X25519)
- **Self-improvement** -- agents create work tasks, branch, validate, and open PRs autonomously
- **Mobile connect** -- QR code PSK exchange for mobile wallet pairing
- **Dashboard** -- Angular UI with analytics, settings, work tasks, system logs, and real-time streaming
- **MCP tools** -- extensible tool system using the Model Context Protocol

## Tech Stack

- [Bun](https://bun.sh) -- runtime and package manager
- [Angular 21](https://angular.dev) -- client UI
- [SQLite](https://bun.sh/docs/api/sqlite) -- persistence via `bun:sqlite`
- [Algorand](https://algorand.co) (`algosdk`) -- on-chain messaging
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) -- agent orchestration
- [Ollama](https://ollama.com) -- local model inference (optional)
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) -- tool protocol

## Quick Start

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
bun install
cp .env.example .env   # edit with your values
bun run build:client
bun run dev
```

The server starts at `http://localhost:3000`.

## Architecture

```
server/          Bun HTTP + WebSocket server, agent process management
  algochat/      AlgoChat on-chain messaging layer
  db/            SQLite schema and queries
  lib/           Shared utilities (logger, crypto, validation)
  mcp/           MCP tool server and coding tools for Ollama agents
  middleware/    HTTP/WS auth, CORS, startup security checks
  process/       Agent lifecycle (SDK + direct Ollama execution)
  providers/     LLM provider registry (Anthropic, Ollama)
  routes/        REST API routes (agents, sessions, schedules, councils)
  scheduler/     Cron/interval schedule execution engine
  selftest/      Self-test service
  work/          Task/work item management
  ws/            WebSocket handlers
client/          Angular 21 SPA (standalone components, signals)
shared/          TypeScript types and WebSocket protocol shared between server and client
deploy/          Dockerfile, docker-compose, systemd unit, macOS LaunchAgent
e2e/             Playwright end-to-end tests
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ALGOCHAT_MNEMONIC` | 25-word Algorand account mnemonic | -- |
| `ALGORAND_NETWORK` | Algorand network (`localnet`, `testnet`, `mainnet`) | `testnet` |
| `ALGOCHAT_SYNC_INTERVAL` | Polling interval for on-chain messages (ms) | `30000` |
| `ALGOCHAT_DEFAULT_AGENT_ID` | Default agent ID for AlgoChat | -- |
| `ALGOCHAT_OWNER_ADDRESSES` | Comma-separated Algorand addresses authorized for admin commands | -- (open) |
| `ALGOCHAT_PSK_URI` | Pre-shared key URI for encrypted AlgoChat channels | -- |
| `AGENT_NETWORK` | Network for agent sub-wallets | `localnet` |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude agents | -- |
| `PORT` | HTTP server port | `3000` |
| `BIND_HOST` | Bind address (`127.0.0.1` for localhost, `0.0.0.0` for Docker/VM) | `127.0.0.1` |
| `API_KEY` | Bearer token for HTTP/WS auth (required when `BIND_HOST` is non-localhost) | -- |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `*` |
| `WALLET_ENCRYPTION_KEY` | AES-256 key for wallet encryption at rest | derived from mnemonic |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | `info` |
| `GH_TOKEN` | GitHub token for work task PR creation | -- |
| `OLLAMA_URL` | Ollama API base URL | `http://localhost:11434` |
| `OLLAMA_MAX_PARALLEL` | Max concurrency weight budget for Ollama | `3` |
| `SCHEDULER_ENABLED` | Enable the autonomous scheduler | `true` |
| `SCHEDULER_MAX_CONCURRENT` | Max concurrent schedule executions | `2` |

Copy `.env.example` to `.env` and fill in your values. Bun loads `.env` automatically.

## Testing

```bash
bun test                 # unit tests
bun run test:e2e         # Playwright e2e (requires AlgoKit localnet)
```

## Deployment

See the `deploy/` directory for production configurations:

- `Dockerfile` + `docker-compose.yml` -- containerized deployment
- `corvid-agent.service` -- systemd unit for Linux
- `com.corvidlabs.corvid-agent.plist` -- macOS LaunchAgent
- `daemon.sh` -- cross-platform daemon installer
- `nginx/` + `caddy/` -- reverse proxy configs with TLS termination

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](SECURITY.md) for responsible disclosure.

## License

[MIT](LICENSE)
