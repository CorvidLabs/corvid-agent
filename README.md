<p align="center">
  <img src="https://img.shields.io/badge/version-0.4.0-blue" alt="Version">
  <a href="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml"><img src="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/github/license/CorvidLabs/corvid-agent" alt="License">
  <img src="https://img.shields.io/badge/runtime-Bun_1.2-f9f1e1?logo=bun" alt="Bun 1.2">
  <img src="https://img.shields.io/badge/Angular-21-dd0031?logo=angular" alt="Angular 21">
  <img src="https://img.shields.io/badge/Algorand-on--chain-black?logo=algorand" alt="Algorand">
  <img src="https://img.shields.io/badge/Claude-Agent%20SDK-d4a574" alt="Claude Agent SDK">
  <img src="https://img.shields.io/badge/tests-616%20passing-brightgreen" alt="616 Tests Passing">
  <img src="https://img.shields.io/badge/deps-6%20runtime-brightgreen" alt="6 Runtime Dependencies">
</p>

# CorvidAgent

**Autonomous AI agent orchestration with on-chain identity, multi-agent councils, and self-improving code — powered by Algorand.**

> *Not another chatbot wrapper.* CorvidAgent gives every AI agent a **cryptographic wallet**, a **credit balance**, a **vote in governance councils**, and the ability to **write code and open pull requests** — all secured by Algorand.

CorvidAgent is an open-source platform for running, orchestrating, and governing AI agents. Every agent gets a cryptographic identity on the Algorand blockchain, can communicate via encrypted on-chain messaging, earn and spend credits, deliberate in multi-agent councils, and autonomously improve its own codebase through validated pull requests.

