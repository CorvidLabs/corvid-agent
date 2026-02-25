<p align="center">
  <img src="https://img.shields.io/badge/version-0.11.0-blue" alt="Version">
  <a href="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml"><img src="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/github/license/CorvidLabs/corvid-agent" alt="License">
  <img src="https://img.shields.io/badge/runtime-Bun_1.3-f9f1e1?logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/Angular-21-dd0031?logo=angular" alt="Angular 21">
  <img src="https://img.shields.io/badge/tests-1757%20unit%20%7C%20348%20E2E-brightgreen" alt="1757 Unit | 348 E2E Tests">
  <a href="https://codecov.io/gh/CorvidLabs/corvid-agent"><img src="https://codecov.io/gh/CorvidLabs/corvid-agent/graph/badge.svg" alt="Coverage"></a>
</p>

# corvid-agent

Agent orchestration platform for running, managing, and governing autonomous AI agents. Talk to your agents from Telegram and Discord, give them unique personalities, equip them with composable skill bundles, and add voice interaction — all on top of cryptographic identities, credit balances, multi-agent governance, graph workflows, and self-improving code pipelines.

Built with [Bun](https://bun.sh), [Angular 21](https://angular.dev), [SQLite](https://bun.sh/docs/api/sqlite), [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk), and [Algorand](https://algorand.co).

---

## Quick Start

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
bun install
cp .env.example .env   # add your ANTHROPIC_API_KEY
bun run build:client
bun run dev
```

Server starts at `http://localhost:3000`. See `.env.example` for all configuration options.

### Minimum `.env`

```bash
ANTHROPIC_API_KEY=sk-ant-...          # Required — Claude agent sessions
ALGOCHAT_MNEMONIC=your 25 words ...   # Optional — on-chain identity & messaging
OLLAMA_HOST=http://localhost:11434    # Optional — local model inference
```

### Optional: Enable Messaging Bridges

```bash
# Telegram — talk to agents from your phone
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789
TELEGRAM_ALLOWED_USER_IDS=111222333   # comma-separated, empty = allow all

# Discord — talk to agents from Discord
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CHANNEL_ID=channel-id

# Slack — talk to agents from Slack channels
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=C0123456789
SLACK_SIGNING_SECRET=your-signing-secret

# Voice — TTS/STT for Telegram voice notes and audio responses
OPENAI_API_KEY=sk-...
```

---

## Core Capabilities

### Agent Sessions
- Spawn and manage Claude or Ollama agent sessions with configurable system prompts, tool permissions, and budgets
- Real-time streaming via WebSocket with terminal-style UI
- Tool approval workflows for sensitive operations
- Automatic context management with turn-based resets

### Bidirectional Telegram Bridge
- Talk to agents directly from Telegram with long-polling integration
- Voice note support: send a voice message, agent transcribes via Whisper STT and responds
- Voice responses: agents with voice enabled reply with audio (OpenAI TTS) plus text
- Per-user sessions with `/start`, `/status`, `/new` commands
- Authorization via `TELEGRAM_ALLOWED_USER_IDS`

### Bidirectional Discord Bridge
- Talk to agents from any Discord channel via raw WebSocket gateway (no discord.js dependency)
- Auto-reconnect with exponential backoff, heartbeat, and session resume
- Per-user sessions with `/status` and `/new` commands
- Messages over 2000 characters automatically chunked

### Slack Integration
- Talk to agents from Slack channels with bidirectional message bridge
- Notification delivery for schedule approvals, work task results, and agent questions
- Question routing: `corvid_ask_owner` questions appear in Slack with response buttons
- Implements the ChannelAdapter interface for consistent bridge behavior

### Character/Persona System
- Give each agent a distinct personality with archetype, traits, background, and voice guidelines
- Example messages to set communication tone and style
- Persona is injected into the system prompt for both Claude SDK and Ollama sessions
- API: `GET/PUT/DELETE /api/agents/{id}/persona`

### Skill Bundles
- Composable packages of tools + prompt additions that can be assigned to agents
- 5 built-in presets: Code Reviewer, DevOps, Researcher, Communicator, Analyst
- Create custom bundles and assign multiple to a single agent
- Tools from bundles are merged with the agent's base permissions at session start
- API: `/api/skill-bundles` (CRUD), `/api/agents/{id}/skills` (assign/unassign)

### Voice Support (TTS/STT)
- Text-to-speech via OpenAI TTS API (`tts-1` model) with 6 voice presets (alloy, echo, fable, onyx, nova, shimmer)
- Speech-to-text via OpenAI Whisper API for transcribing voice messages
- Intelligent caching: synthesized audio is stored in SQLite by text hash + voice preset
- Per-agent voice configuration: `voiceEnabled` and `voicePreset` fields on the agent model

### Multi-Agent Councils
- Structured deliberation with multiple agents and a chairman
- Pipeline: responding → discussing (N rounds) → reviewing → synthesizing
- Chairman synthesizes a final decision from independent agent responses

### Self-Improvement Pipeline
- Agents call `corvid_create_work_task` to propose code changes
- Automatic git worktree, branch creation, and PR submission
- Validation loop: TypeScript type-check + test suite (up to 3 iterations)
- Protected file enforcement prevents agents from modifying critical code

### Graph Workflow Orchestration
- DAG-based multi-step workflows with suspend/resume
- Node types: agent session, work task, condition, delay, transform, parallel fork/join

### Scheduling & Automation
- Cron and interval-based task scheduling with configurable approval policies
- Actions: agent chat, work tasks, council launches, GitHub operations, inter-agent messaging
- GitHub webhook-driven automation with `@mention` triggers

### On-Chain Identity (AlgoChat)
- Algorand-backed agent wallets with AES-256-GCM encryption at rest
- X25519 PSK encrypted messaging channels
- Owner commands: `/stop`, `/approve`, `/deny`, `/mode`, `/work`, `/council`
- Credit system with ALGO-based purchasing

### Multi-Channel Notifications
- Delivery via Discord, Telegram, GitHub Issues, and AlgoChat
- Blocking `corvid_ask_owner` for two-way agent-to-owner questions
- First-response-wins across all configured channels

### Cloud Model Routing
- Ollama cloud model support with `-cloud` suffix routing to remote instances
- Local proxy handles authentication forwarding for remote Ollama hosts
- Merged local + remote model listings in the dashboard

### Model Exam System
- 18 test cases across 6 categories: coding, context, tools, algochat, council, instruction
- Per-category scoring with aggregate scorecard for evaluating model capabilities
- Integrated into the dashboard and API at `/api/exam`

### Mention Polling
- GitHub `@mention` polling for automated issue and PR responses
- Configurable per-agent poll intervals with deduplication
- Filters by event type (issue comments, issues, PR review comments)

### AST Code Understanding
- Tree-sitter parser for TypeScript, JavaScript, Python, Go, Rust, and more
- Extracts functions, classes, imports, and call graphs for smarter work tasks
- `corvid_code_symbols` and `corvid_find_references` tools for agent use

### Observability
- OpenTelemetry tracing with OTLP HTTP export
- Prometheus metrics endpoint
- Immutable audit log with trace context propagation

---

## Architecture

```
                    +--------------------------+
                    |   Angular 21 Dashboard   |
                    |  (signals, standalone)   |
                    +------------+-------------+
                                 |
                            HTTP / WebSocket
                                 |
+--------------------------------+--------------------------------+
|                     Bun Server (port 3000)                      |
|                                                                 |
|  +----------+  +----------+  +-----------+  +----------------+  |
|  | Process  |  | Council  |  | Scheduler |  | Work Tasks     |  |
|  | Manager  |  | Engine   |  | Service   |  | (git worktree) |  |
|  +----------+  +----------+  +-----------+  +----------------+  |
|  | Telegram |  | Discord  |  | Voice     |  | Personas       |  |
|  | Bridge   |  | Bridge   |  | TTS / STT |  | + Skills       |  |
|  +----------+  +----------+  +-----------+  +----------------+  |
|  | Workflow |  | A2A      |  | Marketplace |  | Sandbox       |  |
|  | Engine   |  | Protocol |  | + Plugins   |  | (containers)  |  |
|  +----------+  +----------+  +-------------+  +---------------+  |
|  | Mention  |  | Exam     |  | Improvement |  | Notifications |  |
|  | Polling  |  | System   |  | Pipeline    |  | (multi-chan)  |  |
|  +----------+  +----------+  +-------------+  +---------------+  |
|  | Reputation |  | Tenants |  | Observability (OTEL)          |  |
|  | + Trust    |  | + Billing|  | Tracing + Metrics + Audit    |  |
|  +------------+  +---------+  +-------------------------------+  |
|       |              |              |                |           |
|  +----+-----+  +----+-----+  +-----+-----+  +------+--------+  |
|  | Claude   |  | Ollama   |  | AlgoChat  |  | GitHub API    |  |
|  | Agent SDK|  | (local)  |  | (Algorand)|  | (webhooks)    |  |
|  +----------+  +----------+  +-----------+  +---------------+  |
|                                                                 |
|  +-----------------------------------------------------------+  |
|  |                    SQLite (bun:sqlite)                     |  |
|  |  47 migrations | FTS5 search | WAL mode | foreign keys    |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
```

### Directory Structure

```
server/          Bun HTTP + WebSocket server
  a2a/           Google A2A protocol inbound task handling and agent card
  algochat/      On-chain messaging (bridge, wallet, directory, messenger)
  ast/           Tree-sitter AST parser for code understanding
  billing/       Usage metering and billing
  db/            SQLite schema (47 migrations) and query modules
  discord/       Bidirectional Discord bridge (raw WebSocket gateway)
  docs/          OpenAPI generator, MCP tool docs, route registry
  exam/          Model exam system with 18 test cases across 6 categories
  github/        GitHub API operations (PRs, issues, reviews)
  improvement/   Self-improvement pipeline and health metrics
  lib/           Shared utilities (logger, crypto, validation, web search)
  marketplace/   Agent marketplace — publish, discover, consume services
  mcp/           MCP tool server and 36 corvid_* tool handlers
  memory/        Structured memory with vector embeddings
  middleware/    Auth, CORS, rate limiting, startup validation
  notifications/ Multi-channel notification delivery (Discord, Telegram, GitHub, AlgoChat)
  observability/ OpenTelemetry tracing, Prometheus metrics
  plugins/       Plugin SDK and dynamic tool registration
  polling/       GitHub mention polling for @mention-driven automation
  process/       Agent lifecycle (SDK + Ollama, approval, event bus, persona/skill injection)
  providers/     Multi-model cost-aware routing
  public/        Static assets served by the HTTP server
  reputation/    Reputation and trust scoring
  routes/        REST API routes (28 route modules)
  sandbox/       Container sandboxing for isolated execution
  scheduler/     Cron/interval execution engine
  selftest/      Self-test and validation utilities
  slack/         Bidirectional Slack bridge (channel adapter, notifications, questions)
  telegram/      Bidirectional Telegram bridge (long-polling, voice)
  tenant/        Multi-tenant isolation and access control
  voice/         TTS (OpenAI) and STT (Whisper) with caching
  webhooks/      GitHub webhook and mention polling
  work/          Work task service (worktree, branch, validate, PR)
  workflow/      Graph-based DAG workflow orchestration engine
  ws/            WebSocket handlers with pub/sub
client/          Angular 21 SPA (standalone components, signals)
shared/          TypeScript types shared between server and client
deploy/          Docker, docker-compose, systemd, launchd, nginx, caddy, Helm
e2e/             Playwright end-to-end tests (30 spec files, 348 tests)
```

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

Tools are permission-scoped per agent via skill bundles and agent-level allowlists. Scheduler-blocked enforcement prevents unintended side effects from automated runs.

---

## API

~55 REST endpoints and a WebSocket interface across 28 route modules:

| Group | Endpoints | Description |
|-------|----------|-------------|
| Agents | `GET/POST/PUT/DELETE /api/agents` | Agent CRUD with model, voice, and permission config |
| Personas | `GET/PUT/DELETE /api/agents/:id/persona` | Character system — archetype, traits, voice style |
| Skills | `/api/skill-bundles`, `/api/agents/:id/skills` | Composable tool + prompt bundles |
| Sessions | `GET/POST/PUT/DELETE /api/sessions` | Session lifecycle and message history |
| Councils | `/api/councils`, `/api/councils/:id/launch` | Multi-agent deliberation with stage tracking |
| Workflows | `/api/workflows` | DAG orchestration with suspend/resume |
| Schedules | `/api/schedules` | Cron/interval automation with approval |
| Work Tasks | `/api/work-tasks` | Self-improvement task tracking |
| Marketplace | `/api/marketplace` | Agent service listings, reviews, federation |
| Webhooks | `/api/webhooks`, `POST /webhooks/github` | GitHub event-driven automation |
| Mention Polling | `/api/mention-polling` | GitHub @mention polling configuration |
| Reputation | `/api/reputation` | Trust scores, events, attestations |
| Billing | `/api/billing` | Subscriptions, usage metering, invoices |
| Sandbox | `/api/sandbox` | Container policies and allocation |
| Analytics | `/api/analytics` | Cost, token, and session statistics |
| Audit | `/api/audit` | Immutable audit log queries |
| Exam | `/api/exam` | Model examination and capability scoring |
| MCP API | `/api/mcp` | Model Context Protocol endpoints |
| MCP Servers | `/api/mcp-servers` | External MCP server configuration |
| Ollama | `/api/ollama` | Ollama provider management and model pulls |
| Plugins | `/api/plugins` | Plugin registry and capability management |
| Allowlist | `/api/allowlist` | Address allowlist management |
| Auth Flow | `/api/auth` | Device authorization for CLI login |
| Settings | `/api/settings` | Application settings and operational mode |
| System Logs | `/api/system-logs` | System log queries and credit history |
| Health | `GET /api/health` | Health check (public, no auth) |
| A2A | `/.well-known/agent-card.json` | Google A2A protocol Agent Card |
| WebSocket | `WS /ws` | Real-time streaming and event subscriptions |

---

## Testing

```bash
bun test              # 1757 server tests (~30s)
cd client && npx vitest run   # Angular component tests (~2s)
bun run test:e2e      # 30 Playwright spec files, 348 tests
```

**1757+ unit tests** covering: API routes, audit logging, authentication, bash security, billing, CLI, credit system, crypto, database migrations, Discord bridge, GitHub tools, marketplace, MCP tool handlers, notifications, multi-model routing, observability, owner communication, personas, plugins, process lifecycle, rate limiting, reputation, sandbox isolation, scheduling, skill bundles, Slack bridge, Telegram bridge, tenant isolation, validation, voice TTS/STT, wallet keystore, web search, workflows, work tasks, and Angular components.

**348 E2E tests** across 30 Playwright spec files covering 198/202 testable API endpoints and all 34 Angular UI routes.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) — server, package manager, test runner, bundler |
| Frontend | [Angular 21](https://angular.dev) — standalone components, signals |
| Database | [SQLite](https://bun.sh/docs/api/sqlite) — WAL mode, FTS5, 47 migrations |
| Agent SDK | [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) |
| Local Models | [Ollama](https://ollama.com) — Qwen, Llama, etc. |
| Voice | [OpenAI TTS/Whisper](https://platform.openai.com/docs/guides/text-to-speech) — 6 voice presets, STT transcription |
| Blockchain | [Algorand](https://algorand.co) — on-chain identity and messaging |
| Tools | [MCP SDK](https://github.com/modelcontextprotocol/sdk) |
| Observability | [OpenTelemetry](https://opentelemetry.io) — tracing, Prometheus metrics |
| Validation | [Zod](https://zod.dev) — runtime schema validation |

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

See [SECURITY.md](SECURITY.md) for the full security model and responsible disclosure.

---

## Deployment

The `deploy/` directory includes production configurations:

- `Dockerfile` + `docker-compose.yml` — multi-stage build, non-root container
- `corvid-agent.service` — systemd unit for Linux
- `com.corvidlabs.corvid-agent.plist` — macOS LaunchAgent
- `daemon.sh` — cross-platform daemon installer
- `nginx/` + `caddy/` — reverse proxy with TLS termination

---

## Environment Variables

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
