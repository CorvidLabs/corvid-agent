<p align="center">
  <img src="https://img.shields.io/badge/version-0.63.1-4a90d9" alt="Version">
  <a href="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml"><img src="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/github/license/CorvidLabs/corvid-agent" alt="License">
  <a href="https://codecov.io/gh/CorvidLabs/corvid-agent"><img src="https://codecov.io/gh/CorvidLabs/corvid-agent/graph/badge.svg" alt="Coverage"></a>
</p>

# corvid-agent

corvid-agent is an open-source AI agent platform that combines LLM-powered coding with on-chain identity (Algorand/AlgoChat), multi-agent orchestration, and integrations with Discord, Telegram, and GitHub. Agents can write code, open pull requests, send encrypted messages to each other on-chain, deliberate in multi-agent councils, and store long-term memories as Algorand assets — all coordinated through a web dashboard or chat interfaces.

**[Website](https://corvid-agent.github.io)** | **[Docs](docs/README.md)** | **[Skills](skills/README.md)** | **[Architecture](docs/how-it-works.md)** | **[API Reference](docs/api-reference.md)**

---

## Try it now (no setup required)

If you have [Bun](https://bun.sh) installed and either **Claude Code CLI** or **Ollama**, you can run corvid-agent in 30 seconds — no API key, no Docker, no `.env`:

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
bun install
bun run try
```

`bun run try` starts a sandboxed server, auto-detects your AI provider, seeds a demo agent, and opens the dashboard. Press `Ctrl+C` to stop.

> **Need an AI provider?** The fastest options: install [Claude Code](https://claude.ai/code) (uses your existing subscription) or [Ollama](https://ollama.ai) (free, runs locally). No account needed for Ollama.

---

## Full setup (for development)

For production use, on-chain messaging (AlgoChat), and the full dashboard, follow the complete setup.

### Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| **Bun** ≥ 1.1 | Runtime, package manager, test runner | [bun.sh](https://bun.sh) |
| **Docker** | AlgoKit localnet (Algorand blockchain) | [docker.com](https://www.docker.com) |
| **AlgoKit** | Algorand local development tools | `pip install algokit` or [docs](https://developer.algorand.org/algokit) |
| **Node.js** ≥ 20 | Angular CLI for the client | [nodejs.org](https://nodejs.org) |
| **Anthropic API key** | Powers the AI agents (Claude) | [console.anthropic.com](https://console.anthropic.com) |

> **Note:** If you have the Claude Code CLI installed (`claude` on PATH), the server will use your subscription automatically — no API key needed.

### 1. Clone and install dependencies

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
bun install
```

### 2. Configure your environment

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```bash
ANTHROPIC_API_KEY=sk-ant-...   # Your Claude API key
ALGORAND_NETWORK=localnet       # Always localnet for local dev
```

All other settings have sensible defaults. See `.env.example` for the full reference.

### 3. Start Algorand localnet

AlgoChat (on-chain agent messaging) requires a local Algorand node:

```bash
algokit localnet start
```

This starts a local Algorand blockchain using Docker. Keep it running in the background.

### 4. Run the server

```bash
bun run dev
```

The server starts at `http://localhost:3000` with hot-reload. On first run it:
- Runs all database migrations automatically
- Creates the agent wallet on localnet
- Starts the AlgoChat listener

### 5. Run the client (optional)

The Angular dashboard gives you a full web UI:

```bash
bun run dev:client
```

The dashboard opens at `http://localhost:4200`.

You can also interact with agents directly via AlgoChat, Discord, or Telegram without the dashboard.

---

## What you can do

### Work Tasks — automated code changes
Tell an agent to implement a GitHub issue. It clones the repo into an isolated git worktree, writes code, runs tests, and opens a pull request — fully automated.

```
"Fix the bug in issue #42 and open a PR"
```

See [skills/work-tasks/SKILL.md](skills/work-tasks/SKILL.md) for details.

### AlgoChat — on-chain encrypted messaging
Agents communicate with each other via X25519-encrypted messages recorded on the Algorand blockchain. Every message is verifiable and tamper-evident. You can also send commands to agents through AlgoChat using pre-shared key (PSK) contacts.

See [skills/algochat/SKILL.md](skills/algochat/SKILL.md) for details.

### Multi-Agent Councils
Spawn a council of agents that debate a problem through structured discussion rounds, then synthesize a final answer. Useful for code reviews, architecture decisions, and high-stakes tasks where a single agent opinion isn't enough.

See [skills/orchestration/SKILL.md](skills/orchestration/SKILL.md) for details.

### Memory — three-tier persistence
Agents store memories at three levels:
- **SQLite** — fast, ephemeral session state
- **ARC-69 ASAs** — long-term mutable memories stored as Algorand assets
- **Plain transactions** — permanent, immutable on-chain records

See [skills/memory/SKILL.md](skills/memory/SKILL.md) for details.

### Discord & Telegram bridges
Connect an agent to a Discord channel or Telegram bot. Users chat with the agent naturally; the agent can send embeds, handle slash commands, and route messages between channels.

See [skills/discord/SKILL.md](skills/discord/SKILL.md) and [skills/telegram/SKILL.md](skills/telegram/SKILL.md).

### Scheduling
Schedule agents to run on cron schedules — daily summaries, periodic health checks, automated issue triage, and more.

See [skills/scheduling/SKILL.md](skills/scheduling/SKILL.md).

---

## Skills reference

The `skills/` directory contains detailed guides for every capability:

```
skills/
  algochat/SKILL.md          # On-chain messaging and agent discovery
  coding/SKILL.md            # File operations and shell commands
  github/SKILL.md            # PRs, issues, reviews
  memory/SKILL.md            # Three-tier memory system
  orchestration/SKILL.md     # Councils and multi-agent workflows
  work-tasks/SKILL.md        # Automated code changes and PRs
  scheduling/SKILL.md        # Cron-based task automation
  discord/SKILL.md           # Discord bridge
  telegram/SKILL.md          # Telegram bridge
  smart-contracts/SKILL.md   # Algorand smart contracts
  ... 29 skills total
```

**[Full skill list →](skills/README.md)**

---

## Architecture

```
corvid-agent/
├── server/          — Bun server (API, WebSocket, process management)
│   ├── algochat/    — On-chain messaging, wallets, agent directory
│   ├── db/          — SQLite via bun:sqlite (sessions, agents, projects, memory)
│   ├── discord/     — Bidirectional Discord bridge
│   ├── mcp/         — MCP tool definitions and handlers (corvid_* tools)
│   ├── process/     — Session lifecycle, SDK integration, approval flow
│   ├── routes/      — HTTP API routes (55+ modules)
│   ├── telegram/    — Bidirectional Telegram bridge
│   └── work/        — Work task service (branch, run agent, validate, PR)
├── client/          — Angular 21 mobile-first dashboard
├── shared/          — TypeScript types shared by server and client
├── skills/          — AI agent skill documentation (29 skill files)
├── specs/           — Module specifications (source of truth)
└── deploy/          — Dockerfile, docker-compose, systemd, macOS LaunchAgent
```

The server exposes a REST API and WebSocket endpoint. The client connects to the server at `localhost:3000`. Agents run as child processes spawned by the server, communicate through the Claude Agent SDK, and have access to 56 MCP tools covering GitHub, AlgoChat, scheduling, memory, and more.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Database | SQLite via `bun:sqlite` (42 migrations, schema v119) |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` |
| MCP | `@modelcontextprotocol/sdk` |
| Frontend | Angular 21 (standalone components, signals) |
| Blockchain | Algorand (AlgoChat, wallets, ARC-69 memory) |
| Voice | OpenAI TTS (`tts-1`) and Whisper (STT) |

---

## Coding conventions

- TypeScript strict mode, named exports (no default exports)
- `bun:sqlite` for database, `bun:test` for tests
- `createLogger('ModuleName')` for logging
- `Bun.spawn` over `child_process` for subprocesses
- Read the relevant spec in `specs/` before modifying any module

---

## Verification

Run before committing:

```bash
fledge lanes run verify               # Full pipeline: lint, typecheck, test, spec-check
```

Individual tasks:

```bash
fledge run lint                       # Biome lint
fledge run typecheck                  # TypeScript type check
fledge run test                       # Test suite
fledge run spec-check                 # Spec invariant verification
```

See [skills/verification/SKILL.md](skills/verification/SKILL.md) for details.

---

## Algorand network

- **`localnet`** — Used for all local development. Requires Docker + `algokit localnet start`. Free, instant, self-contained. This is always the right setting for `ALGORAND_NETWORK` in `.env`.
- **`testnet` / `mainnet`** — Only for communicating with external users or other corvid-agent instances on different machines.

**Never set `ALGORAND_NETWORK=testnet` for local development.** Testnet wallets cost real testnet ALGO and transactions are slow.

---

## Backup

Back up `corvid-agent.db` daily via the built-in endpoint:

```bash
curl -X POST http://localhost:3000/api/backup -H "Authorization: Bearer $API_KEY"
```

Also back up `wallet-keystore.json` (encrypted) and `.env` — losing the keystore means permanent loss of agent wallet access. See **[Backup & Recovery →](docs/backup-and-recovery.md)** for full procedures including restore steps, scheduling, and disaster recovery.

---

## Contributing

Open source because AI agents should be owned by the people who run them.

- **[Good first issues](https://github.com/CorvidLabs/corvid-agent/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)**
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — setup takes ~2 minutes
- **[Discussions](https://github.com/CorvidLabs/corvid-agent/discussions)**

## License

[MIT](LICENSE)
