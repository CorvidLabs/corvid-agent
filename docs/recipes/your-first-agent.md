# Your First Agent

Go from zero to a working AI developer agent in about 5 minutes.

**What you'll build:** A corvid-agent instance connected to a GitHub repo, capable of writing code, opening pull requests, and responding to requests in plain English.

---

## Prerequisites

- Git installed
- Node.js 20+ or [Bun](https://bun.sh) installed
- A GitHub personal access token ([create one here](https://github.com/settings/tokens) — scopes: `repo`, `read:org`, `read:user`)
- An AI provider (Claude API key, Claude CLI, or Ollama)

---

## Step 1: Clone and install

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
cp .env.example .env
bun install
```

Expected output:
```
✓ 847 packages installed [12.3s]
```

---

## Step 2: Configure your environment

Open `.env` in your editor. Set at minimum:

```bash
# AI provider (pick one)
ANTHROPIC_API_KEY=sk-ant-...          # Claude API
# OR: leave blank if you have Claude CLI or Ollama installed

# GitHub (for code tasks)
GH_TOKEN=ghp_...                      # Personal access token

# Target repository
DEFAULT_PROJECT_REPO=owner/my-repo   # Where your agent will work
```

> **Tip:** If you have `claude` CLI installed globally, you can skip `ANTHROPIC_API_KEY` entirely. The agent will use it automatically.

---

## Step 3: Start the server

```bash
bun run dev
```

Expected output:
```
corvid-agent v0.59.0
✓ Database initialized (migrations: 111)
✓ Agent "CorvidAgent" ready
✓ Server listening on http://localhost:3000
```

Open `http://localhost:3000` in your browser. You should see the dashboard.

---

## Step 4: Meet your agent

1. Click **Agents** in the sidebar — you'll see "CorvidAgent" (or whatever you named it)
2. Click the agent, then **New Session**
3. Type your first request:

```
Write a function that validates an email address. Add tests for it.
```

Watch in real time as the agent:
- Creates a new git branch
- Writes the function in your codebase
- Writes tests
- Runs the tests
- Opens a pull request

**Expected output in the session:**

```
I'll create a utility function for email validation with comprehensive tests.

Creating branch: feature/email-validator-abc123

Writing src/utils/email-validator.ts...
Writing src/utils/email-validator.test.ts...

Running tests...
✓ validates correct email formats (8 tests)
✓ rejects malformed emails (12 tests)

Opening PR #47: "Add email validation utility with tests"
https://github.com/owner/my-repo/pull/47
```

---

## Step 5: Refine and iterate

The agent holds context within a session. Ask follow-up questions:

```
Add support for validating disposable email domains.
Block common ones like mailinator.com and guerrillamail.com.
```

The agent will update the same branch and push the changes.

---

## Common gotchas

**"Agent is not responding"**
- Check that `bun run dev` is still running in your terminal
- Look at the terminal output for errors
- Verify your API key is set correctly in `.env`

**"Permission denied on GitHub"**
- Your `GH_TOKEN` needs `repo` scope (not just `read:repo`)
- Check the token hasn't expired at `https://github.com/settings/tokens`

**"No such repository"**
- Set `DEFAULT_PROJECT_REPO=owner/repo` in `.env` (replace with your actual repo)
- The agent needs to be able to clone it — ensure the token has access

**Agent creates branches but no PRs**
- The target repo needs branch protection disabled for the agent's user, OR
- Grant the token `pull_request:write` scope

---

## What's next?

- [Multi-agent orchestration](multi-agent-orchestration.md) — run specialized agents in parallel
- [Production deployment](production-deployment.md) — Docker, systemd, and hardening
- [Cookbook](../cookbook.md) — copy-paste recipes for common workflows
- [Discord integration](../cookbook.md#set-up-discord-bot) — chat with your agent from Discord