Built with [Bun](https://bun.sh), [Angular 21](https://angular.dev), [SQLite](https://bun.sh/docs/api/sqlite), [Algorand](https://algorand.co), and [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk). **6 runtime dependencies. 616 tests. Zero bloat.**

---

## Why CorvidAgent?

Most agent platforms treat agents as stateless function calls. CorvidAgent treats them as **autonomous entities** with identity, memory, economics, and governance:

| What You Get | How It Works |
|---|---|
| **On-chain identity** | Every agent has an Algorand wallet address — not just a UUID. Verifiable, portable, blockchain-native. |
| **Encrypted messaging** | Agents communicate via X25519 PSK-encrypted on-chain messages. No plaintext. No API middlemen. |
| **Agent economics** | Built-in credit system with ALGO-based purchasing. Agents earn, spend, and track costs transparently. |
| **Structured governance** | Multi-agent councils with parliamentary-style discussion rounds, review, and chairman synthesis. |
| **Self-improvement** | Agents create git branches, write code, run validation, and open PRs — autonomously. |
| **Security-first** | Bash sandboxing, protected paths, rate limiting, spending caps, startup validation. Zero CVEs. |
| **Minimal footprint** | 6 runtime deps. 101K LOC TypeScript. No framework lock-in. |

### How We Compare

| | CorvidAgent | OpenClaw | CrewAI | Eliza (ai16z) |
|---|---|---|---|---|
| Agent identity | Algorand wallet | None | None | Token-based |
| Multi-agent governance | Council system | None | Manager-worker | None |
| Agent economics | Credit ledger + ALGO | None | None | Token speculation |
| Self-improvement | Git worktree + PR | None | None | None |
| Security posture | Zero CVEs, localhost-default | 3 CVEs, 135K exposed instances | Framework-level | Minimal |
| On-chain messaging | AES-256 + X25519 PSK | None | None | Basic (Solana/ETH) |
| Local models | Ollama (Qwen, Llama, etc.) | Ollama | Limited | Limited |
| Runtime deps | 6 | 100+ | 50+ | 30+ |

---

## Features

### Agent Orchestration
- Spawn, manage, and monitor AI agents via **Claude Agent SDK** or **Ollama** (local models)
- Real-time streaming via WebSocket with terminal-style chat UI
- Configurable system prompts, tool permissions, and budget limits per agent
- Automatic context management with turn-based resets
- Tool approval workflows for sensitive operations

### Multi-Agent Councils
- Create councils with multiple agents and a chairman
- Structured deliberation: responding, discussing (N rounds), reviewing, synthesizing
- Each agent responds independently, then reviews and debates others' positions
- Chairman synthesizes a final decision with follow-up chat

### Autonomous Scheduling
- Cron and interval-based task scheduling with configurable approval policies
- Actions: agent chat, work tasks, council launches, GitHub operations, inter-agent messaging
- Execution history tracking with failure detection and automatic pause
- On-chain notifications for schedule lifecycle events

### Self-Improvement (Work Tasks)
- Agents call `corvid_create_work_task` to propose code changes
- Automatic git worktree creation, branch management, and PR submission
- Validation loop: TypeScript type-check + test suite (up to 3 iterations)
- Protected file enforcement prevents agents from modifying security-critical code

### AlgoChat (On-Chain Messaging)
- Algorand-backed agent wallets with AES-256-GCM encryption at rest
- X25519 pre-shared key (PSK) encrypted messaging channels
- Multi-contact PSK registry with QR code exchange for mobile pairing
- Full-text search (FTS5) on agent memories with blockchain persistence
- Owner commands: `/stop`, `/approve`, `/deny`, `/mode`, `/work`, `/council`
- Allowlist-based access control and credit gating for non-owner users

### Credit System
- Per-wallet credit ledger with ALGO-based purchasing
- Configurable rates: credits per turn, per agent message, per group message
- Free credits on first interaction, low-credit warnings
- Owner addresses bypass all credit checks
- Full transaction audit log

### MCP Tools (24 tools)
Extensible tool system via [Model Context Protocol](https://github.com/modelcontextprotocol/sdk):

| Category | Tools |
|---|---|
| **Messaging** | `corvid_send_message`, `corvid_list_agents` |
| **Memory** | `corvid_save_memory` (on-chain encrypted), `corvid_recall_memory` (FTS5 search) |
| **GitHub** | `corvid_github_star_repo`, `fork_repo`, `list_prs`, `create_pr`, `review_pr`, `get_pr_diff`, `comment_on_pr`, `create_issue`, `list_issues`, `repo_info`, `unstar_repo`, `follow_user` |
| **Automation** | `corvid_create_work_task`, `corvid_manage_schedule` |
| **Web** | `corvid_web_search` (Brave), `corvid_deep_research` (multi-angle) |
| **Credits** | `corvid_check_credits`, `corvid_grant_credits`, `corvid_credit_config` |
| **Session** | `corvid_extend_timeout` |

Tools are permission-scoped per agent, with scheduler-blocked tool enforcement to prevent unintended financial or messaging side effects.

### GitHub Integration
- Webhook-driven automation with `@mention` triggers
- Mention polling for repos without public webhook URLs
- Star, fork, create PRs/issues, review PRs, comment -- all from agent sessions
- Work task PRs created automatically with validation results

### Dashboard
- Angular 21 SPA with standalone components and signals
- Terminal-style chat interface with real-time streaming
- Session management (create, pause, resume, stop)
- Council launch and monitoring with stage visualization
- Schedule management with execution history
- Work task tracking with PR links
- Analytics dashboard (costs, token usage, session stats)
- System logs with level filtering
- Settings, allowlist, and wallet management

---

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

### Minimum Configuration

```bash
# Required for agent sessions
ANTHROPIC_API_KEY=sk-ant-...

# Required for on-chain identity (generate with `goal account new`)
ALGOCHAT_MNEMONIC=your twenty five word algorand mnemonic ...

# Optional: local model inference
OLLAMA_HOST=http://localhost:11434
```

See `.env.example` for the full list of 20+ configuration options.

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
|  +----+-----+  +----+-----+  +-----+-----+  +-------+--------+  |
|       |              |              |                |           |
|  +----+-----+  +----+-----+  +-----+-----+  +------+--------+  |
|  | Claude   |  | Ollama   |  | AlgoChat  |  | GitHub API    |  |
|  | Agent SDK|  | (local)  |  | (Algorand)|  | (webhooks)    |  |
|  +----------+  +----------+  +-----------+  +---------------+  |
|                                                                 |
|  +-----------------------------------------------------------+  |
|  |                    SQLite (bun:sqlite)                     |  |
|  |  32 migrations | FTS5 search | WAL mode | foreign keys    |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
```

### Directory Structure

```
server/          Bun HTTP + WebSocket server, agent process management
  algochat/      AlgoChat on-chain messaging layer (bridge, wallet, directory, messenger)
  db/            SQLite schema, migrations, and query modules (20 files)
  github/        GitHub API operations (star, fork, PR, issue, review)
  lib/           Shared utilities (logger, crypto, validation, web search)
  mcp/           MCP tool server and 24 corvid_* tool handlers
  middleware/    HTTP/WS auth, CORS, rate limiting, startup security
  process/       Agent lifecycle (SDK + direct Ollama, approval, event bus)
  providers/     LLM provider registry (Anthropic, Ollama)
  routes/        REST API routes (~50 endpoints across 15 modules)
  scheduler/     Cron/interval schedule execution engine with approval policies
  selftest/      Self-test service for validation
  webhooks/      GitHub webhook and mention polling services
  work/          Work task service (worktree, branch, validate, PR)
  ws/            WebSocket handlers with pub/sub subscriptions
client/          Angular 21 SPA (standalone components, signals, 14 feature modules)
shared/          TypeScript types and WebSocket protocol (shared between server/client)
deploy/          Docker, docker-compose, systemd, launchd, nginx, caddy configs
e2e/             Playwright end-to-end tests (9 spec files)
docs/            HTML documentation and architecture decision records
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | [Bun](https://bun.sh) | Server, package manager, test runner, bundler |
| Frontend | [Angular 21](https://angular.dev) | Dashboard SPA (standalone components, signals) |
| Database | [SQLite](https://bun.sh/docs/api/sqlite) | Persistence via `bun:sqlite` (WAL mode, FTS5) |
| Blockchain | [Algorand](https://algorand.co) (`algosdk`) | On-chain identity, messaging, and payments |
| Agent SDK | [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) | Agent orchestration and tool calling |
| Local Models | [Ollama](https://ollama.com) | Local model inference (Qwen, Llama, etc.) |
| Tools | [MCP SDK](https://github.com/modelcontextprotocol/sdk) | Model Context Protocol tool system |
| Validation | [Zod](https://zod.dev) | Runtime schema validation on all API inputs |
| Scheduling | [Croner](https://github.com/Hexagon/croner) | Cron expression parsing |

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude agents | -- |
| `ALGOCHAT_MNEMONIC` | 25-word Algorand account mnemonic | -- |
| `ALGORAND_NETWORK` | Algorand network (`localnet`, `testnet`, `mainnet`) | `localnet` |
| `ALGOCHAT_SYNC_INTERVAL` | Polling interval for on-chain messages (ms) | `30000` |
| `ALGOCHAT_DEFAULT_AGENT_ID` | Default agent ID for AlgoChat | -- |
| `ALGOCHAT_OWNER_ADDRESSES` | Comma-separated Algorand addresses authorized for admin commands | -- (open) |
| `ALGOCHAT_PSK_URI` | Pre-shared key URI for encrypted AlgoChat channels | -- |
| `AGENT_NETWORK` | Network for agent sub-wallets | `localnet` |
| `PORT` | HTTP server port | `3000` |
| `BIND_HOST` | Bind address (`127.0.0.1` for localhost, `0.0.0.0` for Docker/VM) | `127.0.0.1` |
| `API_KEY` | Bearer token for HTTP/WS auth (required when `BIND_HOST` is non-localhost) | -- |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `*` |
| `WALLET_ENCRYPTION_KEY` | AES-256 key for wallet encryption at rest | derived from mnemonic |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | `info` |
| `GH_TOKEN` | GitHub token for work tasks, PRs, and webhooks | -- |
| `GITHUB_WEBHOOK_SECRET` | HMAC SHA-256 secret for GitHub webhook validation | -- |
| `OLLAMA_HOST` | Ollama API base URL | `http://localhost:11434` |
| `OLLAMA_MAX_PARALLEL` | Max concurrency weight budget for Ollama | auto-detected |
| `OLLAMA_NUM_CTX` | Context window size per Ollama request | `8192` |
| `DAILY_ALGO_LIMIT_MICRO` | Daily ALGO spending cap (microALGOs) | `10000000` |
| `BRAVE_API_KEY` | Brave Search API key for `corvid_web_search` / `corvid_deep_research` | -- |
| `AGENT_TIMEOUT_MS` | Agent session timeout (ms) | `1800000` |
| `WORK_MAX_ITERATIONS` | Max validation iterations for work tasks | `3` |
| `SCHEDULER_ENABLED` | Enable the autonomous scheduler | `true` |
| `SCHEDULER_MAX_CONCURRENT` | Max concurrent schedule executions | `2` |

Copy `.env.example` to `.env` and fill in your values. Bun loads `.env` automatically.

---

## Security

CorvidAgent is designed for 24/7 autonomous operation with multiple security layers:

- **Authentication** -- API key required on non-localhost; WebSocket auth enforced; AlgoChat uses cryptographic identity
- **Encryption** -- AES-256-GCM for wallet mnemonics and memory content; X25519 for on-chain messaging
- **File protection** -- protected path enforcement prevents agents from modifying security-critical files
- **Bash validation** -- dangerous commands (`rm -rf /`, write redirects) are blocked before execution
- **Environment isolation** -- agent subprocesses receive only safe environment variables
- **Rate limiting** -- per-IP sliding window (240 GET/min, 60 mutation/min)
- **Spending limits** -- daily ALGO cap, per-message cost check, credit system for non-owner access
- **Startup validation** -- server refuses to start without API key when bound to non-localhost

See [SECURITY.md](SECURITY.md) for the full security model and responsible disclosure instructions.

---

## Testing

```bash
bun test                 # 616 tests across 23 files (~7s)
bun run test:e2e         # 9 Playwright e2e specs (requires AlgoKit localnet)
```

**616 unit tests** covering: API routes, authentication, bash security, credit system, crypto operations, database migrations, GitHub tools, MCP tool handlers, process lifecycle, rate limiting, schedule execution, validation schemas, wallet keystore, web search, and work task service.

**9 e2e test suites** covering: agent CRUD, approval workflows, chat interactions, council flows, dashboard functionality, performance benchmarks, and session lifecycle.

---

## Deployment

See the `deploy/` directory for production configurations:

- `Dockerfile` + `docker-compose.yml` -- multi-stage containerized deployment (non-root)
- `corvid-agent.service` -- systemd unit for Linux
- `com.corvidlabs.corvid-agent.plist` -- macOS LaunchAgent
- `daemon.sh` -- cross-platform daemon installer
- `nginx/` + `caddy/` -- reverse proxy configs with TLS termination

---

## API

CorvidAgent exposes ~50 REST endpoints and a WebSocket interface. Key endpoint groups:

| Group | Endpoints | Description |
|-------|----------|-------------|
| Agents | `GET/POST/PUT/DELETE /api/agents` | Agent CRUD with model/permission config |
| Sessions | `GET/POST/PUT/DELETE /api/sessions` | Session lifecycle and message history |
| Councils | `/api/councils/*/launch` | Multi-agent deliberation with stage tracking |
| Schedules | `/api/schedules` | Cron/interval automation with approval |
| Work Tasks | `/api/work-tasks` | Self-improvement task tracking |
| Projects | `/api/projects` | Workspace directory management |
| Webhooks | `/api/webhooks`, `POST /webhooks/github` | GitHub event-driven automation |
| Analytics | `/api/analytics` | Cost, token, and session statistics |
| Health | `GET /api/health` | Health check (public, no auth) |
| WebSocket | `WS /ws` | Real-time session streaming and event subscriptions |

---

## Roadmap

**Recently shipped:**
- [x] **GitHub webhook automation** -- `@mention` triggers agent sessions via webhooks or polling
- [x] **Web search & deep research** -- Brave-powered web search and multi-angle research tools
- [x] **Full GitHub MCP tools** -- 12 tools for PRs, issues, repos, reviews, and code search
- [x] **Multi-contact PSK** -- QR code exchange for mobile wallet pairing
- [x] **FTS5 agent memories** -- Full-text search on encrypted agent knowledge

**In progress / next:**
- [ ] **Multi-channel messaging** ([#112](https://github.com/CorvidLabs/corvid-agent/issues/112)) -- Telegram, Discord, Slack bridges for consumer-facing agent access
- [ ] **A2A protocol support** ([#103](https://github.com/CorvidLabs/corvid-agent/issues/103)) -- Google Agent-to-Agent interoperability and Agent Cards
- [ ] **Agent marketplace** -- agents publish services, users pay credits to consume them
- [ ] **Graph-based workflow orchestration** ([#104](https://github.com/CorvidLabs/corvid-agent/issues/104)) -- suspend/resume multi-step workflows
- [ ] **Structured memory + semantic search** ([#97](https://github.com/CorvidLabs/corvid-agent/issues/97)) -- vector embeddings for agent knowledge
- [ ] **OpenTelemetry observability** ([#98](https://github.com/CorvidLabs/corvid-agent/issues/98)) -- structured audit logging and tracing
- [ ] **AST-based code understanding** ([#113](https://github.com/CorvidLabs/corvid-agent/issues/113)) -- smarter work tasks with syntax-aware analysis
- [ ] **Container sandboxing** -- isolated execution environments for agent-generated code
- [ ] **CLI mode** -- `npx corvid-agent chat "..."` for terminal-first developers
- [ ] **Hosted offering** -- managed deployment for teams that don't want to self-host

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
