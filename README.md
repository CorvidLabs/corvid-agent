<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version">
  <a href="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml"><img src="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/github/license/CorvidLabs/corvid-agent" alt="License">
  <img src="https://img.shields.io/badge/runtime-Bun_1.3-f9f1e1?logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/Angular-21-dd0031?logo=angular" alt="Angular 21">
  <img src="https://img.shields.io/badge/tests-1776%20passing-brightgreen" alt="1776 Tests Passing">
</p>

# corvid-agent

Agent orchestration platform for running, managing, and governing autonomous AI agents. Agents get cryptographic identities, credit balances, multi-agent governance, graph workflows, and self-improving code pipelines.

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

---

## Core Capabilities

### Agent Sessions
- Spawn and manage Claude or Ollama agent sessions with configurable system prompts, tool permissions, and budgets
- Real-time streaming via WebSocket with terminal-style UI
- Tool approval workflows for sensitive operations
- Automatic context management with turn-based resets

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
|  | Workflow |  | A2A      |  | Marketplace |  | Sandbox       |  |
|  | Engine   |  | Protocol |  | + Plugins   |  | (containers)  |  |
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
|  |  44 migrations | FTS5 search | WAL mode | foreign keys    |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
```

### Directory Structure

```
server/          Bun HTTP + WebSocket server
  algochat/      On-chain messaging (bridge, wallet, directory, messenger)
  ast/           Tree-sitter AST parser for code understanding
  billing/       Usage metering and billing
  db/            SQLite schema (44 migrations) and query modules
  github/        GitHub API operations (PRs, issues, reviews)
  lib/           Shared utilities (logger, crypto, validation, web search)
  marketplace/   Agent marketplace — publish, discover, consume services
  mcp/           MCP tool server and 34 corvid_* tool handlers
  memory/        Structured memory with vector embeddings
  middleware/    Auth, CORS, rate limiting, startup validation
  observability/ OpenTelemetry tracing, Prometheus metrics
  plugins/       Plugin SDK and dynamic tool registration
  process/       Agent lifecycle (SDK + Ollama, approval, event bus)
  providers/     Multi-model cost-aware routing
  reputation/    Reputation and trust scoring
  routes/        REST API routes (24 route modules)
  sandbox/       Container sandboxing for isolated execution
  scheduler/     Cron/interval execution engine
  tenant/        Multi-tenant isolation and access control
  webhooks/      GitHub webhook and mention polling
  work/          Work task service (worktree, branch, validate, PR)
  ws/            WebSocket handlers with pub/sub
client/          Angular 21 SPA (standalone components, signals)
shared/          TypeScript types shared between server and client
deploy/          Docker, docker-compose, systemd, launchd, nginx, caddy, Helm
e2e/             Playwright end-to-end tests (8 spec files)
```

---

## MCP Tools (34)

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
| **Session** | `corvid_extend_timeout` |

Tools are permission-scoped per agent. Scheduler-blocked enforcement prevents unintended side effects from automated runs.

---

## API

~50 REST endpoints and a WebSocket interface across 24 route modules:

| Group | Endpoints | Description |
|-------|----------|-------------|
| Agents | `GET/POST/PUT/DELETE /api/agents` | Agent CRUD with model and permission config |
| Sessions | `GET/POST/PUT/DELETE /api/sessions` | Session lifecycle and message history |
| Councils | `/api/councils`, `/api/councils/:id/launch` | Multi-agent deliberation with stage tracking |
| Workflows | `/api/workflows` | DAG orchestration with suspend/resume |
| Schedules | `/api/schedules` | Cron/interval automation with approval |
| Work Tasks | `/api/work-tasks` | Self-improvement task tracking |
| Marketplace | `/api/marketplace` | Agent service listings, reviews, federation |
| Webhooks | `/api/webhooks`, `POST /webhooks/github` | GitHub event-driven automation |
| Reputation | `/api/reputation` | Trust scores, events, attestations |
| Billing | `/api/billing` | Subscriptions, usage metering, invoices |
| Sandbox | `/api/sandbox` | Container policies and allocation |
| Analytics | `/api/analytics` | Cost, token, and session statistics |
| Audit | `/api/audit` | Immutable audit log queries |
| Health | `GET /api/health` | Health check (public, no auth) |
| A2A | `/.well-known/agent-card.json` | Google A2A protocol Agent Card |
| WebSocket | `WS /ws` | Real-time streaming and event subscriptions |

---

## Testing

```bash
bun test              # 1665 server tests (~26s)
cd client && npx vitest run   # 111 Angular tests (~2s)
bun run test:e2e      # 8 Playwright e2e spec files
```

**1776 total tests** covering: API routes, audit logging, authentication, bash security, billing, CLI, credit system, crypto, database migrations, GitHub tools, marketplace, MCP tool handlers, notifications, multi-model routing, observability, owner communication, plugins, process lifecycle, rate limiting, reputation, sandbox isolation, scheduling, tenant isolation, validation, wallet keystore, web search, workflows, work tasks, and Angular components.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) — server, package manager, test runner, bundler |
| Frontend | [Angular 21](https://angular.dev) — standalone components, signals |
| Database | [SQLite](https://bun.sh/docs/api/sqlite) — WAL mode, FTS5, 44 migrations |
| Agent SDK | [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) |
| Local Models | [Ollama](https://ollama.com) — Qwen, Llama, etc. |
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
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for webhook validation | — |
| `BRAVE_API_KEY` | Brave Search API key | — |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |

See `.env.example` for the full list of 20+ options including wallet encryption, ALGO spending caps, scheduler config, and CORS settings.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
