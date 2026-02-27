<p align="center">
  <img src="https://img.shields.io/badge/version-0.13.0-blue" alt="Version">
  <a href="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml"><img src="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/github/license/CorvidLabs/corvid-agent" alt="License">
  <img src="https://img.shields.io/badge/runtime-Bun_1.3-f9f1e1?logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/Angular-21-dd0031?logo=angular" alt="Angular 21">
  <img src="https://img.shields.io/badge/tests-1757%20unit%20%7C%20348%20E2E-brightgreen" alt="1757 Unit | 348 E2E Tests">
  <a href="https://codecov.io/gh/CorvidLabs/corvid-agent"><img src="https://codecov.io/gh/CorvidLabs/corvid-agent/graph/badge.svg" alt="Coverage"></a>
</p>

# corvid-agent

**Decentralized development agent platform built on Algorand.**

Spawns, orchestrates, and monitors AI agents that do real software engineering work — picking up tasks, writing code, creating branches, validating changes, opening PRs, and deliberating with other agents about decisions. The key differentiator: agents have **verifiable on-chain identities**, communicate through **encrypted cryptographic channels**, and can form **decentralized networks** where trust is established through blockchain.

See [VISION.md](VISION.md) for the full manifesto on positioning, architecture, competitive landscape, and long-term direction.

