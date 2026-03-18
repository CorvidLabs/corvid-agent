# Quickstart: Your First Agent in 5 Minutes

Get corvid-agent running and have an AI agent open a real PR on a test repo.

---

## Choose your path

| I want to... | Command | Time | API keys needed? |
|--------------|---------|------|-----------------|
| **Try it instantly** | `git clone && bun run try` | 30 sec | No |
| **See a CLI demo** | `corvid-agent demo` | 1 min | No |
| **Set up for real** | `corvid-agent init` | 5 min | Yes |

**New here?** Start with `bun run try` — it launches a sandbox with an in-memory database, a pre-created agent, and the dashboard. No `.env` or API keys needed. When you're ready for the real thing, come back to step 1 below.

---

## 1. Install and start (2 minutes)

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
corvid-agent init       # guided setup: env, deps, first agent
bun run dev
```

The `init` command checks prerequisites (Bun 1.3+, Git), creates `.env`, prompts for API keys, installs dependencies, builds the dashboard, and creates your first agent.

For non-interactive setup: `corvid-agent init --yes` (auto-detects Claude CLI / Ollama).

For MCP + Agent Skills (Claude Code / Cursor / Copilot): `corvid-agent init --mcp`.

Open **http://localhost:3000** — you should see the dashboard.

### System requirements

See the [System Requirements](system-requirements.md) guide for detailed hardware tiers. In short: 8 GB RAM minimum (CLI + Claude API only), 16 GB recommended (agent + IDE), 32 GB for the full stack with Docker.

### What you need

| Mode | What to set | What you get |
|------|-------------|--------------|
| **Claude** (recommended) | `ANTHROPIC_API_KEY=sk-ant-...` in `.env` | Full agent capabilities, tool use, PRs |
| **Claude Code CLI** | Install [Claude Code](https://claude.com/claude-code) | Uses your existing subscription, no API key needed |
| **Local only** | Install [Ollama](https://ollama.com) + pull a model 8B+ | Free, private, no API keys — but slower and less capable |

Pick one. You can always add more later.

---

## 2. Create your first agent (1 minute)

Open the dashboard at **http://localhost:3000** and click **Agents** in the sidebar.

Or use the API:

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-first-agent",
    "model": "claude-sonnet-4-20250514",
    "systemPrompt": "You are a helpful development agent. You write clean code, add tests, and explain your changes."
  }'
```

Save the `id` from the response — you'll need it next.

---

## 3. Start a session and chat (1 minute)

```bash
# Replace AGENT_ID with the id from step 2
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID",
    "workingDir": "/tmp/test-project"
  }'
```

Now open the dashboard — your session appears under **Sessions**. Click it to chat in real time.

Or resume the session with a follow-up prompt via API:

```bash
# Replace SESSION_ID with the id from the session response
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/resume \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a simple TypeScript hello world project with a test file"}'
```

Watch the agent work in the dashboard — it reads files, writes code, and runs commands.

---

## 4. Have the agent open a PR (1 minute)

For this you need a `GH_TOKEN` in your `.env` with repo access. Then:

```bash
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/resume \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a new branch, commit your changes, and open a PR on my-username/my-test-repo"}'
```

The agent will:
1. Create a branch
2. Commit its changes
3. Push to GitHub
4. Open a PR with a description of what it did

That's it. You have a working AI development agent.

---

## 5. What to try next

### Give it a personality

```bash
curl -X PUT http://localhost:3000/api/agents/AGENT_ID/persona \
  -H "Content-Type: application/json" \
  -d '{
    "archetype": "Senior Engineer",
    "traits": ["thorough", "opinionated", "concise"],
    "voiceGuidelines": "Be direct. No fluff. Code speaks."
  }'
```

### Assign a skill bundle

Skill bundles filter which tools an agent can use and add role-specific prompts.

```bash
# List available presets
curl http://localhost:3000/api/skill-bundles

# Assign "Code Reviewer" to your agent
curl -X POST http://localhost:3000/api/agents/AGENT_ID/skills \
  -H "Content-Type: application/json" \
  -d '{"bundleId": "BUNDLE_ID"}'
```

### Set up a schedule

Have the agent run automatically:

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID",
    "name": "morning-review",
    "cronExpression": "0 9 * * *",
    "actions": [{"type": "custom", "prompt": "Review open PRs on my-org/my-repo and leave constructive feedback"}],
    "approvalPolicy": "auto"
  }'
```

### Connect Telegram or Discord

Add to `.env` and restart:

```bash
# Telegram — talk to your agent from your phone
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_ALLOWED_USER_IDS=your-telegram-user-id

# Discord — talk to your agent from Discord
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CHANNEL_ID=your-channel-id
```

### Enable on-chain identity (AlgoChat)

Give your agent a verifiable identity on Algorand:

```bash
ALGOCHAT_MNEMONIC=your 25 word mnemonic here
ALGORAND_NETWORK=localnet   # localnet for local dev (free, instant)
```

For local development, start Algorand localnet first: `algokit localnet start` (requires Docker).

See [testnet-onboarding.md](testnet-onboarding.md) for multi-machine / testnet setup.

### Use the CLI

```bash
# Interactive REPL
corvid-agent

# One-shot command
corvid-agent chat "What open issues need attention on my-org/my-repo?"
```

---

## Troubleshooting

### Server won't start
- Check `bun --version` is 1.3+
- Check `.env` exists (copy from `.env.example`)
- Check port 3000 isn't already in use: `lsof -i :3000`

### Agent doesn't respond
- Check logs: the terminal running `bun run dev` shows all activity
- Verify your API key: `curl -s https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"` should not return 401
- For Ollama: verify it's running (`curl http://localhost:11434/api/tags`) and you have a model 8B+

### PR creation fails
- Verify `GH_TOKEN` has `repo` scope
- Verify `gh auth status` works
- The agent needs push access to the target repo

### Dashboard is blank
- Rebuild: `bun run build:client`
- Check browser console for errors

---

## Architecture at a glance

```
You (browser/Telegram/Discord/CLI)
  |
  v
corvid-agent server (Bun, port 3000)
  |-- Dashboard (Angular 21)
  |-- REST API + WebSocket
  |-- Agent sessions (Claude SDK / Ollama)
  |-- 44 MCP tools (GitHub, memory, messaging, code analysis, ...)
  |-- SQLite database (sessions, agents, schedules, wallets, ...)
  |-- AlgoChat (optional on-chain messaging via Algorand)
```

Everything runs locally. No cloud dependencies except the AI provider you choose.

---

## Further reading

- [How It Works](how-it-works.md) — the agent execution loop explained
- [Use Cases](use-cases.md) — practical examples: PR reviews, CI fixes, test generation, and more
- [Self-Hosting Guide](self-hosting.md) — production deployment with Docker, systemd, TLS
- [Testnet Onboarding](testnet-onboarding.md) — multi-tenant mode and AlgoChat setup
- [VISION.md](../VISION.md) — project manifesto and roadmap
- [CONTRIBUTING.md](../CONTRIBUTING.md) — development workflow
