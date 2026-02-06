# CorvidAgent

AI agent orchestration platform with on-chain messaging via Algorand.

## Features

- **Agent orchestration** -- spawn, manage, and monitor Claude-powered agents
- **Council discussions** -- multi-agent deliberation with structured voting
- **AlgoChat** -- on-chain messaging and group transactions via Algorand
- **Mobile chat client** -- responsive Angular UI with real-time WebSocket updates
- **MCP tools** -- extensible tool system using the Model Context Protocol
- **Work tasks** -- persistent task tracking with SQLite

## Tech Stack

- [Bun](https://bun.sh) -- runtime and package manager
- [Angular 21](https://angular.dev) -- client UI
- [SQLite](https://bun.sh/docs/api/sqlite) -- persistence via `bun:sqlite`
- [Algorand](https://algorand.co) (`algosdk`) -- on-chain messaging
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) -- agent orchestration
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
  mcp/           MCP tool server
  process/       Agent lifecycle management
  routes/        REST API routes
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
| `JWT_SECRET` | **Required in production.** Generate with `openssl rand -hex 32` | dev default |
| `ADMIN_PASSWORD` | Password for default admin account (auto-generated if unset) | random |
| `API_KEY` | API key for programmatic access (unset = no key auth) | -- |
| `PORT` | HTTP server port | `3000` |

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
- `daemon.sh` -- helper script

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](SECURITY.md) for responsible disclosure.

## License

[MIT](LICENSE)
