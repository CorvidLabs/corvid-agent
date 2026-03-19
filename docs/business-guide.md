# Business Guide

How to use corvid-agent to help your team ship faster, handle support, and automate the work nobody wants to do.

---

## What corvid-agent does for your business

corvid-agent is an AI developer that works for your team 24/7. It can:

- **Review every pull request** before a human looks at it — catching bugs, security issues, and style problems in minutes instead of days
- **Answer support questions** in Discord or Slack — reducing ticket volume and response time
- **Write and fix code** — from bug fixes to new features, validated with tests before it opens a PR
- **Keep documentation in sync** — detects when docs drift from code and opens PRs to fix them
- **Triage incoming issues** — labels, prioritizes, and responds to new GitHub issues automatically
- **Generate reports** — weekly summaries of what shipped, what's in review, what's blocked

It runs on your infrastructure. Your code stays private. The AI model runs locally (free with Ollama) or via Claude API (~$3/hour of active use).

---

## Getting started for your team

### Step 1: Install (2 minutes)

One person runs the installer on a shared server or their machine:

```bash
curl -fsSL https://raw.githubusercontent.com/CorvidLabs/corvid-agent/main/scripts/install.sh | bash
```

The dashboard opens at `http://localhost:3000`.

### Step 2: Connect GitHub (2 minutes)

This lets the agent read your repos, review PRs, and open pull requests.

1. Create a [GitHub personal access token](https://github.com/settings/tokens/new) with `repo` scope
2. Add it to `.env`: `GH_TOKEN=ghp_your_token_here`
3. Restart the server

### Step 3: Set up your first automation (5 minutes)

**Example: Auto-review PRs every 15 minutes**

Go to **Schedules** in the dashboard and create:

- **Name:** PR Review Bot
- **Schedule:** `*/15 * * * *` (every 15 minutes)
- **Prompt:** "Check for open PRs on my-org/my-repo that haven't been reviewed. For each one, read the diff, check for bugs and security issues, and post a constructive review comment."
- **Approval policy:** Auto

That's it. The agent now reviews every PR your team opens.

### Step 4: Connect chat (optional, 5 minutes)

Let your team talk to the agent from Discord or Slack:

**Discord:**
```bash
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CHANNEL_ID=your-channel-id
```

**Slack:**
```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL_ID=your-channel-id
```

---

## Common team setups

### Small team (2-10 people)

- 1 agent running on a team server or senior dev's machine
- Auto PR review on your main repos
- Discord/Slack integration for questions
- Manual approval for PRs the agent creates

### Growing team (10-50 people)

- Dedicated server running corvid-agent
- Multiple agents with different specialties (code reviewer, test writer, support responder)
- Scheduled daily reports on PR velocity and issue backlog
- GitHub webhook integration for real-time response to new issues

### Large team (50+ people)

- Docker deployment on your infrastructure
- Multi-tenant mode for separate teams/projects
- API key per team for access control
- Supervised mode (agents queue actions for human approval)
- See the [Enterprise Guide](enterprise.md) for details

---

## What it costs

| Setup | AI cost | Infrastructure cost |
|-------|---------|-------------------|
| **Ollama (local)** | Free | Your existing hardware (8 GB RAM minimum) |
| **Claude API** | ~$3/hour of active use | Your existing hardware |
| **Claude Code CLI** | Uses your existing subscription | Your existing hardware |

The agent only uses AI when it's actively working (reviewing a PR, writing code, answering a question). Idle time costs nothing.

---

## Security and privacy

- **Your code stays on your machine** — corvid-agent runs locally, not in the cloud
- **API key authentication** — required when the server is exposed beyond localhost
- **Protected files** — `.env`, credentials, and security-sensitive files are blocked from agent access
- **Rate limiting** — prevents abuse on all endpoints
- **Audit logging** — every action is logged and reviewable

For enterprise-grade security features (RBAC, multi-tenant isolation, container sandboxing), see the [Enterprise Guide](enterprise.md).

---

## ROI examples

### PR review automation
- **Before:** PRs wait 1-3 days for review. Bugs slip through. Developer context-switching to review costs ~2 hours/day per senior engineer.
- **After:** Every PR gets initial review in minutes. Obvious bugs caught before human review. Senior engineers review agent-flagged items only, saving ~1.5 hours/day.
- **Estimated saving:** 30 engineering hours/month for a team of 10.

### Support automation
- **Before:** 3 engineers rotate on support duty. 60% of questions are answered by linking to existing docs.
- **After:** Agent handles the 60% of questions with docs links. Engineers only handle complex escalations.
- **Estimated saving:** 40 support hours/month.

### Test generation
- **Before:** Test coverage at 60%. Nobody has time to write tests for existing code.
- **After:** Agent writes tests for untested files weekly, opening PRs for review.
- **Estimated gain:** 5-10% coverage improvement per month with zero developer effort.

---

## Next steps

- **[Quickstart](quickstart.md)** — Install and get running
- **[Use Cases](use-cases.md)** — Detailed examples with API calls
- **[Enterprise Guide](enterprise.md)** — Multi-tenant, compliance, deployment at scale
- **[Configuration](configuration.md)** — All environment variables explained
