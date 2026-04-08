<p align="center">
  <img src="https://img.shields.io/badge/version-0.62.2-blue" alt="Version">
  <a href="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml"><img src="https://github.com/CorvidLabs/corvid-agent/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/github/license/CorvidLabs/corvid-agent" alt="License">
  <a href="https://codecov.io/gh/CorvidLabs/corvid-agent"><img src="https://codecov.io/gh/CorvidLabs/corvid-agent/graph/badge.svg" alt="Coverage"></a>
</p>

# corvid-agent

**Your own AI developer.** Tell it what you need — it writes the code, opens pull requests, and ships it.

No coding experience required. You describe what you want in plain English, and your agent builds it.

**[Website](https://corvid-agent.github.io)** | **[Docs](docs/README.md)** | **[Examples](docs/use-case-gallery.md)** | **[Blog](https://corvid-agent.github.io/blog)** | **[API Reference](docs/api-reference.md)**

---

## Quick start

**Option A — one-line installer** (auto-detects everything):
```bash
curl -fsSL https://raw.githubusercontent.com/CorvidLabs/corvid-agent/main/scripts/install.sh | bash
```

**Option B — clone and setup**:
```bash
git clone https://github.com/CorvidLabs/corvid-agent.git && cd corvid-agent
bun run setup              # guided wizard: detects AI provider, creates .env, installs deps
bun run dev                # starts server + dashboard at http://localhost:3000
```

**Option C — Docker** (no Bun/Node required):
```bash
git clone https://github.com/CorvidLabs/corvid-agent.git && cd corvid-agent
cp .env.example .env       # edit with your API keys (or leave defaults for local Ollama)
docker compose up -d       # builds and starts at http://localhost:3000
```

Add corvid-agent tools to your AI editor (Claude Code, Cursor, Copilot):

```bash
corvid-agent init --mcp    # configures MCP server + copies Agent Skills
```

**[Full setup guide →](docs/quickstart.md)** | **[MCP setup →](docs/mcp-setup.md)** | **[VibeKit integration →](docs/vibekit-integration.md)**

> **New here?** See what you can build: [Use-case gallery →](docs/use-case-gallery.md) | [Step-by-step recipes →](docs/recipes/your-first-agent.md)

---

## What is corvid-agent?

An open-source AI agent platform that writes code, opens pull requests, and ships software. It combines LLM-powered coding with on-chain identity (Algorand/AlgoChat), multi-agent orchestration, and integrations with Discord, Telegram, Slack, and GitHub.

You describe what you want in plain English. Your agent designs, codes, tests, and deploys it.

---

## What can it build?

- "Build me a weather dashboard" → [it built this](https://corvid-agent.github.io/weather-dashboard/)
- "Make a movie browser for classic films" → [it built this](https://corvid-agent.github.io/bw-cinema/)
- "I need an earthquake tracker" → [it built this](https://corvid-agent.github.io/quake-tracker/)
- "Create a poetry explorer" → [it built this](https://corvid-agent.github.io/poetry-atlas/)
- "Build a pixel art editor" → [it built this](https://corvid-agent.github.io/pixel-forge/)

Every app above was designed, coded, tested, and deployed by corvid-agent — zero human-written application code. [See all apps →](https://corvid-agent.github.io)

---

## Who is it for?

| | What you get |
|---|---|
| **Creators** — have ideas but don't code | Describe what you want in plain English. It designs, codes, and deploys. **[Get started →](docs/quickstart.md)** |
| **Developers** — write code and want help | Automated PR reviews, CI fixes, test generation, issue triage. **[Use-case gallery →](docs/use-case-gallery.md)** |
| **Teams** — need AI to handle dev work | Agents review code, write features, ship PRs. **[Business guide →](docs/business-guide.md)** |
| **Enterprise** — need security, compliance, scale | Multi-tenant, RBAC, audit trails, Docker/K8s. **[Enterprise guide →](docs/enterprise.md)** |

---

## Talk to it from anywhere

| Channel | What you need |
|---------|--------------|
| **Web dashboard** | Nothing — included at `http://localhost:3000` |
| **Terminal** | `corvid-agent` (interactive CLI) |
| **Discord / Telegram / Slack** | Add a bot token to `.env` |
| **Your AI editor** | `corvid-agent init --mcp` (Claude Code, Cursor, Copilot, etc.) |

---

## Extend with VibeKit (Algorand smart contracts)

corvid-agent handles dev orchestration. [VibeKit](https://getvibekit.ai) handles blockchain operations. Together they give you a complete Algorand development stack:

```bash
corvid-agent init --mcp    # add corvid-agent MCP tools
vibekit init               # add blockchain MCP tools (deploy, assets, indexer)
```

Your AI editor gets 50 corvid-agent tools (code, GitHub, scheduling, agents) plus 42 VibeKit tools (contract deploy, ASA management, transaction signing) — all working side by side.

**[VibeKit integration guide →](docs/vibekit-integration.md)**

---

## Agent Skills (skills-as-markdown)

Skills are markdown files in `.skills/` or `skills/` that teach AI assistants how to use corvid-agent. Each skill has a short description for discovery and a full body loaded on demand:

```
skills/
  coding/SKILL.md          # File operations, shell commands
  github/SKILL.md          # PRs, issues, reviews
  smart-contracts/SKILL.md # VibeKit + Algorand contract tools
  scheduling/SKILL.md      # Cron-based task automation
  ...30 skills total
```

`corvid-agent init --mcp` copies skills to your editor automatically. **[Skill list →](skills/README.md)**

---

## Tech stack

Bun + Angular 21 + SQLite + Claude Agent SDK + Algorand (on-chain identity). 65 MCP tools, 382 API endpoints, 1,286 test files, 212 module specs.

**[Architecture →](docs/how-it-works.md)** | **[Security →](SECURITY.md)** | **[Deployment →](docs/self-hosting.md)**

---

## Contributing

Open source because AI agents should be owned by the people who run them.

- **[Good first issues](https://github.com/CorvidLabs/corvid-agent/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)**
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — setup takes ~2 minutes
- **[Discussions](https://github.com/CorvidLabs/corvid-agent/discussions)**

## License

[MIT](LICENSE)
