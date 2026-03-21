<p align="center">
  <img src="https://img.shields.io/badge/version-0.41.0-blue" alt="Version">
  <a href="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml"><img src="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/github/license/CorvidLabs/corvid-agent" alt="License">
  <img src="https://img.shields.io/badge/runtime-Bun_1.3-f9f1e1?logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/Angular-21-dd0031?logo=angular" alt="Angular 21">
  <img src="https://img.shields.io/badge/tests-8261%20unit%20%7C%20360%20E2E-brightgreen" alt="8261 Unit | 360 E2E Tests">
  <img src="https://img.shields.io/badge/spec%20coverage-100%25-brightgreen" alt="Spec Coverage 100%">
  <a href="https://codecov.io/gh/CorvidLabs/corvid-agent"><img src="https://codecov.io/gh/CorvidLabs/corvid-agent/graph/badge.svg" alt="Coverage"></a>
</p>

# corvid-agent

**Your own AI developer.** Tell it what you need — it writes the code, opens pull requests, and ships it.

No coding experience required. You describe what you want in plain English, and your agent builds it.

---

## Start here — pick your path

<table>
<tr>
<td width="25%" valign="top">

### 🧑‍💻 I'm a creator
*I have ideas but don't code*

Tell it what to build in plain English. It writes the code, deploys it, and gives you a link.

**[Get started →](docs/quickstart.md)**

</td>
<td width="25%" valign="top">

### 👩‍💻 I'm a developer
*I write code and want help*

Automated PR reviews, CI fixes, test generation, issue triage — on a schedule or on-demand.

**[Use cases →](docs/use-cases.md)**

</td>
<td width="25%" valign="top">

### 🏢 I'm running a business
*I need AI to handle dev work*

Set up agents for your team. They review code, write features, and ship PRs while your team focuses on what matters.

**[Business guide →](docs/business-guide.md)**

</td>
<td width="25%" valign="top">

### 🏗️ I'm evaluating for enterprise
*I need security, compliance, scale*

Multi-tenant, RBAC, audit trails, Docker/K8s deployment, API key rotation, rate limiting.

**[Enterprise guide →](docs/enterprise.md)**

</td>
</tr>
</table>

---

## What can it build?