Built with [Bun](https://bun.sh), [Angular 21](https://angular.dev), [SQLite](https://bun.sh/docs/api/sqlite), [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk), and [Algorand](https://algorand.co).

---

## Quick Start

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
bash scripts/dev-setup.sh    # guided setup: prerequisites, env, deps, build
bun run dev
```

Or manually:

```bash
bun install
cp .env.example .env   # add your ANTHROPIC_API_KEY
bun run build:client
bun run dev
```

Server starts at `http://localhost:3000`. See `.env.example` for all configuration options.

---

## Architecture

```
+--------------------------------------------------+
|              AGENT RUNTIME                        |
|  Claude SDK · Ollama · MCP Tools (36+)            |
|  Council Deliberation · Self-Improvement Pipeline |
|  Memory · AST Code Analysis · Model Exams         |
+--------------------------------------------------+
|              TRUST LAYER (Algorand)               |
|  On-Chain Identity · AlgoChat (encrypted P2P)     |
|  Agent Directory · Transaction Audit Trail        |
+--------------------------------------------------+
|              INTERFACE LAYER                      |
|  Angular Web UI · Discord · Telegram              |
|  GitHub Integration · REST + WebSocket API        |
|  Google A2A Protocol                              |
+--------------------------------------------------+
```

### What Agents Do

1. **Scheduled runs** trigger multiple times per day
2. Agent reviews its **work queue**, creates feature branches, implements changes using **MCP tools**
3. Runs **validation** (TypeScript, tests, build) — iterates up to N times on failure
4. Opens **pull requests** with descriptions, or flags for human review
5. For complex decisions, **convenes a council** of specialist agents
6. Results communicated via Discord, Telegram, GitHub, and AlgoChat

### What Makes It Different

- **On-chain identity** — every agent gets an Algorand wallet as its cryptographically verifiable identity
- **Encrypted inter-agent messaging** — AlgoChat provides P2P communication across network boundaries
- **Structured multi-agent deliberation** — council voting with recorded reasoning
- **Self-improvement pipeline** — agents propose changes to their own codebase via PRs
- **Blockchain audit trail** — immutable record of all inter-agent actions

---

## Core Capabilities

| Category | Details |
|---|---|
| **Agent Sessions** | Claude SDK + Ollama, configurable prompts/tools/budgets, real-time WebSocket streaming |
| **Work Tasks** | Git worktree isolation, branch/validate/PR pipeline, up to 3 iteration attempts |
| **Council Deliberation** | Multi-agent structured discussion, voting rounds, chairman synthesis |
| **Self-Improvement** | Agents call `corvid_create_work_task` to propose codebase changes autonomously |
| **AlgoChat** | On-chain encrypted messaging (PSK + X25519), wallet identity, slash commands |
| **Telegram Bridge** | Bidirectional long-polling, voice notes (Whisper STT), voice responses (OpenAI TTS) |
| **Discord Bridge** | Raw WebSocket gateway (no discord.js), auto-reconnect, heartbeat |
| **Slack Integration** | Bidirectional bridge, notification delivery, question routing with response buttons |
| **Personas & Skills** | Archetype/trait system for agent personality, composable skill bundles for capabilities |
| **Graph Workflows** | DAG-based multi-step orchestration with suspend/resume |
| **Scheduling** | Cron/interval automation with configurable approval policies |
| **AST Analysis** | Tree-sitter parsing for TypeScript, JavaScript, Python, Go, Rust and more |
| **Model Exams** | 18 test cases across 6 categories for validating agent capabilities |
| **Memory** | Structured memory with vector embeddings, FTS5 search |
| **Voice** | OpenAI TTS (6 presets) + Whisper STT with intelligent caching |
| **Notifications** | Multi-channel delivery: Discord, Telegram, GitHub Issues, AlgoChat |
| **A2A Protocol** | Google Agent-to-Agent interop (inbound tasks, agent card) |
| **Observability** | OpenTelemetry tracing, Prometheus metrics, immutable audit logging |

---

## MCP Tools (36)

Extensible tool system via [Model Context Protocol](https://github.com/modelcontextprotocol/sdk):

| Category | Tools |
|---|---|
| **Messaging** | `corvid_send_message`, `corvid_list_agents` |
| **Memory** | `corvid_save_memory` (on-chain encrypted), `corvid_recall_memory` (FTS5) |
| **GitHub** | `star_repo`, `fork_repo`, `list_prs`, `create_pr`, `review_pr`, `get_pr_diff`, `comment_on_pr`, `create_issue`, `list_issues`, `repo_info`, `unstar_repo`, `follow_user` |
| **Automation** | `corvid_create_work_task`, `corvid_manage_schedule`, `corvid_manage_workflow` |
| **Discovery** | `corvid_discover_agent`, `corvid_invoke_remote_agent` (A2A protocol) |
| **Web** | `corvid_web_search` (Brave), `corvid_deep_research` (multi-angle) |
| **Credits** | `corvid_check_credits`, `corvid_grant_credits`, `corvid_credit_config` |
| **Owner Comms** | `corvid_notify_owner`, `corvid_ask_owner`, `corvid_configure_notifications` |
| **Reputation** | `corvid_check_reputation`, `corvid_check_health_trends`, `corvid_publish_attestation`, `corvid_verify_agent_reputation` |
| **Code** | `corvid_code_symbols` (AST symbols), `corvid_find_references` (cross-file refs) |
| **Session** | `corvid_extend_timeout` |

Tools are permission-scoped per agent via skill bundles and agent-level allowlists.

---

## Project Structure

```
server/           Bun HTTP + WebSocket server
  a2a/            Google A2A protocol (inbound tasks, agent card)
  algochat/       On-chain messaging (bridge, wallet, directory, messenger)
  ast/            Tree-sitter AST parser for code understanding
  billing/        Usage metering and billing
  db/             SQLite schema (47 migrations) and query modules
  discord/        Bidirectional Discord bridge (raw WebSocket gateway)
  docs/           OpenAPI generator, MCP tool docs, route registry
  exam/           Model exam system (18 tests, 6 categories)
  github/         GitHub API operations (PRs, issues, reviews)
  improvement/    Self-improvement pipeline and health metrics
  lib/            Shared utilities (logger, crypto, validation, web search, dedup)
  marketplace/    Agent marketplace (publish, discover, consume services)
  mcp/            MCP tool server and 36 corvid_* tool handlers
  memory/         Structured memory with vector embeddings
  middleware/     Auth, CORS, rate limiting, startup validation
  notifications/  Multi-channel delivery (Discord, Telegram, GitHub, AlgoChat)
  observability/  Metrics and health monitoring
  plugins/        Plugin SDK and dynamic tool registration
  polling/        GitHub mention polling for @mention-driven automation
  process/        Agent lifecycle (SDK + Ollama, approval, persona/skill injection)
  providers/      Multi-model cost-aware routing
  public/         Static assets served by the HTTP server
  reputation/     Reputation and trust scoring
  routes/         REST API routes (28 route modules)
  sandbox/        Container sandboxing for isolated execution
  scheduler/      Cron/interval execution engine
  selftest/       Self-test and validation utilities
  slack/          Bidirectional Slack bridge (channel adapter, notifications)
  telegram/       Bidirectional Telegram bridge (long-polling, voice)
  tenant/         Multi-tenant isolation and access control
  voice/          TTS (OpenAI) and STT (Whisper) with caching
  webhooks/       GitHub webhook and mention polling
  work/           Work task service (worktree, branch, validate, PR)
  workflow/       Graph-based DAG workflow orchestration engine
  ws/             WebSocket handlers with pub/sub
client/           Angular 21 SPA (standalone components, signals)
shared/           TypeScript types shared between server and client
deploy/           Docker, docker-compose, systemd, launchd, nginx, caddy
e2e/              Playwright end-to-end tests (30 spec files, 348 tests)
```

---

## Testing

```bash
bun test              # 1757 server tests (~30s)
cd client && npx vitest run   # Angular component tests (~2s)
bun run test:e2e      # 30 Playwright spec files, 348 tests
bun run spec:check    # Validate all module specs in specs/
```

**1757+ unit tests** covering: API routes, audit logging, authentication, bash security, billing, CLI, credit system, crypto, database migrations, Discord bridge, GitHub tools, marketplace, MCP tool handlers, notifications, multi-model routing, observability, owner communication, personas, plugins, process lifecycle, rate limiting, reputation, sandbox isolation, scheduling, skill bundles, Slack bridge, Telegram bridge, tenant isolation, validation, voice TTS/STT, wallet keystore, web search, workflows, work tasks, and Angular components.

**348 E2E tests** across 30 Playwright spec files covering 198/202 testable API endpoints and all 34 Angular UI routes.

**33 module specs** in `specs/` with automated validation via `bun run spec:check`.

---

## Environment Variables

### Required

```bash
ANTHROPIC_API_KEY=sk-ant-...          # Claude agent sessions
```

### Optional

```bash
ALGOCHAT_MNEMONIC=your 25 words ...   # On-chain identity & messaging
OLLAMA_HOST=http://localhost:11434    # Local model inference
TELEGRAM_BOT_TOKEN=123456:ABC-DEF... # Telegram bridge
DISCORD_BOT_TOKEN=your-bot-token     # Discord bridge
SLACK_BOT_TOKEN=xoxb-your-bot-token  # Slack bridge
GH_TOKEN=ghp_...                     # GitHub PR creation
OPENAI_API_KEY=sk-...                # Voice TTS/STT
```

| Variable | Description | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude agents | required |
| `ALGOCHAT_MNEMONIC` | 25-word Algorand account mnemonic | — |
| `ALGORAND_NETWORK` | Network: `localnet`, `testnet`, `mainnet` | `localnet` |
| `PORT` | HTTP server port | `3000` |
| `BIND_HOST` | Bind address | `127.0.0.1` |
| `API_KEY` | Bearer token for auth (required on non-localhost) | — |
| `OLLAMA_HOST` | Ollama API base URL | `http://localhost:11434` |
| `GH_TOKEN` | GitHub token for work tasks and PRs | — |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (enables bridge + notifications) | — |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for the bridge | — |
| `TELEGRAM_ALLOWED_USER_IDS` | Comma-separated authorized Telegram user IDs | — |
| `DISCORD_BOT_TOKEN` | Discord bot token (enables bridge) | — |
| `DISCORD_CHANNEL_ID` | Discord channel ID to listen in | — |
| `SLACK_BOT_TOKEN` | Slack bot token (enables bridge + notifications) | — |
| `SLACK_CHANNEL_ID` | Slack channel ID for the bridge | — |
| `SLACK_SIGNING_SECRET` | Slack signing secret for event verification | — |
| `OPENAI_API_KEY` | OpenAI key for voice TTS/STT | — |
| `BRAVE_API_KEY` | Brave Search API key | — |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |

See `.env.example` for the full list of 30+ options including wallet encryption, ALGO spending caps, scheduler config, and CORS settings.

---

## Security

- **Authentication** — API key required on non-localhost; WebSocket auth enforced
- **Encryption** — AES-256-GCM for wallets and memory; X25519 for on-chain messaging
- **File protection** — agents cannot modify security-critical files (enforced at runtime)
- **Bash validation** — dangerous commands blocked before execution
- **Environment isolation** — agent subprocesses receive only safe environment variables
- **Rate limiting** — per-IP sliding window (600 GET/min, 60 mutation/min)
- **Spending limits** — daily ALGO cap, per-message cost check, credit gating
- **Bridge authorization** — Telegram user allowlist, Discord channel restriction
- **Audit logging** — immutable, insert-only log with trace IDs
- **Startup validation** — server refuses to start without API key on non-localhost bind
- **Prompt injection detection** — multi-layer scanner with encoding attack detection

See [SECURITY.md](SECURITY.md) for the full security model and responsible disclosure.

---

## Deployment

The `deploy/` directory includes production configurations:

- `Dockerfile` + `docker-compose.yml` — multi-stage build, non-root container
- `corvid-agent.service` — systemd unit for Linux
- `com.corvidlabs.corvid-agent.plist` — macOS LaunchAgent
- `daemon.sh` — cross-platform daemon installer
- `run-loop.sh` — auto-restart wrapper with update support
- `nginx/` + `caddy/` — reverse proxy with TLS termination

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) — server, package manager, test runner, bundler |
| Frontend | [Angular 21](https://angular.dev) — standalone components, signals, responsive mobile UI |
| Database | [SQLite](https://bun.sh/docs/api/sqlite) — WAL mode, FTS5, 47 migrations |
| Agent SDK | [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) |
| Local Models | [Ollama](https://ollama.com) — Qwen, Llama, etc. |
| Voice | [OpenAI TTS/Whisper](https://platform.openai.com/docs/guides/text-to-speech) — 6 voice presets, STT transcription |
| Blockchain | [Algorand](https://algorand.co) — on-chain identity and messaging |
| Tools | [MCP SDK](https://github.com/modelcontextprotocol/sdk) |
| Observability | [OpenTelemetry](https://opentelemetry.io) — tracing, Prometheus metrics |
| Validation | [Zod](https://zod.dev) — runtime schema validation |

---

## Built by corvid-agent

These apps were designed, coded, tested, and deployed autonomously by corvid-agent — no human-written application code. Each is an Angular 21 standalone app hosted on GitHub Pages.

**Ecosystem landing page:** [corvid-agent.github.io](https://corvid-agent.github.io)

| App | API | Description |
|-----|-----|-------------|
| [weather-dashboard](https://corvid-agent.github.io/weather-dashboard/) | Open-Meteo | Forecasts, hourly/daily charts, air quality, UV meter, wind compass, astronomy |
| [bw-cinema](https://corvid-agent.github.io/bw-cinema/) | TMDb + Internet Archive | Classic black-and-white film browser with search, favorites, and streaming |
| [space-dashboard](https://corvid-agent.github.io/space-dashboard/) | NASA | APOD gallery, Mars rover photos, ISS tracker, near-Earth objects |
| [pd-gallery](https://corvid-agent.github.io/pd-gallery/) | Art Institute of Chicago | 130k+ public domain artworks with collections and genre browsing |
| [pd-audiobooks](https://corvid-agent.github.io/pd-audiobooks/) | LibriVox | Public domain audiobook player with chapter navigation and reading lists |
| [poetry-atlas](https://corvid-agent.github.io/poetry-atlas/) | PoetryDB | Classic poetry explorer with 129 poets, search, favorites, and discovery |
| [quake-tracker](https://corvid-agent.github.io/quake-tracker/) | USGS | Real-time earthquake dashboard with magnitude filtering and seismic analytics |
| [pd-music](https://corvid-agent.github.io/pd-music/) | MusicBrainz + Internet Archive | Public domain music explorer with streaming and curated collections |
| [pixel-forge](https://corvid-agent.github.io/pixel-forge/) | Canvas API | Pixel art editor with drawing tools, palette presets, and gallery |

---

## Key Files

- [`CLAUDE.md`](CLAUDE.md) — Agent instructions for working on this repo
- [`VISION.md`](VISION.md) — Project manifesto and long-term direction
- [`.env.example`](.env.example) — All configuration options with descriptions
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Development setup and guidelines
- [`SECURITY.md`](SECURITY.md) — Responsible disclosure policy

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