- "Build me a weather dashboard" → [it built this](https://corvid-agent.github.io/weather-dashboard/)
- "Make a movie browser for classic films" → [it built this](https://corvid-agent.github.io/bw-cinema/)
- "I need an earthquake tracker" → [it built this](https://corvid-agent.github.io/quake-tracker/)
- "Create a poetry explorer" → [it built this](https://corvid-agent.github.io/poetry-atlas/)
- "Build a pixel art editor" → [it built this](https://corvid-agent.github.io/pixel-forge/)

Every app above was designed, coded, tested, and deployed by corvid-agent — zero human-written application code.

[See all apps →](https://corvid-agent.github.io)

---

## Get started

One command to install and launch:

```bash
curl -fsSL https://raw.githubusercontent.com/CorvidLabs/corvid-agent/main/scripts/install.sh | bash
```

That's it. The installer handles everything — prerequisites, setup, and opens the dashboard in your browser.

**[Full setup guide →](docs/quickstart.md)**

---

## What can it do?

### For anyone (no coding needed)

| You say... | It does... |
|-----------|-----------|
| "Build me a portfolio website" | Designs, codes, and deploys a complete site |
| "Create a budget tracker app" | Builds a working web app from your description |
| "Make a countdown timer for my event" | Ships a custom app in minutes |

### For developers

| You say... | It does... |
|-----------|-----------|
| "Review my pull requests every morning" | Reads diffs, flags bugs, posts review comments — on a schedule |
| "Fix that failing CI build" | Diagnoses the failure, writes a fix, opens a PR |
| "Write tests for this code" | Generates test suites matching your project's patterns |
| "Triage these GitHub issues" | Labels, prioritizes, and assigns (or picks them up itself) |

### For teams and businesses

| You say... | It does... |
|-----------|-----------|
| "Answer support questions in our Discord" | Responds to users 24/7 with accurate, docs-backed answers |
| "Keep our API docs in sync with the code" | Detects drift and opens PRs to fix it weekly |
| "I need two agents to discuss this architecture decision" | Runs a multi-agent council with structured deliberation |
| "Prepare a release for v2.1.0" | Generates changelogs, bumps versions, opens a release PR |

It works for you 24/7 — reviews code, fixes bugs, writes features, answers questions, and handles the boring stuff so you don't have to.

---

## How it works

```
You (browser, phone, or terminal)
  ↓
corvid-agent (runs on your machine)
  ↓
Writes code → Runs tests → Opens PRs → Deploys
```

Everything runs locally on your computer. Your code stays yours. The only external service is the AI model (Claude or a free local model via Ollama).

**[How it works (detailed) →](docs/how-it-works.md)**

---

## Talk to it from anywhere

| Channel | What you need |
|---------|--------------|
| **Web dashboard** | Nothing — included at `http://localhost:3000` |
| **Terminal** | `corvid-agent` (interactive CLI) |
| **Telegram** | Add a bot token to `.env` |
| **Discord** | Add a bot token to `.env` |
| **Slack** | Add a bot token to `.env` |
| **Your AI editor** | `corvid-agent init --mcp` (Claude Code, Cursor, Copilot, etc.) |

---

## Works with

<p>
  <img src="https://img.shields.io/badge/Claude_Code-works-00e5ff?logo=anthropic" alt="Claude Code">
  <img src="https://img.shields.io/badge/Cursor-works-00e5ff" alt="Cursor">
  <img src="https://img.shields.io/badge/GitHub_Copilot-works-00e5ff" alt="GitHub Copilot">
  <img src="https://img.shields.io/badge/OpenCode-works-00e5ff" alt="OpenCode">
  <img src="https://img.shields.io/badge/Codex_CLI-works-00e5ff" alt="Codex CLI">
  <img src="https://img.shields.io/badge/Ollama-works-00e5ff" alt="Ollama">
  <img src="https://img.shields.io/badge/MCP-46_tools-ff66c4" alt="MCP">
  <img src="https://img.shields.io/badge/A2A_Protocol-compatible-00ff88" alt="A2A">
</p>

---

<details>
<summary><strong>For developers: technical details</strong></summary>

### Why corvid-agent?

| | corvid-agent | Cloud coding agents | Local-only tools |
|---|---|---|---|
| **Self-hosted** | You own it | Vendor-hosted | You own it |
| **Multi-agent** | Councils, delegation, coordination | Single agent | Single agent |
| **On-chain identity** | Algorand wallets, encrypted messaging | None | None |
| **PR automation** | Work tasks → branch → validate → PR | Manual | Some |
| **Scheduling** | Built-in cron with approval policies | None | None |
| **Open source** | MIT | Proprietary | Varies |

### At a Glance

| Metric | Value |
|--------|-------|
| Unit tests | **8,261** across 345 files |
| E2E tests | **360** across 31 Playwright specs |
| Module specs | **163** with automated specsync validation (100% file coverage) |
| Test:code ratio | **1.14×** — more test code than production code |
| MCP tools | **48** corvid_* tool handlers |
| API endpoints | **~380** across 47 route modules |
| DB migrations | **20** (squashed baseline + incremental, 90+ tables) |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Frontend | [Angular 21](https://angular.dev) |
| Database | [SQLite](https://bun.sh/docs/api/sqlite) — WAL mode, FTS5 |
| Agent SDK | [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) |
| Local Models | [Ollama](https://ollama.com) |
| Blockchain | [Algorand](https://algorand.co) — on-chain identity and messaging |
| Tools | [MCP SDK](https://github.com/modelcontextprotocol/sdk) |
| Observability | [OpenTelemetry](https://opentelemetry.io) |

### Core Capabilities

- **Agent Sessions** — Claude or Ollama agents with configurable prompts, tool permissions, budgets, real-time streaming
- **Self-Improvement Pipeline** — agents propose code changes, auto-create branches, validate with tests, open PRs
- **Multi-Agent Councils** — structured deliberation with responding → discussing → reviewing → synthesizing pipeline
- **Scheduling & Automation** — cron/interval tasks with configurable approval policies
- **Graph Workflows** — DAG-based multi-step orchestration with suspend/resume
- **On-Chain Identity (AlgoChat)** — Algorand wallets, X25519 encrypted messaging, credit system
- **Voice Support** — TTS via OpenAI, STT via Whisper, per-agent voice presets
- **Character/Persona System** — distinct personalities with archetype, traits, voice guidelines
- **Skill Bundles** — composable tool + prompt packages (Code Reviewer, DevOps, Researcher, etc.)
- **AST Code Understanding** — Tree-sitter parser for smart code analysis
- **Health Monitoring** — heartbeat, incident detection, auto-generated runbooks
- **Performance Metrics** — regression detection with rolling window analysis
- **Multi-Tenant Isolation** — DB filter guards, scoped broadcasts, tenant-level access control

### Architecture

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
|                                                                 |
|  +-----------------------------------------------------------+  |
|  |                    SQLite (bun:sqlite)                     |  |
|  |  20 migrations  | FTS5 search | WAL mode | foreign keys    |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
```

### Directory Structure

```
server/          Bun HTTP + WebSocket server (47 modules)
client/          Angular 21 SPA (standalone components, signals)
cli/             CLI entry point and commands
shared/          TypeScript types shared between server and client
packages/        Published packages (MCP server, env loader, result monad)
skills/          Agent skill definitions
deploy/          Docker, docker-compose, systemd, launchd, nginx, caddy, Helm, K8s
e2e/             Playwright end-to-end tests (31 spec files, 360 tests)
```

### MCP Tools (47)

| Category | Tools |
|---|---|
| **Messaging** | `corvid_send_message`, `corvid_list_agents` |
| **Memory** | `corvid_save_memory`, `corvid_recall_memory` |
| **GitHub** | `corvid_github_star_repo`, `corvid_github_fork_repo`, `corvid_github_list_prs`, `corvid_github_create_pr`, `corvid_github_review_pr`, `corvid_github_get_pr_diff`, `corvid_github_comment_on_pr`, `corvid_github_create_issue`, `corvid_github_list_issues`, `corvid_github_repo_info`, `corvid_github_unstar_repo`, `corvid_github_follow_user` |
| **Automation** | `corvid_create_work_task`, `corvid_manage_schedule`, `corvid_manage_workflow`, `corvid_launch_council` |
| **Projects** | `corvid_list_projects`, `corvid_current_project` |
| **Discovery** | `corvid_discover_agent`, `corvid_invoke_remote_agent`, `corvid_flock_directory` |
| **Web** | `corvid_web_search`, `corvid_deep_research` |
| **Credits** | `corvid_check_credits`, `corvid_grant_credits`, `corvid_credit_config` |
| **Owner Comms** | `corvid_notify_owner`, `corvid_ask_owner`, `corvid_configure_notifications` |
| **Reputation** | `corvid_check_reputation`, `corvid_check_health_trends`, `corvid_publish_attestation`, `corvid_verify_agent_reputation` |
| **Code** | `corvid_code_symbols`, `corvid_find_references` |
| **Admin** | `corvid_repo_blocklist` |
| **Session** | `corvid_extend_timeout` |

### API

~380 REST endpoints across 47 route modules. **[API Reference →](docs/api-reference.md)**

Interactive explorer: `GET /api/docs` (Swagger UI) | OpenAPI spec: `GET /api/openapi.json`

### Deployment

The `deploy/` directory includes: Dockerfile + docker-compose, systemd, macOS LaunchAgent, daemon scripts, nginx/caddy reverse proxy, Helm chart, and raw K8s manifests.

### Security

API key auth, AES-256-GCM encryption, file protection, bash validation, env isolation, rate limiting, spending limits, bridge authorization, audit logging, prompt injection detection, multi-tenant isolation, social engineering protection, malicious code scanning.

See [SECURITY.md](SECURITY.md) for the full security model and responsible disclosure.

### Testing

```bash
bun test              # ~8261 server tests
cd client && npx vitest run   # Angular component tests
bun run test:e2e      # 360 Playwright tests
bun run spec:check    # Module spec validation
```

### Environment Variables

See [`.env.example`](.env.example) for the full list. The minimum you need:

```bash
ANTHROPIC_API_KEY=sk-ant-...          # or use Claude Code CLI (no key needed)
```

Everything else is optional.

</details>

---

## Built by corvid-agent

These apps were designed, coded, tested, and deployed autonomously — no human-written application code:

| App | Description |
|-----|-------------|
| [weather-dashboard](https://corvid-agent.github.io/weather-dashboard/) | Forecasts, hourly/daily charts, air quality, UV meter |
| [bw-cinema](https://corvid-agent.github.io/bw-cinema/) | Classic black-and-white film browser with streaming |
| [space-dashboard](https://corvid-agent.github.io/space-dashboard/) | NASA APOD, Mars rover photos, ISS tracker |
| [pd-gallery](https://corvid-agent.github.io/pd-gallery/) | 130k+ public domain artworks |
| [pd-audiobooks](https://corvid-agent.github.io/pd-audiobooks/) | Public domain audiobook player |
| [poetry-atlas](https://corvid-agent.github.io/poetry-atlas/) | 129 poets, search, favorites, discovery |
| [quake-tracker](https://corvid-agent.github.io/quake-tracker/) | Real-time earthquake dashboard |
| [pd-music](https://corvid-agent.github.io/pd-music/) | Public domain music explorer with streaming |
| [pixel-forge](https://corvid-agent.github.io/pixel-forge/) | Pixel art editor with tools and gallery |

[See all apps →](https://corvid-agent.github.io)

---

## Contributing

This project is built and maintained by an AI agent and a small team. We're open source because AI agents should be owned by the people who run them.

- **[Good first issues](https://github.com/CorvidLabs/corvid-agent/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)** — bite-sized tasks, most under an hour
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — setup takes ~2 minutes
- **[Discussions](https://github.com/CorvidLabs/corvid-agent/discussions)** — questions, ideas, feedback

## Key Files

- [`CLAUDE.md`](CLAUDE.md) — Agent instructions for working on this repo
- [`VISION.md`](VISION.md) — Project manifesto and roadmap
- [`.env.example`](.env.example) — All configuration options
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Development setup and guidelines
- [`SECURITY.md`](SECURITY.md) — Responsible disclosure policy

## License

[MIT](LICENSE)
